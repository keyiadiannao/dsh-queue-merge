/**
 * dsh-queue-merge — host half.
 *
 * Queue Coalescing for DeepSeek Harness: while the agent is busy, the user can
 * keep queueing follow-up messages (official inbox). Normally the agent claims
 * ONE queued prompt per turn, so N corrections become N turns — "do a bit,
 * get corrected, redo, get corrected again". This plugin adds a third queue
 * consumption policy:
 *
 *   queue individually  (official default: one message per turn)
 *   queue + merge       (this plugin: freeze the batch at the turn boundary,
 *                        call the SAME model that will execute to consolidate
 *                        every queued message into ONE new formal user prompt,
 *                        then run that consolidated prompt as the turn's user
 *                        message — the raw messages are replaced, not replayed)
 *
 * Consolidation model (user-defined): the point is to let the model look at
 * the COMPLETE queued demand at once, integrate it (apply corrections, merge
 * related requests, keep unrelated ones as numbered points), and emit a single
 * clean prompt the agent then executes. Consolidating is a lossy rewrite by
 * nature; a dropped detail is acceptable. The one hard line kept from the
 * instruction-hierarchy idea: the consolidated prompt must never invent
 * permissions the user did not state, so the merge cannot widen the agent's
 * authority. Zero-loss guarantee: consolidation runs BEFORE the inbox is
 * touched, so a failed call falls back to the official one-message-per-turn
 * behavior with nothing dropped.
 *
 * Hook seam: `agent/pre-step` is a public waterfall (same one hooks-codex,
 * plan-mode, agent-instructions etc. use). It receives the claimed
 * `messages` batch plus the `agent` (whose inbox exposes pending queued
 * items), and can return an `enter` decision with extra context messages.
 *
 * @module dsh-queue-merge
 */

import z from '@deepseek-ai/schemastery'
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'

export const name = 'dsh-queue-merge'

export const inject = ['llm', 'webServer']

const BASE = '/api/dsh-queue-merge'

/** Plugin configuration (editable via the profile's cordis config / settings). */
export interface Config {
  /** Default queue policy: 'merge' or 'individually'. The client can switch
   * per-batch while the agent is busy; this is the fallback default. */
  defaultMode: 'merge' | 'individually'
  /** Minimum queued messages before merging applies (1 = always when >= 1). */
  minQueueForMerge: number
  /** Provider/model override for the synthesis call. Empty = reuse the
   * session's routed model. */
  synthesisProvider: string
  synthesisModel: string
}

/** Schemastery schema; cordis validates and provides it as apply(ctx, config). */
export const Config: z<Config> = z.object({
  defaultMode: z.union([z.const('merge'), z.const('individually')]).default('merge'),
  minQueueForMerge: z.number().min(1).max(20).default(2),
  synthesisProvider: z.string().default(''),
  synthesisModel: z.string().default(''),
})

/**
 * The consolidation instruction. The consolidation model (normally the SAME
 * model that will execute) rewrites the whole queued batch into ONE clean,
 * complete, formal user prompt. That consolidated prompt REPLACES the raw
 * messages as the new official user message of the turn — the agent executes
 * the consolidated version, not the pile of raw messages. Consolidating a
 * batch is a lossy rewrite by nature; a dropped detail is acceptable as long
 * as no permission the user never stated is invented.
 */
const SYNTHESIS_INSTRUCTION = `You are the message consolidator.
Below is a batch of messages the user sent while the agent was working
(possibly N separate messages: additions to one task, corrections of earlier
messages, or several unrelated requests).

Integrate them into ONE coherent, complete, directly executable user prompt:
- Keep EVERY distinct request, constraint, and detail the user stated — do not
  drop any of them.
- When a later message corrects an earlier one on the same thing, the later
  one wins; unrelated later messages do NOT cancel earlier ones.
- Order related steps sensibly; list unrelated requests as separate numbered
  points and keep all of them.
- Do not invent requirements, tasks, or permissions the user did not state.
- Write in the same language as the user's messages.
- Output ONLY the consolidated prompt text — no preamble, no explanation, no JSON.

QUEUED USER MESSAGES:
`

/** Context message the execution turn receives carrying the synthesis brief. */
const SYNTHESIS_SOURCE = { kind: 'plugin', plugin: 'dsh-queue-merge' } as const

/** Per-session queue policy, switchable from the client while busy. */
export interface QueuePolicy {
  mode: 'merge' | 'individually'
}

