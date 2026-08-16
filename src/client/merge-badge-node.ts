/**
 * Conversation-node definition for the "merged N messages" badge.
 *
 * The consolidated prompt itself is a `source.kind: 'user'` message (so it
 * renders as a full, visible user bubble — never a collapsed context tag), but
 * its source also carries `plugin: 'dsh-queue-merge'`, `mergedCount`, and the
 * ORIGINAL message texts. This definition claims that event under its own
 * node kind and renders a small provenance badge beneath the bubble: "merged N
 * follow-up messages · view originals". The official message definition
 * independently renders the bubble (kind 'user'), so both coexist.
 */

import type {
  ConversationNodeContext, ConversationNodeDefinition, ConversationViewNode,
} from '@deepseek-ai/dsh-client-runtime/client'
import { isAppendSurfaceEvent } from '@deepseek-ai/dsh-client-runtime/client'

/** The renderer-owned payload for the merge badge. */
export interface QueueMergeBadgeState {
  kind: 'queue-merge-badge'
  seq: number
  time: number
  mergedCount: number
  originals: readonly string[]
}

const MERGE_PLUGIN = 'dsh-queue-merge'

/** True for the consolidated message produced by this plugin's host half. */
function isMergeSource(source: unknown): boolean {
  const s = source as { kind?: string; plugin?: string } | undefined
  return s?.kind === 'user' && s.plugin === MERGE_PLUGIN
}

/** Build the chat view node shape locally (mirror of ui-conversation's chatNode helper). */
function chatNodeLike(
  context: ConversationNodeContext<QueueMergeBadgeState>,
  kind: string,
  anchorSeq: number,
  data: QueueMergeBadgeState,
): ConversationViewNode {
  const location = context.start?.location
    ?? context.matches[0]?.location
    ?? { kind: 'unresolved' }
  // The base ConversationViewNode type omits the chat-specific fields, but the
  // chat view builder reads anchorSeq/location/visibility at runtime.
  return {
    key: context.key,
    kind,
    id: context.id,
    target: 'chat',
    anchorSeq,
    location,
    visibility: 'visible',
    data,
  } as ConversationViewNode
}

export const mergeBadgeDefinition: ConversationNodeDefinition<QueueMergeBadgeState> = {
  kind: 'queue-merge-badge',
  target: 'chat',
  match: (event) => event.type === 'user/message'
    && isAppendSurfaceEvent(event)
    && isMergeSource(event.data.source)
    ? { id: String(event.data.id), role: 'start' }
    : null,
  start: (_context, match) => {
    const event = match.event
    if (event.type !== 'user/message') throw new Error('queue-merge badge start requires user/message')
    const source = event.data.source as { mergedCount?: number; originals?: readonly string[] }
    return {
      kind: 'queue-merge-badge',
      seq: event.seq,
      time: event.time,
      mergedCount: source.mergedCount ?? 0,
      originals: source.originals ?? [],
    }
  },
  update: (context) => context.state as QueueMergeBadgeState,
  buildViewNode: (context): ConversationViewNode | null => {
    if (context.state === undefined) return null
    const state = context.state
    return chatNodeLike(context, state.kind, state.seq, state)
  },
}
