import z from "@deepseek-ai/schemastery";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
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
*                        run one lightweight "intent synthesis" pass over the
*                        queued messages, then hand the execution model BOTH
*                        the original messages AND the advisory brief)
*
* Authority model (Instruction-Hierarchy-inspired): the ORIGINAL queued user
* messages are always authoritative. The synthesis output is a derived
* planning artifact — advisory only, never a prompt rewrite, and never
* permitted to widen permissions.
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
* The intent-synthesis instruction. Fixed schema, advisory only: the model
* must NOT rewrite the user's requests, only normalize them. The execution
* model still sees every original message; this brief is additional context.
*/
const SYNTHESIS_INSTRUCTION = `You are an intent-normalization pass, not the executor.
Below are several user messages that were queued while the agent was working.
Produce a compact structured brief that helps the NEXT model turn honor ALL of
them correctly. Do NOT rewrite or paraphrase the user's requests into new
instructions — the original messages remain authoritative and will be passed
to the executor verbatim.

Respond with JSON only, using exactly this schema:
{
  "primaryGoal": "one-sentence current goal after considering corrections",
  "requirements": ["non-conflicting additions"],
  "constraints": ["limits the user stated (platforms, deps, formatting, security...)"],
  "corrections": ["changes that supersede an earlier queued request"],
  "superseded": ["earlier queued requests that a later one cancelled"],
  "conflicts": ["pairs of queued requests that contradict each other; flag, do not silently pick"],
  "independentRequests": ["queued items that are unrelated to the main goal and should be handled separately"],
  "recommendedExecutionPlan": ["ordered steps honoring corrections and constraints"]
}

Rules:
- "Last explicit correction wins" only when a later message semantically
  conflicts with an earlier one; unrelated later messages do NOT override
  earlier ones.
- If a message is unrelated to the others, put it in independentRequests —
  do not force everything into one task.
- Never invent permissions the user did not state (no implicit delete,
  publish, restart, network, or config changes).
- If the queued set is trivial (e.g. a single "ok" or "add a test"), say so in
  primaryGoal and keep every list short or empty.`;
/** Context message the execution turn receives carrying the synthesis brief. */
const SYNTHESIS_SOURCE = {
	kind: "plugin",
	plugin: "dsh-queue-merge"
};
/**
* Apply: register the agent/pre-step hook that implements merge mode.
* The hook is deliberately conservative:
*  - merge applies only when (a) policy is merge AND (b) queued+claimed count
*    is >= minQueueForMerge AND (c) more than one user message is entering.
*  - synthesis failures degrade gracefully to the official behavior (the
*    original messages still enter, unmodified).
*/
function apply(ctx, config) {
	const policies = /* @__PURE__ */ new Map();
	ctx.set("queueMerge", {
		setPolicy(sessionId, mode) {
			policies.set(sessionId, { mode });
		},
		getPolicy(sessionId) {
			return policies.get(sessionId)?.mode ?? config.defaultMode;
		}
	});
	ctx.effect(() => ctx.webServer.register({
		kind: "prefix",
		path: BASE,
		handler: async (req, res) => {
			if (req.method !== "POST") {
				res.writeHead(405, { "content-type": "application/json" });
				res.end(JSON.stringify({
					ok: false,
					error: "method not allowed"
				}));
				return;
			}
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
				policies.set(body.sessionId, { mode });
				res.writeHead(200, { "content-type": "application/json" });
				res.end(JSON.stringify({
					ok: true,
					sessionId: body.sessionId,
					mode
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
		if ((policies.get(String(agent.session.id))?.mode ?? config.defaultMode) !== "merge") return next();
		if (messages.length < Math.max(1, config.minQueueForMerge)) return next();
		const downstream = await next();
		if (downstream === null || typeof downstream !== "object" || downstream.kind !== "enter") return downstream;
		const brief = await synthesizeBrief(ctx, agent, messages, config, signal);
		if (brief === null) return downstream;
		const enter = downstream;
		const briefMessage = createUserMessage({
			content: [{
				type: "text",
				text: brief
			}],
			source: SYNTHESIS_SOURCE
		});
		return {
			kind: "enter",
			messages: [...enter.messages, briefMessage]
		};
	}, "dsh-queue-merge: pre-step intent synthesis");
}
/**
* Run the intent-synthesis LLM call. Reuses the session's routed model unless
* config overrides it (same pattern as compaction's summarizeWithLlm).
* Returns the synthesis text, or null on any failure (never throws into the
* agent loop).
*/
async function synthesizeBrief(ctx, agent, messages, config, signal) {
	try {
		const latest = agent.session.requestHeader?.()?.config;
		const configured = config.synthesisProvider.length > 0 && config.synthesisModel.length > 0 ? {
			provider: config.synthesisProvider,
			model: config.synthesisModel
		} : void 0;
		const agentTarget = agent.options.provider !== void 0 && agent.options.provider.length > 0 && agent.options.model !== void 0 && agent.options.model.length > 0 ? {
			provider: agent.options.provider,
			model: agent.options.model
		} : void 0;
		const target = configured ?? latest ?? agentTarget;
		if (target === void 0) return null;
		const userBlocks = messages.map((m, i) => {
			const content = m.content;
			const text = Array.isArray(content) ? content.map((b) => typeof b === "object" && b !== null && b.type === "text" ? b.text ?? "" : "[non-text block]").join("\n") : String(content ?? "");
			return `#${i + 1}\n${text}`;
		}).join("\n\n");
		const promptMessages = [createUserMessage({
			content: [{
				type: "text",
				text: `${SYNTHESIS_INSTRUCTION}\n\nQUEUED USER MESSAGES:\n${userBlocks}`
			}],
			source: SYNTHESIS_SOURCE
		})];
		const collected = [];
		const options = {
			provider: target.provider,
			model: target.model,
			messages: promptMessages,
			maxTokens: 800,
			sessionId: agent.session.id,
			purpose: "queue-synthesis",
			...signal === void 0 ? {} : { signal }
		};
		for await (const chunk of ctx.llm.stream(options)) {
			const c = chunk;
			if (c.type === "text" && typeof c.text === "string") collected.push(c.text);
		}
		return collected.join("").trim() || null;
	} catch {
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
