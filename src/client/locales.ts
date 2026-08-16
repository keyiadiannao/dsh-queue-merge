/**
 * Locale dictionaries for dsh-queue-merge (zh / en).
 * Registered under the `queue.merge` namespace.
 */

export const zh = {
  policyTitle: '后续消息处理',
  merge: '合并处理',
  mergeHint: '当前任务完成后，先综合全部消息再统一执行',
  individually: '逐条处理',
  individuallyHint: '按发送顺序分别交给模型',
  queueCount: '{n} 条排队消息',
  willMerge: '当前任务结束后将合并处理这批消息',
  willIndividually: '当前任务结束后将逐条处理这批消息',
  merged: '已合并 {n} 条后续消息',
  originalsTitle: '原始消息',
} as const

export const en = {
  policyTitle: 'Queued messages',
  merge: 'Merge',
  mergeHint: 'Synthesize all queued messages, then execute as one batch',
  individually: 'Individually',
  individuallyHint: 'Process each queued message as its own turn',
  queueCount: '{n} queued messages',
  willMerge: 'Will merge this batch after the current task ends',
  willIndividually: 'Will process this batch one message per turn',
  merged: 'Merged {n} follow-up messages',
  originalsTitle: 'Original messages',
} as const