/**
 * Apply: register the agent/pre-step hook that implements merge mode.
 * The hook is deliberately conservative:
 *  - merge applies only when (a) policy is merge AND (b) queued+claimed count
 *    is >= minQueueForMerge.
 *  - consolidation runs BEFORE any inbox mutation: a failed consolidation
 *    degrades gracefully to the official one-message-per-turn behavior with
 *    zero loss (nothing has been spliced yet).
 */
export function apply(ctx: any, config: Config): void {
  const policies = new Map<string, QueuePolicy>()

  // Client policy switch: POST /api/dsh-queue-merge/policy { sessionId, mode }.
  // Same-origin guard (loopback + Host check) like the official trust fence —
  // this only flips a per-session mode, but keep the destructive-style fence
  // for consistency with other mutation POSTs.
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: BASE,
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'method not allowed' }))
        return
      }
      const address = req.socket?.remoteAddress
      if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') {
        res.writeHead(403, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'forbidden: non-loopback' }))
        return
      }
      const host = req.headers.host
      if (typeof host !== 'string') {
        res.writeHead(403, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'forbidden: missing host' }))
        return
      }
      try {
        const hn = new URL(`http://${host}`).hostname
        if (hn !== '127.0.0.1' && hn !== '::1' && hn !== '[::1]' && hn !== 'localhost') {
          res.writeHead(403, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'forbidden: bad host' }))
          return
        }
      } catch {
        res.writeHead(403, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'forbidden: bad host' }))
        return
      }
      try {
        const body = JSON.parse(await readBody(req)) as { sessionId?: string; mode?: string }
        if (typeof body.sessionId !== 'string' || body.sessionId.length === 0) {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'missing sessionId' }))
          return
        }
        const mode = body.mode === 'individually' ? 'individually' : body.mode === 'merge' ? 'merge' : config.defaultMode
        policies.set(body.sessionId, { mode })
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true, sessionId: body.sessionId, mode }))
      } catch (e) {
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : 'bad request' }))
      }
    },
  }), 'dsh-queue-merge: policy route')

  ctx.on('agent/pre-step', async ({ agent, messages, signal }: {
    agent: { session: { id?: unknown }; inbox?: { nextTurn?: readonly { content?: unknown; id?: unknown }[]; splice?: (target: string, start: number, deleteCount: number, inserted: unknown[]) => unknown[] } };
    messages: readonly { content?: unknown }[];
    signal?: AbortSignal;
  }, next: () => Promise<unknown>): Promise<unknown> => {
    // Only when there is actually an entering batch of user messages.
    if (messages.length === 0) return next()
    const sessionId = String(agent.session.id)
    const policy = policies.get(sessionId)?.mode ?? config.defaultMode
    if (policy !== 'merge') return next()

    // The official loop claims ONE queued prompt per turn (inbox.nextTurn[0]).
    // In merge mode the whole queued batch is consolidated into ONE new formal
    // user prompt that REPLACES the raw messages for this turn.
    const inbox = agent.inbox
    // SNAPSHOT the pending list once, at hook entry: `inbox.nextTurn` is a live
    // array reference, and a message appended DURING the consolidation call
    // must NOT be pulled into this batch — it stays queued for the next turn.
    const pendingSnapshot = [...(inbox?.nextTurn ?? [])]
    const total = messages.length + pendingSnapshot.length
    // eslint-disable-next-line no-console
    console.log(`[dsh-queue-merge] pre-step: session=${sessionId.slice(0,8)} policy=${policy} entering=${messages.length} pendingNextTurn=${pendingSnapshot.length} total=${total} min=${config.minQueueForMerge}`)
    if (total < Math.max(1, config.minQueueForMerge)) return next()

    const downstream = await next()
    if (downstream === null || typeof downstream !== 'object' || (downstream as { kind?: string }).kind !== 'enter') {
      return downstream
    }

    // Consolidate BEFORE touching the inbox (zero-loss): if the consolidation
    // call fails, the pending messages stay queued and the official loop keeps
    // processing them one per turn — nothing is ever dropped.
    const all = [...messages, ...pendingSnapshot]
    const consolidated = await synthesizeBrief(ctx, agent, all, config, signal)
    // eslint-disable-next-line no-console
    console.log(`[dsh-queue-merge] consolidated=${consolidated === null ? 'FAILED(null)' : `ok(${consolidated.length} chars)`}`)
    if (consolidated === null) return downstream // consolidation failed → official behavior, zero loss

    // Consolidation succeeded: now durably pull out EXACTLY the snapshotted
    // queued prompts (pendingSnapshot.length, not the live length) so messages
    // that arrived mid-consolidation stay queued for the next turn.
    let extra: readonly { content?: unknown }[] = []
    if (inbox?.splice && pendingSnapshot.length > 0) {
      try {
        extra = inbox.splice('next-turn', 0, pendingSnapshot.length, []) as readonly { content?: unknown }[]
        // eslint-disable-next-line no-console
        console.log(`[dsh-queue-merge] spliced ${extra.length} queued prompts out of inbox`)
      } catch (e) {
        // eslint-disable-next-line no-console
        console.log(`[dsh-queue-merge] splice failed: ${String(e)}`)
        return downstream // splice failed → official behavior; pending stays queued
      }
    }

    const enter = downstream as { kind: 'enter'; messages: unknown[] }
    // The official enter decision contains the claimed messages followed by the
    // system context injection (AGENTS.md etc.). Keep the context, drop the raw
    // claimed batch (its content is consolidated into the new prompt).
    const contextMsgs = enter.messages.slice(messages.length)
    // The consolidated prompt IS the new official user message of this turn.
    const consolidatedMessage = createUserMessage({
      content: [{ type: 'text', text: consolidated }],
      source: SYNTHESIS_SOURCE,
    })
    return {
      kind: 'enter',
      messages: [consolidatedMessage, ...contextMsgs],
    }
  }, 'dsh-queue-merge: pre-step consolidation')
}

