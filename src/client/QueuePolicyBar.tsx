/**
 * Queue policy bar — rendered in the composer dock (`conversation.composer.dock`)
 * while the agent is busy and messages are queued. Lets the user choose how
 * the queued batch will be consumed when the current task ends:
 *   merge        → intent synthesis, one combined execution (this plugin)
 *   individually → official one-message-per-turn behavior
 * The choice is POSTed to the host per-session; the host's agent/pre-step hook
 * reads it at the turn boundary.
 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './index.ts'

/** Inline queue row shape (subset of the runtime's QueuedMessage). */
export interface QueueRow {
  readonly placement: 'queued' | 'steering' | 'context' | string
}

/** Inline session snapshot shape (subset of the runtime's ConversationSnapshot). */
export interface QueueSessionSnapshot {
  readonly queue: readonly QueueRow[]
  readonly running: boolean
  readonly id?: string
}

/** The InputZone owner share the composer.dock slot injects; declared inline
 * because the standalone typecheck does not see the DSH SlotMap extension
 * (same pattern as the power-button plugin's other slot components). */
export interface QueueInputZone {
  readonly session: QueueSessionSnapshot
}

export type QueuePolicyBarProps =
  PropsRuntime<'conversation.composer.dock'>
  & QueueInputZone
  & PropsLocale<typeof NS>
  & { sessionId?: string }

/** Policy endpoint on the host. */
const POLICY = '/api/dsh-queue-merge/policy'

/** Only render while the agent is busy AND at least one message is queued —
 * zero footprint when idle. */
export function QueuePolicyBar(props: QueuePolicyBarProps): JSX.Element | null {
  const { t, session } = props
  const queued = session.queue.filter(q => q.placement === 'queued')
  if (!session.running || queued.length === 0) return null

  const sessionId = props.sessionId ?? (session as { id?: string }).id ?? ''

  const setMode = (mode: 'merge' | 'individually'): void => {
    if (sessionId === '') return
    void fetch(POLICY, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, mode }),
    }).catch(() => { /* non-fatal: falls back to default */ })
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 12px',
        borderRadius: 8,
        background: 'var(--dsw-alias-bg-layer-2, rgba(24,28,38,0.6))',
        border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2))',
        color: 'var(--dsw-alias-label-secondary, #aab2c0)',
        fontFamily: 'var(--dsw-font-family, ui-sans-serif, system-ui, sans-serif)',
        fontSize: 12,
        lineHeight: 1.5,
      }}
    >
      <span style={{ flexShrink: 0 }}>
        {t('queueCount').replace('{n}', String(queued.length))}
      </span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {t('willMerge')}
      </span>
      <button
        type="button"
        title={t('mergeHint')}
        onClick={() => setMode('merge')}
        style={{
          padding: '3px 10px',
          borderRadius: 6,
          border: '1px solid var(--dsw-alias-border-l3, rgba(128,128,128,0.3))',
          background: 'var(--dsw-alias-button-primary-dimmed, rgba(65,118,230,0.2))',
          color: 'var(--dsw-alias-label-primary, #f2f6fc)',
          font: 'inherit',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        {t('merge')}
      </button>
      <button
        type="button"
        title={t('individuallyHint')}
        onClick={() => setMode('individually')}
        style={{
          padding: '3px 10px',
          borderRadius: 6,
          border: '1px solid var(--dsw-alias-border-l3, rgba(128,128,128,0.3))',
          background: 'transparent',
          color: 'var(--dsw-alias-label-secondary, #aab2c0)',
          font: 'inherit',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        {t('individually')}
      </button>
    </div>
  )
}
