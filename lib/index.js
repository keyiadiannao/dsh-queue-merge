import z from "@deepseek-ai/schemastery";
import { BlockAssembler, createUserMessage } from "@deepseek-ai/dsh-llm";
//#region src/index.ts
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
const name = "dsh-queue-merge";
const inject = ["llm", "webServer"];
const BASE = "/api/dsh-queue-merge";
/** Schemastery schema; cordis validates and provides it as apply(ctx, config). */
const Config = z.object({
	defaultMode: z.union([z.const("merge"), z.const("individually")]).default("merge"),
	minQueueForMerge: z.number().min(1).max(20).default(2),
	synthesisProvider: z.string().default(""),
	synthesisModel: z.string().default("")
});
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
- Output ONLY the consolidated prompt text — no preamble, no explanation, no JSON.
`;
/** Map the UI locale reported by the client to a language directive for the
* consolidation model. No known locale → follow the user's message language. */
function localeDirective(locale) {
	if (locale === "zh") return "Simplified Chinese (中文)";
	if (locale === "en") return "English";
	return "the same language as the user's messages";
}
/** Extract the plain-text of one message's content blocks. */
function textOf(m) {
	const content = m.content;
	if (!Array.isArray(content)) return String(content ?? "");
	return content.map((b) => typeof b === "object" && b !== null && b.type === "text" ? b.text ?? "" : "").join("\n");
}
/** Read a message's durable id (undefined when absent). */
function messageId(m) {
	return m.id;
}
/**
* A message may be merged only when it is a real human user message made of
* text blocks: plugin/system sources (e.g. a schedule_reminder wake) and
* non-text content (images, files) must never be rewritten or dropped.
*/
function isMergeable(m) {
	if (m.source !== void 0 && m.source.kind !== "user") return false;
	const content = m.content;
	if (!Array.isArray(content)) return true;
	return content.every((b) => typeof b === "object" && b !== null && b.type === "text");
}
/**
* Build the merged message's source: `kind: 'user'` keeps the consolidated
* prompt rendered as a full, visible user bubble (a plugin source would render
* as a collapsed "context injection" tag), while the extra fields carry the
* merge provenance for the client UI — how many messages were merged and the
* ORIGINAL texts, so "view originals" stays possible even though the raw
* messages were spliced out of the queue.
*/
function mergedSource(messages) {
	const originals = messages.map(textOf).filter((t) => t.length > 0);
	return {
		kind: "user",
		plugin: "dsh-queue-merge",
		mergedCount: messages.length,
		originals
	};
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
function apply(ctx, config) {
	const policies = /* @__PURE__ */ new Map();
	ctx.effect(() => ctx.webServer.register({
		kind: "prefix",
		path: BASE,
		handler: async (req, res) => {
			const address = req.socket?.remoteAddress;
			if (address !== "127.0.0.1" && address !== "::1" && address !== "::ffff:127.0.0.1") {
				res.writeHead(403, { "content-type": "application/json" });
				res.end(JSON.stringify({
					ok: false,
					error: "forbidden: non-loopback"
				}));
				return;
			}
			const host = req.headers.host;
			if (typeof host !== "string") {
				res.writeHead(403, { "content-type": "application/json" });
				res.end(JSON.stringify({
					ok: false,
					error: "forbidden: missing host"
				}));
				return;
			}
			try {
				const hn = new URL(`http://${host}`).hostname;
				if (hn !== "127.0.0.1" && hn !== "::1" && hn !== "[::1]" && hn !== "localhost") {
					res.writeHead(403, { "content-type": "application/json" });
					res.end(JSON.stringify({
						ok: false,
						error: "forbidden: bad host"
					}));
					return;
				}
			} catch {
				res.writeHead(403, { "content-type": "application/json" });
				res.end(JSON.stringify({
					ok: false,
					error: "forbidden: bad host"
				}));
				return;
			}
			const origin = req.headers.origin;
			if (origin !== void 0 && origin !== "null") try {
				const ohn = new URL(origin).hostname;
				if (ohn !== "127.0.0.1" && ohn !== "::1" && ohn !== "[::1]" && ohn !== "localhost") {
					res.writeHead(403, { "content-type": "application/json" });
					res.end(JSON.stringify({
						ok: false,
						error: "forbidden: bad origin"
					}));
					return;
				}
			} catch {
				res.writeHead(403, { "content-type": "application/json" });
				res.end(JSON.stringify({
					ok: false,
					error: "forbidden: bad origin"
				}));
				return;
			}
			const secFetchSite = req.headers["sec-fetch-site"];
			if (secFetchSite !== void 0 && secFetchSite !== "same-origin" && secFetchSite !== "none") {
				res.writeHead(403, { "content-type": "application/json" });
				res.end(JSON.stringify({
					ok: false,
					error: "forbidden: cross-site fetch"
				}));
				return;
			}
			if (req.method === "GET") {
				let sessionId = "";
				try {
					sessionId = new URL(req.url ?? "/", "http://localhost").searchParams.get("sessionId") ?? "";
				} catch {}
				res.writeHead(200, { "content-type": "application/json" });
				res.end(JSON.stringify({
					ok: true,
					sessionId,
					defaultMode: config.defaultMode,
					mode: sessionId !== "" ? policies.get(sessionId)?.mode ?? config.defaultMode : config.defaultMode,
					minQueueForMerge: config.minQueueForMerge
				}));
				return;
			}
			if (req.method !== "POST") {
				res.writeHead(405, { "content-type": "application/json" });
				res.end(JSON.stringify({
					ok: false,
					error: "method not allowed"
				}));
				return;
			}
			try {
				const body = JSON.parse(await readBody(req));
				if (typeof body.sessionId !== "string" || body.sessionId.length === 0) {
					res.writeHead(400, { "content-type": "application/json" });
					res.end(JSON.stringify({
						ok: false,
						error: "missing sessionId"
					}));
					return;
				}
				const mode = body.mode === "individually" ? "individually" : body.mode === "merge" ? "merge" : config.defaultMode;
				const prev = policies.get(body.sessionId);
				const locale = typeof body.locale === "string" && body.locale.length > 0 ? body.locale : prev?.locale;
				policies.set(body.sessionId, {
					mode,
					...locale === void 0 ? {} : { locale }
				});
				res.writeHead(200, { "content-type": "application/json" });
				res.end(JSON.stringify({
					ok: true,
					sessionId: body.sessionId,
					mode,
					...locale === void 0 ? {} : { locale }
				}));
			} catch (e) {
				res.writeHead(500, { "content-type": "application/json" });
				res.end(JSON.stringify({
					ok: false,
					error: e instanceof Error ? e.message : "bad request"
				}));
			}
		}
	}), "dsh-queue-merge: policy route");
	ctx.on("agent/pre-step", async ({ agent, messages, signal }, next) => {
		if (messages.length === 0) return next();
		const sessionId = String(agent.session.id);
		const policyEntry = policies.get(sessionId);
		const policy = policyEntry?.mode ?? config.defaultMode;
		if (policy !== "merge") return next();
		const inbox = agent.inbox;
		const pendingSnapshot = [...inbox?.nextTurn ?? []];
		const total = messages.length + pendingSnapshot.length;
		console.log(`[dsh-queue-merge] pre-step: session=${sessionId.slice(0, 8)} policy=${policy} entering=${messages.length} pendingNextTurn=${pendingSnapshot.length} total=${total} min=${config.minQueueForMerge}`);
		if (total < Math.max(1, config.minQueueForMerge)) return next();
		const downstream = await next();
		if (downstream === null || typeof downstream !== "object" || downstream.kind !== "enter") return downstream;
		const all = [...messages, ...pendingSnapshot];
		if (!all.every(isMergeable)) {
			console.log(`[dsh-queue-merge] batch contains non-text or non-user-source messages (${all.length}) — skipping merge`);
			return downstream;
		}
		const consolidated = await synthesizeBrief(ctx, agent, all, config, signal, policyEntry?.locale);
		console.log(`[dsh-queue-merge] consolidated=${consolidated === null ? "FAILED(null)" : `ok(${consolidated.length} chars)`}`);
		if (consolidated === null) return downstream;
		const liveIds = (inbox?.nextTurn ?? []).slice(0, pendingSnapshot.length).map(messageId);
		const snapIds = pendingSnapshot.map(messageId);
		if (!(snapIds.length === liveIds.length && snapIds.every((id, i) => id !== void 0 && id === liveIds[i]))) {
			console.log("[dsh-queue-merge] queue changed during synthesis (edit/delete/reorder) — aborting merge");
			return downstream;
		}
		let extra = [];
		if (inbox?.splice && pendingSnapshot.length > 0) try {
			extra = inbox.splice("next-turn", 0, pendingSnapshot.length, []);
			console.log(`[dsh-queue-merge] spliced ${extra.length} queued prompts out of inbox`);
		} catch (e) {
			console.log(`[dsh-queue-merge] splice failed: ${String(e)}`);
			return downstream;
		}
		const contextMsgs = downstream.messages.slice(messages.length);
		return {
			kind: "enter",
			messages: [createUserMessage({
				content: [{
					type: "text",
					text: consolidated
				}],
				source: mergedSource(all)
			}), ...contextMsgs]
		};
	}, "dsh-queue-merge: pre-step consolidation");
}
/**
* Run the consolidation LLM call: rewrite the whole queued batch into ONE new
* formal user prompt. Reuses the session's routed model unless config
* overrides it (same pattern as compaction's summarizeWithLlm).
* Returns the consolidated prompt text, or null on any failure (never throws
* into the agent loop — a null simply means "keep the official behavior").
*/
async function synthesizeBrief(ctx, agent, messages, config, signal, locale) {
	try {
		const latest = agent.session.requestHeader?.()?.config;
		const configured = config.synthesisProvider.length > 0 && config.synthesisModel.length > 0 ? {
			provider: config.synthesisProvider,
			model: config.synthesisModel
		} : void 0;
		const agentTarget = agent.options?.provider !== void 0 && agent.options.provider.length > 0 && agent.options?.model !== void 0 && agent.options.model.length > 0 ? {
			provider: agent.options.provider,
			model: agent.options.model
		} : void 0;
		const target = configured ?? latest ?? agentTarget;
		if (target === void 0) {
			console.log(`[dsh-queue-merge] synthesis: no provider/model (configured=${config.synthesisProvider}/${config.synthesisModel} latest=${JSON.stringify(latest)} agent=${agent.options?.provider}/${agent.options?.model})`);
			return null;
		}
		const userBlocks = messages.map((m, i) => {
			const content = m.content;
			const text = Array.isArray(content) ? content.map((b) => typeof b === "object" && b !== null && b.type === "text" ? b.text ?? "" : "[non-text block]").join("\n") : String(content ?? "");
			return `#${i + 1}\n${text}`;
		}).join("\n\n");
		const promptMessages = [createUserMessage({
			content: [{
				type: "text",
				text: `${SYNTHESIS_INSTRUCTION}\nLanguage: write the consolidated prompt in ${localeDirective(locale)}.\n\nQUEUED USER MESSAGES:\n${userBlocks}`
			}],
			source: { kind: "user" }
		})];
		const assembler = new BlockAssembler();
		const options = {
			provider: target.provider,
			model: target.model,
			messages: promptMessages,
			maxTokens: 800,
			sessionId: agent.session.id,
			purpose: "compaction",
			...signal === void 0 ? {} : { signal }
		};
		for await (const chunk of ctx.llm.stream(options)) assembler.push(chunk);
		const text = assembler.blocks().filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
		return text.length > 0 ? text : null;
	} catch (e) {
		console.log(`[dsh-queue-merge] synthesis error: ${e instanceof Error ? e.message : String(e)}`);
		return null;
	}
}
/** Read a request body as UTF-8 text (bounded). */
function readBody(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let size = 0;
		req.on("data", (chunk) => {
			size += chunk.length;
			if (size > 65536) {
				reject(/* @__PURE__ */ new Error("body too large"));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		req.on("error", reject);
	});
}
//#endregion
export { Config, apply, inject, name };
