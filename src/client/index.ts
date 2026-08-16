/**
 * dsh-queue-merge browser half: the queue-policy bar above the composer card
 * (`conversation.input.dock`, right under the native queue dock — the seat the
 * slot contract reserves for content that needs its own line and carries
 * prose / clickable controls). Shows only while the agent is busy and at least
 * two messages are queued; lets the user pick merge vs individually for the
 * next batch.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { QueuePolicyBar } from './QueuePolicyBar.tsx'
import { en, zh } from './locales.ts'

/** Required services. */
export const inject = ['slots', 'locale']

/** Locale namespace for this plugin's UI strings. */
export const NS = 'queue.merge'

/** Register the plugin's dictionary keys with the typed locale map. */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'queue.merge': keyof typeof zh
  }
}

/**
 * The standalone plugin typecheck cannot see the host DSH SlotMap extension
 * (only the default `'root'` slot exists in the empty SlotMap). The runtime
 * slot table DOES declare `conversation.input.dock` (see
 * packages/client/ui-conversation/src/client/apply.ts); this augmentation is
 * our self-contained view of that contract so `slots.inject/register` and the
 * component props typecheck standalone.
 */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'conversation.input.dock': {
      kind: 'list'
      scope: 'session'
      owner: {
        session: {
          id?: string
          running: boolean
          queue: readonly { placement?: string }[]
        }
      }
    }
  }
}

/** Locale-capable view of the injected client context (see `inject` above). */
interface LocaleAwareContext {
  locale?: {
    getLocale?: () => { active?: string }
    register?: (ns: string, dicts: unknown) => () => void
  }
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => (ctx as unknown as LocaleAwareContext).locale?.register?.(NS, { zh, en }) ?? (() => {}), 'dsh-queue-merge: dictionaries')

  // The native queue dock registers at order 20; the policy bar follows it at
  // order 30 so the user first sees the queued messages, then decides how the
  // batch will be processed. The active UI locale rides along so the host can
  // write the consolidated prompt in the user's language.
  ctx.slots.inject('conversation.input.dock', () =>
    ctx.slots.register({
      name: 'conversation.input.dock',
      id: 'dsh-queue-merge-policy',
      order: 30,
      locale: NS,
      inject: () => ({
        locale: (ctx as unknown as LocaleAwareContext).locale?.getLocale?.()?.active ?? 'zh',
      }),
    }, QueuePolicyBar))
}
