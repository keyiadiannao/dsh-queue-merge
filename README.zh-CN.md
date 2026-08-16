# dsh-queue-merge

**DeepSeek Harness 队列聚合**——当模型正在执行任务、你不断补充后续消息时,把这些排队消息**先综合成一份意图简报**,再让模型一次性执行;而不是逐条处理(做一点 → 被纠正 → 返工 → 再被纠正)。

## 为什么需要

官方 DSH agent loop 每个 turn 只消费**一条排队消息**。如果你在模型忙碌时连续排队 4 条补充:

```text
① 另外别用表格
② 对了,要考虑 Windows
③ 代码最好 TypeScript
④ 前面说的方案 B 不要了
```

它们会变成 4 个独立 turn,引发零碎的返工。本插件提供第三种队列消费策略:

```text
逐条处理   (官方默认:一消息一 turn)
合并处理   (本插件:先综合批次,再一次性执行)
```

## 工作原理

```text
模型忙碌 + 消息排队
        ↓
composer-dock 策略条: [合并处理]  [逐条处理]
        ↓  (合并)
turn 边界的 agent/pre-step 钩子
        ↓
冻结整个排队批次(durable inbox splice)
        ↓
一次轻量 intent-synthesis LLM 调用(固定 JSON schema)
        ↓
执行轮收到: 全部原始消息  +  advisory 简报
```

**权威模型(受 instruction-hierarchy 启发):** 原始排队用户消息始终是权威;整理出的简报只是派生规划产物——仅供参考,绝不重写用户请求,也绝不扩大权限。synthesis 失败时优雅回退官方逐条行为。

synthesis 输出固定 schema:

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

能识别更正("最后显式更正优先"仅在语义冲突时生效)、被撤销的请求、约束,以及**不应强行合并进一个任务**的独立请求。

## 安装

```sh
dsh plugin --profile web add "github:keyiadiannao/dsh-queue-merge#master"
```

或在 profile `package.json` 添加:

```json
"dependencies": {
  "dsh-queue-merge": "github:keyiadiannao/dsh-queue-merge#master"
}
```

并在 `dsh.profile.bundles` 加入 `"dsh-queue-merge"`。

## 配置

```yaml
- id: dsh-queue-merge
  config:
    defaultMode: merge          # merge | individually
    minQueueForMerge: 2         # 达到多少条排队消息才触发合并
    synthesisProvider: ''       # 留空 = 复用当前会话的模型
    synthesisModel: ''
```

## 开发

```sh
npm run build        # tsdown:host + client bundle
npm run typecheck    # tsc --noEmit
npm test             # vitest
```

## 与生态的关系

| 能力 | 归属 |
|---|---|
| 队列展示 / 编辑 / 删除 / 插话 | 官方 DSH QueueDock |
| 队列排序 / 清空 / 撤销 | [dsh-queue-plus](https://github.com/starslittle/dsh-queue-plus) |
| 队列*消费策略*(逐条 vs 合并) | **本插件** |

三者互补:queue-plus 管队列**顺序**,本插件管队列**如何被消费**。

## License

MIT
