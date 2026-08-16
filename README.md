# dsh-queue-merge

**Queue Coalescing for DeepSeek Harness** — when the agent is busy and you keep
queuing follow-up messages, merge them into one synthesized intent brief before
the next turn executes, instead of the agent processing them one message per
turn (do a bit → get corrected → redo → get corrected again).

## Why

The official DSH agent loop consumes **one queued prompt per turn**. If you
queue four follow-ups while the agent is mid-task:

```text
① 另外别用表格
② 对了，要考虑 Windows
③ 代码最好 TypeScript
④ 前面说的方案 B 不要了
```

…they become four separate turns, which invites piecemeal rework. This plugin
adds a third queue-consumption policy:

```text
queue individually   (official default: one message per turn)
queue + merge        (this plugin: synthesize the batch, execute once)
```

## How it works

```text
agent busy + messages queued
        ↓
composer-dock policy bar:  [合并处理]  [逐条处理]
        ↓  (merge)
agent/pre-step hook at the turn boundary
        ↓
freeze the whole queued batch (durable inbox splice)
        ↓
one lightweight intent-synthesis LLM call (fixed JSON schema)
        ↓
execution turn receives:  ALL original messages  +  advisory brief
```

**Authority model (instruction-hierarchy inspired):** the original queued user
messages are always authoritative. The synthesis brief is a derived planning
artifact — advisory only, never a prompt rewrite, and never permitted to widen
permissions. If synthesis fails, the plugin degrades gracefully to the official
one-message-per-turn behavior.

The synthesis prompt emits a fixed schema:

```json
{
  "primaryGoal": "...",
  "requirements": [],
  "constraints": [],
  "corrections": [],
  "superseded": [],
  "conflicts": [],
  "independentRequests": [],
  "recommendedExecutionPlan": []
}
```

It detects corrections ("last explicit correction wins" only on semantic
conflict), cancelled requests, constraints, and independent requests that
should NOT be forced into one task.

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
    minQueueForMerge: 2         # batch size threshold before merging applies
    synthesisProvider: ''       # empty = reuse the session's routed model
    synthesisModel: ''
```

## Development

```sh
npm run build        # tsdown: host + client bundle
npm run typecheck    # tsc --noEmit
npm test             # vitest
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
