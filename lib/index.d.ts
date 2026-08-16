import z from "@deepseek-ai/schemastery";
//#region src/index.d.ts
declare const name = "dsh-queue-merge";
declare const inject: string[];
/** Plugin configuration (editable via the profile's cordis config / settings). */
interface Config {
  /** Default queue policy: 'merge' or 'individually'. The client can switch
   * per-batch while the agent is busy; this is the fallback default. */
  defaultMode: 'merge' | 'individually';
  /** Minimum queued messages before merging applies (1 = always when >= 1). */
  minQueueForMerge: number;
  /** Provider/model override for the synthesis call. Empty = reuse the
   * session's routed model. */
  synthesisProvider: string;
  synthesisModel: string;
}
/** Schemastery schema; cordis validates and provides it as apply(ctx, config). */
declare const Config: z<Config>;
/** Per-session queue policy + UI locale, switchable from the client while busy. */
interface QueuePolicy {
  mode: 'merge' | 'individually';
  /** Active UI locale ('zh' | 'en') reported by the client — the language the
   * consolidated prompt is written in. Undefined → follow the user messages. */
  locale?: string;
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
declare function apply(ctx: any, config: Config): void;
//#endregion
export { Config, QueuePolicy, apply, inject, name };