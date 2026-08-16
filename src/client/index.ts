/**
 * dsh-queue-merge browser half: the queue-policy bar above the composer card
 * (`conversation.input.dock`, right under the native queue dock — the seat the
 * slot contract reserves for content that needs its own line and carries
 * prose / clickable controls), plus the "merged N messages" provenance badge
 * (`conversation.chat.node` keyed renderer + conversation node definition).
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { QueuePolicyBar } from './QueuePolicyBar.tsx'
import { MergeBadge } from './MergeBadge.tsx'
import { mergeBadgeDefinition } from './merge-badge-node.ts'
import { en, zh } from './locales.ts'

/** Required services. */
export const inject = ['slots', 'locale', 'conversationEvents']

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
 * slot table DOES declare both slots (see
 * packages/client/ui-conversation/src/client/apply.ts); these augmentations
 * are our self-contained view of those contracts so the register calls
 * typecheck standalone.
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
    'conversation.chat.node': {
      kind: 'keyed'
      scope: 'session'
      owner: { node: unknown }
    }
  }
}

/** Locale-capable view of the injected client context (see `inject` above). */
interface ClientServices {
  locale?: {
    getLocale?: () => { active?: string }
    register?: (ns: string, dicts: unknown) => () => void
  }
  conversationEvents?: { register?: (definition: unknown) => void }
}

export function apply(ctx: ClientContext): void {
  const services = ctx as unknown as ClientServices
  ctx.effect(() => services.locale?.register?.(NS, { zh, en }) ?? (() => {}), 'dsh-queue-merge: dictionaries')

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
        locale: services.locale?.getLocale?.()?.active ?? 'zh',
      }),
    }, QueuePolicyBar))

  // Merge provenance badge: claims the consolidated user/message event under
  // its own node kind and renders the "merged N · view originals" strip below
  // the user bubble.
  services.conversationEvents?.register?.(mergeBadgeDefinition)
  ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'queue-merge-badge',
    locale: NS,
  }, MergeBadge as never)
}
