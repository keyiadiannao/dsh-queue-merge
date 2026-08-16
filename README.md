# dsh-queue-merge

**Queue Consolidation for DeepSeek Harness** — when the agent is busy and you
queue several follow-up messages, the next turn runs with **one consolidated
formal prompt** instead of the agent replaying your messages one by one
(do a bit → get corrected → redo → get corrected again).

## Why

The official DSH agent loop consumes **one queued prompt per turn**. If you
queue four follow-ups while the agent is mid-task:

```text
① no tables, please
② by the way, we need to consider Windows
③ prefer TypeScript for the code
④ drop option B from the earlier proposal
```

…they become four separate turns, which invites piecemeal rework. This plugin
adds a third queue-consumption policy:

```text
queue individually   (official default: one message per turn)
queue + merge        (this plugin: consolidate the batch, execute once)
```

## How it works

```text
agent busy, user queues 2+ messages
        ↓
policy strip above the composer:  [Merge]  [Individually]   (shown only when 2+ queued)
        ↓  (merge)
agent/pre-step hook at the turn boundary
        ↓
call the SAME model that will execute to consolidate the whole batch
into ONE clean, complete, formal user prompt
        ↓   (success)
durable splice removes the queued messages; the consolidated prompt
REPLACES them as the turn's user message (full visible bubble)
        ↓
agent executes the consolidated prompt once
```

Key properties:

- **Consolidation, not a side-note.** The queued messages are rewritten into a
  single new official user prompt — the agent acts on the consolidated version,
  and the raw messages do not appear in the turn. Corrections win over earlier
  messages on the same thing; unrelated requests are kept as separate points.
- **Transactional zero-loss.** The consolidation LLM call runs BEFORE the inbox
  is touched. If it fails, the queued messages stay put and the official
  one-message-per-turn loop takes over — nothing is ever spliced out and dropped.
  (Note: consolidation itself is a *lossy rewrite* by design — the model's
  integrated understanding replaces the raw text. That is the accepted product
  semantic; what is never lost is the *queue itself* on any failure.)
- **Attachments are never merged.** A batch containing any non-text block
  (image, file, …) or any non-human source (plugin/system messages) skips the
  merge entirely and falls back to the official per-message processing — images
  and files are never rewritten away.
- **Queue-identity guard.** The snapshotted message IDs are re-checked against
  the live queue right before the splice; if the user edited, deleted, or
  reordered the queue during synthesis, the merge is aborted instead of
  removing messages that were not part of the synthesis.
- **No over-splice races.** The pending list is snapshotted at hook entry;
  messages that arrive mid-consolidation stay queued for the next turn.
- **Language follows the UI.** The client reports the active locale; the
  consolidated prompt is written in the UI language (zh → Simplified Chinese,
  en → English), falling back to the message language when unknown.
- **One hard line:** the consolidation never invents permissions the user did
  not state, so merging cannot widen the agent's authority.
- **Provenance badge.** The consolidated bubble is followed by a small badge —
  "merged N follow-up messages · view originals" — where the ORIGINAL messages
  remain inspectable, so the raw intent stays traceable.
- **Interruptible UI.** The policy strip only appears when there are 2+ queued
  messages (with one, merge is a no-op) and sits in the composer's input dock
  right under the native queue dock. Its mode and threshold come from the
  server, so a `defaultMode: individually` or `minQueueForMerge: 5` config is
  never shown wrong in the UI.

## Install

```sh
dsh plugin --profile web add "github:keyiadiannao/dsh-queue-merge#master"
```

Or add to your profile `package.json`:

```json
"dependencies": {
  "dsh-queue-merge": "github:keyiadiannao/dsh-queue-merge#master"
}
```

And to `dsh.profile.bundles`: `"dsh-queue-merge"`.

## Configuration

```yaml
- id: dsh-queue-merge
  config:
    defaultMode: merge          # merge | individually
    minQueueForMerge: 2         # claimed + queued threshold before merging applies
    synthesisProvider: ''       # empty = reuse the session's routed model
    synthesisModel: ''
```

## Development

```sh
pnpm run build        # tsdown: host + client bundle (CSS Modules inlined)
pnpm run typecheck    # tsc --noEmit
pnpm test             # vitest
```

## Relationship to the ecosystem

| Capability | Owner |
|---|---|
| Queue display / edit / delete / steer | official DSH QueueDock |
| Queue reorder / clear / undo | [dsh-queue-plus](https://github.com/starslittle/dsh-queue-plus) |
| Queue *consumption policy* (individually vs merge) | **this plugin** |

The three are complementary: queue-plus manages queue *order*, this plugin
manages how the queue is *consumed*.

## License

MIT
