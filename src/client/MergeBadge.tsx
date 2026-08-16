/**
 * Merge provenance badge — rendered beneath the consolidated user bubble.
 * Shows "merged N follow-up messages" with an expandable list of the ORIGINAL
 * messages, so the user always knows the raw intent behind the consolidated
 * prompt (the raw messages were spliced out of the queue, so this is the only
 * place the originals remain visible).
 */
import { useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './index.ts'
import type { QueueMergeBadgeState } from './merge-badge-node.ts'
import css from './MergeBadge.module.css'

export type MergeBadgeProps = PropsLocale<typeof NS> & { node: { data: QueueMergeBadgeState } }

export function MergeBadge({ node, t }: MergeBadgeProps): JSX.Element | null {
  const { data } = node
  const [expanded, setExpanded] = useState(false)
  if (data.mergedCount <= 0) return null

  return (
    <div className={css.badge} data-merge-badge>
      <span className={css.lead} aria-hidden="true">✦</span>
      <button
        type="button"
        className={css.summary}
        aria-expanded={expanded}
        onClick={() => setExpanded(e => !e)}
      >
        <span>{t('merged', { n: data.mergedCount })}</span>
        <span className={css.toggle} aria-hidden="true">{expanded ? '−' : '+'}</span>
      </button>
      {expanded && data.originals.length > 0 && (
        <ol className={css.list} aria-label={t('originalsTitle')}>
          {data.originals.map((text, i) => (
            <li key={i} className={css.item}>{text}</li>
          ))}
        </ol>
      )}
    </div>
  )
}
