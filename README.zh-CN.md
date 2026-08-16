# dsh-queue-merge

**DeepSeek Harness 队列整合**——当模型正在执行任务、你不断补充后续消息时，下一轮用**一条整合后的正式提示词**执行，而不是让模型把你排队的一条条消息分别处理（做一点 → 被纠正 → 返工 → 再被纠正）。

## 为什么需要

官方 DSH agent loop 每个 turn 只消费**一条排队消息**。如果你在模型忙碌时连续排队 4 条补充：

```text
① 另外别用表格
② 对了，要考虑 Windows
③ 代码最好 TypeScript
④ 前面说的方案 B 不要了
```

它们会变成 4 个独立 turn，引发零碎的返工。本插件提供第三种队列消费策略：

```text
逐条处理   (官方默认：一消息一 turn)
合并处理   (本插件：整合整个批次，一次性执行)
```

## 工作原理

```text
模型忙碌，用户排队 2 条以上消息
        ↓
composer 上方的策略条：  [合并处理]  [逐条处理]   (仅 ≥2 条排队时显示)
        ↓  (合并)
turn 边界的 agent/pre-step 钩子
        ↓
调用【同一个执行模型】把整个批次整合成一条连贯、完整、正式的提示词
        ↓  (成功)
durable splice 移除排队消息；整合提示词【取代】它们成为该轮的用户消息
        ↓
模型一次性执行整合后的提示词
```

关键特性：

- **整合而非附加说明。** 排队消息被重写成一条新的正式用户提示词——模型执行的是整合后的版本，原始消息不再出现在该轮中。同一件事上后消息纠正前消息；互不相关的请求保留为分点。
- **构造上零丢失。** 整合 LLM 调用发生在触碰 inbox **之前**。若失败，排队消息原样留在队列，官方逐条处理接管——绝不会出现「已 splice 却被丢弃」。
- **无 over-splice 竞态。** 钩子入口对 pending 列表做快照；整合期间新到的消息留在队列里等下一轮。
- **语言跟随 UI。** 客户端会上报当前 locale；整合提示词按界面语言输出（zh → 简体中文，en → English），未知时回退为消息语言。
- **一条硬底线：** 整合绝不发明用户没说过的新权限，因此合并不会扩大 agent 的权限。
- **可打断的 UI。** 策略条只在排队 ≥2 条时出现（单条时合并无意义），位于 composer 的 input dock、原生队列 dock 正下方。

## 安装

```sh
dsh plugin --profile web add "github:keyiadiannao/dsh-queue-merge#master"
```

或在 profile `package.json` 添加：

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
    minQueueForMerge: 2         # claimed + 排队数量达到多少才触发合并
    synthesisProvider: ''       # 留空 = 复用当前会话的模型
    synthesisModel: ''
```

## 开发

```sh
pnpm run build        # tsdown：host + client bundle（CSS Module 内联）
pnpm run typecheck    # tsc --noEmit
pnpm test             # vitest
```

## 与生态的关系

| 能力 | 归属 |
|---|---|
| 队列展示 / 编辑 / 删除 / 插话 | 官方 DSH QueueDock |
| 队列排序 / 清空 / 撤销 | [dsh-queue-plus](https://github.com/starslittle/dsh-queue-plus) |
| 队列*消费策略*（逐条 vs 合并） | **本插件** |

三者互补：queue-plus 管队列**顺序**，本插件管队列**如何被消费**。

## License

MIT