/**
 * Run the consolidation LLM call: rewrite the whole queued batch into ONE new
 * formal user prompt. Reuses the session's routed model unless config
 * overrides it (same pattern as compaction's summarizeWithLlm).
 * Returns the consolidated prompt text, or null on any failure (never throws
 * into the agent loop — a null simply means "keep the official behavior").
 */
async function synthesizeBrief(
  ctx: any,
  agent: { session: { requestHeader?: () => { config?: { provider?: string; model?: string } }; id?: unknown }; options: { provider?: string; model?: string } },
  messages: readonly { content: unknown; id?: unknown }[],
  config: Config,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const latest = agent.session.requestHeader?.()?.config
    const configured = config.synthesisProvider.length > 0 && config.synthesisModel.length > 0
      ? { provider: config.synthesisProvider, model: config.synthesisModel }
      : undefined
    const agentTarget = agent.options.provider !== undefined && agent.options.provider.length > 0
      && agent.options.model !== undefined && agent.options.model.length > 0
      ? { provider: agent.options.provider, model: agent.options.model }
      : undefined
    const target = configured ?? latest ?? agentTarget
    if (target === undefined) {
      // eslint-disable-next-line no-console
      console.log(`[dsh-queue-merge] synthesis: no provider/model (configured=${config.synthesisProvider}/${config.synthesisModel} latest=${JSON.stringify(latest)} agent=${agent.options.provider}/${agent.options.model})`)
      return null
    }

    const userBlocks = messages.map((m, i) => {
      const content = (m as { content?: unknown }).content
      const text = Array.isArray(content)
        ? content.map((b) => typeof b === 'object' && b !== null && (b as { type?: string }).type === 'text'
          ? (b as { text?: string }).text ?? ''
          : '[non-text block]').join('\n')
        : String(content ?? '')
      return `#${i + 1}\n${text}`
    }).join('\n\n')

    const promptMessages = [
      createUserMessage({
        // SYNTHESIS_INSTRUCTION already ends with "QUEUED USER MESSAGES:".
        content: [{ type: 'text', text: `${SYNTHESIS_INSTRUCTION}\n${userBlocks}` }],
        source: SYNTHESIS_SOURCE,
      }),
    ]

    const assembler = new BlockAssembler()
    const options = {
      provider: target.provider,
      model: target.model,
      messages: promptMessages,
      maxTokens: 800,
      sessionId: agent.session.id,
      // 'compaction' is the closest registered auxiliary purpose (the schema
      // only admits 'compaction' | 'session-title'); a custom value would be
      // rejected by adapters at runtime.
      purpose: 'compaction' as const,
      ...signal === undefined ? {} : { signal },
    }
    for await (const chunk of ctx.llm.stream(options)) assembler.push(chunk)
    const text = assembler.blocks()
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text?: string }).text ?? '')
      .join('')
      .trim()
    return text.length > 0 ? text : null
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log(`[dsh-queue-merge] synthesis error: ${e instanceof Error ? e.message : String(e)}`)
    return null
  }
}

/** Read a request body as UTF-8 text (bounded). */
function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 64 * 1024) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}
