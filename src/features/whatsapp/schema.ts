import { z } from 'zod';

import { WHATSAPP_STATUSES } from '@/db/schema';
import { defaultLocale, locales } from '@/i18n/routing';

import { MAX_BODY_LENGTH } from './templates';

/**
 * Every input this feature validates: the settings form, a hand-typed message,
 * and — the important one — the webhook envelope.
 *
 * The webhook is a **public, unauthenticated-by-URL endpoint**. Its HMAC
 * signature proves the body came from the gateway; these schemas decide whether
 * the body means anything. Both checks are mandatory: a signature says "the
 * gateway sent this", not "this is the shape we expect from the version of the
 * gateway we were written against".
 */

/** A hand-edited locale in a form field degrades to the default, never a 500. */
export const localeSchema = z.enum(locales).catch(defaultLocale);

/** Lead times offered in the UI. Free-form minutes would invite typos. */
export const REMINDER_LEAD_OPTIONS = [
  { minutes: 120, key: 'twoHours' },
  { minutes: 240, key: 'fourHours' },
  { minutes: 720, key: 'twelveHours' },
  { minutes: 1440, key: 'oneDay' },
  { minutes: 2880, key: 'twoDays' },
] as const;

export type ReminderLeadOption = (typeof REMINDER_LEAD_OPTIONS)[number];

const leadMinutesValues = REMINDER_LEAD_OPTIONS.map((option) => String(option.minutes)) as [string, ...string[]];

/** FormData sends checkboxes as `'on'` or omits them entirely. */
const checkbox = z.preprocess((value) => value === 'on' || value === 'true' || value === true, z.boolean());

export const automationSettingsSchema = z.object({
  remindersEnabled: checkbox,
  confirmationsEnabled: checkbox,
  reminderLeadMinutes: z.enum(leadMinutesValues).transform(Number),
});

export type AutomationSettingsInput = z.infer<typeof automationSettingsSchema>;

export const sendMessageSchema = z.object({
  clientId: z.uuid(),
  body: z.string().trim().min(1).max(MAX_BODY_LENGTH),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

/**
 * The envelope every delivery carries. `data` stays `unknown` here and is parsed
 * per event below — one event's payload must never be able to fail another's
 * parse and take the whole delivery down with it.
 */
export const webhookEnvelopeSchema = z.object({
  event: z.string(),
  /** The gateway's session id — how a delivery is mapped to a clinic. */
  sessionId: z.string().min(1),
  timestamp: z.string().optional(),
  /**
   * Stable across the gateway's own retries. Recorded as an inbound message's
   * dedupe key, which is what makes a redelivery a no-op instead of a duplicate
   * row in the clinic's thread.
   */
  idempotencyKey: z.string().min(1).max(300).optional(),
  deliveryId: z.string().optional(),
  data: z.unknown(),
});

export type WebhookEnvelope = z.infer<typeof webhookEnvelopeSchema>;

/**
 * An inbound message. Only the fields this app acts on are required — the
 * gateway sends a great deal more, and demanding all of it would break on every
 * gateway upgrade.
 */
export const inboundMessageSchema = z.object({
  id: z.string().min(1),
  chatId: z.string().min(1),
  from: z.string().optional(),
  body: z.string().default(''),
  type: z.string().optional(),
  fromMe: z.boolean().optional(),
  isGroup: z.boolean().optional(),
  timestamp: z.number().optional(),
});

/**
 * A delivery receipt. `status` is the gateway's neutral wording; `ack` is its
 * deprecated numeric field, ignored here.
 */
export const messageAckSchema = z.object({
  id: z.string().min(1).optional(),
  messageId: z.string().min(1).optional(),
  status: z.enum(['pending', 'sent', 'delivered', 'read', 'failed']),
});

export const sessionStatusSchema = z.object({
  status: z.enum(WHATSAPP_STATUSES).optional(),
  phone: z.string().nullish(),
});
