/**
 * dsh-queue-merge browser half: the queue-policy bar under the composer.
 * Shows only while the agent is busy and messages are queued; lets the user
 * pick merge vs individually for the next batch.
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

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-queue-merge: dictionaries')

  ctx.slots.inject('conversation.composer.dock', () =>
    ctx.slots.register({
      name: 'conversation.composer.dock',
      id: 'dsh-queue-merge-policy',
      locale: NS,
    }, QueuePolicyBar))
}
