/**
 * Queue policy bar — rendered in the input dock (`conversation.input.dock`,
 * above the composer card, right under the native queue dock) while the agent
 * is busy and messages are queued. Lets the user choose how the queued batch
 * will be consumed when the current task ends:
 *   merge        → intent synthesis, one combined execution (this plugin)
 *   individually → official one-message-per-turn behavior
 * The choice AND the active UI locale are POSTed to the host per-session; the
 * host's agent/pre-step hook uses the locale for the consolidation language.
 */
import { useEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './index.ts'
import css from './QueuePolicyBar.module.css'

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

/** The InputZone owner share the input.dock slot injects; declared inline
 * because the standalone typecheck does not see the DSH SlotMap extension
 * (same pattern as the power-button plugin's other slot components). */
export interface QueueInputZone {
  readonly session: QueueSessionSnapshot
}

export type QueuePolicyBarProps =
  PropsRuntime<'conversation.input.dock'>
  & QueueInputZone
  & PropsLocale<typeof NS>
  & { sessionId?: string; locale?: string }

/** Policy endpoint on the host. */
const POLICY = '/api/dsh-queue-merge/policy'

/** Only render while the agent is busy AND at least one message is queued —
 * zero footprint when idle. */
export function QueuePolicyBar(props: QueuePolicyBarProps): JSX.Element | null {
  const { t, session } = props
  const [mode, setModeState] = useState<'merge' | 'individually'>('merge')
  const sessionId = props.sessionId ?? (session as { id?: string }).id ?? ''
  const locale = props.locale ?? 'zh'
  const queued = session.queue.filter(q => q.placement === 'queued')

  // Report the active UI locale as soon as the bar appears, so the host knows
  // which language the consolidated prompt should be written in — even when
  // the user never clicks a mode button. Hooks run unconditionally (before the
  // early return below) to keep React's hook order stable across renders.
  useEffect(() => {
    if (sessionId === '' || !session.running || queued.length === 0) return
    void fetch(POLICY, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, locale }),
    }).catch(() => { /* non-fatal: consolidation falls back to message-language */ })
  }, [sessionId, locale, session.running, queued.length])

  if (!session.running || queued.length === 0) return null

  const setMode = (next: 'merge' | 'individually'): void => {
    setModeState(next)
    if (sessionId === '') return
    void fetch(POLICY, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, mode: next, locale }),
    }).catch(() => { /* non-fatal: falls back to default */ })
  }

  return (
    <div className={css.root}>
      <span className={css.lead} aria-hidden="true">
        <span className={css.dot} />
      </span>
      <span className={css.title}>{t('policyTitle')}</span>
      <span className={css.hint} title={mode === 'merge' ? t('mergeHint') : t('individuallyHint')}>
        {mode === 'merge' ? t('willMerge') : t('willIndividually')}
      </span>
      <span className={css.segmented} role="group" aria-label={t('policyTitle')}>
        <button
          type="button"
          className={mode === 'merge' ? `${css.option} ${css.active}` : css.option}
          title={t('mergeHint')}
          aria-pressed={mode === 'merge'}
          onClick={() => setMode('merge')}
        >
          {t('merge')}
        </button>
        <button
          type="button"
          className={mode === 'individually' ? `${css.option} ${css.active}` : css.option}
          title={t('individuallyHint')}
          aria-pressed={mode === 'individually'}
          onClick={() => setMode('individually')}
        >
          {t('individually')}
        </button>
      </span>
    </div>
  )
}
