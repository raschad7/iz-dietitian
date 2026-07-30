import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import {
  whatsappMessages,
  whatsappSettings,
  type WhatsappMessage,
  type WhatsappMessageKind,
  type WhatsappMessageStatus,
  type WhatsappSettings,
  type WhatsappStatus,
} from '@/db/schema';

import { sessionNameForClinic } from './config';
import { type AutomationSettingsInput } from './schema';

/**
 * Every write to the two WhatsApp tables.
 *
 * Imports nothing from Next.js, so `bun test` can call these directly — the same
 * split as `src/features/clients/mutations.ts`. `actions.ts` adds the request
 * concerns (session guard, `revalidatePath`) on top.
 *
 * `clinicId` is the first argument of everything that touches clinic-owned data,
 * so forgetting the tenant boundary is a type error rather than a leak. The two
 * exceptions are the webhook paths, which arrive holding a gateway session id
 * instead and resolve the clinic from it.
 */

/**
 * The clinic's settings row, created on first use.
 *
 * `onConflictDoNothing` rather than a read-then-insert: two browser tabs pressing
 * "Connect" at the same time is ordinary, and the unique index on `clinic_id` is
 * the only reliable arbiter.
 */
export async function ensureSettings(clinicId: string): Promise<WhatsappSettings> {
  const [inserted] = await db
    .insert(whatsappSettings)
    .values({ clinicId, sessionName: sessionNameForClinic(clinicId) })
    .onConflictDoNothing({ target: whatsappSettings.clinicId })
    .returning();

  if (inserted) return inserted;

  const [existing] = await db
    .select()
    .from(whatsappSettings)
    .where(eq(whatsappSettings.clinicId, clinicId))
    .limit(1);

  if (!existing) {
    throw new Error(`whatsapp_settings for clinic ${clinicId} vanished between insert and select.`);
  }

  return existing;
}

type SessionLinkPatch = {
  sessionId?: string | null;
  webhookId?: string | null;
  status?: WhatsappStatus;
  phone?: string | null;
  lastError?: string | null;
  connectedAt?: Date | null;
};

/**
 * Records what the gateway just told us about this clinic's session.
 *
 * `syncedAt` is stamped on every call so the settings page can say how fresh the
 * status is — a `ready` from an hour ago and a `ready` from a second ago are
 * different claims.
 */
export async function saveSessionLink(clinicId: string, patch: SessionLinkPatch): Promise<WhatsappSettings | null> {
  const [row] = await db
    .update(whatsappSettings)
    .set({ ...patch, syncedAt: new Date(), updatedAt: new Date() })
    .where(eq(whatsappSettings.clinicId, clinicId))
    .returning();

  return row ?? null;
}

/** The automation toggles. Never touches the session link. */
export async function updateAutomationSettings(
  clinicId: string,
  input: AutomationSettingsInput,
): Promise<WhatsappSettings | null> {
  const [row] = await db
    .update(whatsappSettings)
    .set({
      remindersEnabled: input.remindersEnabled,
      confirmationsEnabled: input.confirmationsEnabled,
      reminderLeadMinutes: input.reminderLeadMinutes,
      updatedAt: new Date(),
    })
    .where(eq(whatsappSettings.clinicId, clinicId))
    .returning();

  return row ?? null;
}

/**
 * Forgets the gateway session without deleting the row.
 *
 * The automation preferences and the message history survive a disconnect: a
 * clinic that unlinks a phone to link another one should not have to set its
 * reminder schedule up again, and the log is a clinical record either way.
 */
export async function clearSessionLink(clinicId: string): Promise<WhatsappSettings | null> {
  return saveSessionLink(clinicId, {
    sessionId: null,
    webhookId: null,
    status: 'not_connected',
    phone: null,
    lastError: null,
    connectedAt: null,
  });
}

/**
 * Applies a `session.status` webhook.
 *
 * Keyed by the gateway's session id, because that is all the event carries. A
 * status naming a session no other clinic claims simply matches no rows — which
 * is the correct outcome for an event about a session this app does not own.
 */
export async function applySessionStatus(
  sessionId: string,
  status: WhatsappStatus,
  phone?: string | null,
): Promise<void> {
  await db
    .update(whatsappSettings)
    .set({
      status,
      // Only overwrite the number when the event carried one: a `disconnected`
      // event has no phone, and blanking it would lose which number was linked.
      ...(phone === undefined || phone === null ? {} : { phone }),
      ...(status === 'ready' ? { connectedAt: new Date(), lastError: null } : {}),
      syncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(whatsappSettings.sessionId, sessionId));
}

type OutboundClaim = {
  clinicId: string;
  clientId?: string | null;
  appointmentId?: string | null;
  kind: WhatsappMessageKind;
  chatId: string;
  phone: string;
  body: string;
  /** See the `whatsapp_messages` table comment — this is the idempotency anchor. */
  dedupeKey: string;
};

/**
 * Claims the right to send one message, or returns `null` if it is already
 * claimed.
 *
 * This is the heart of the automation's safety. The row is written **before** the
 * gateway is called, and `(clinic_id, dedupe_key)` is unique, so:
 *
 *  - the reminder job can run every minute over an overlapping window and still
 *    send each reminder once;
 *  - two app instances (or two cron ticks racing) cannot both win the insert;
 *  - a crash between the insert and the send leaves a `queued` row, which is
 *    visible in the log as "we intended to send this" rather than silence.
 *
 * The trade-off is deliberate and worth naming: a process that dies mid-send
 * leaves a message that is never retried. For a reminder that is the right way to
 * fail — WhatsApp has no unsend, so sending twice is worse than not sending.
 */
export async function claimOutboundMessage(claim: OutboundClaim): Promise<WhatsappMessage | null> {
  const [row] = await db
    .insert(whatsappMessages)
    .values({ ...claim, direction: 'outbound', status: 'queued' })
    .onConflictDoNothing({ target: [whatsappMessages.clinicId, whatsappMessages.dedupeKey] })
    .returning();

  return row ?? null;
}

export async function markMessageSent(id: string, gatewayMessageId: string): Promise<void> {
  await db
    .update(whatsappMessages)
    .set({ status: 'sent', gatewayMessageId, error: null, sentAt: new Date(), updatedAt: new Date() })
    .where(eq(whatsappMessages.id, id));
}

export async function markMessageFailed(id: string, error: string): Promise<void> {
  await db
    .update(whatsappMessages)
    .set({ status: 'failed', error: error.slice(0, 500), updatedAt: new Date() })
    .where(eq(whatsappMessages.id, id));
}

/**
 * Which prior statuses each receipt is allowed to overwrite.
 *
 * Receipts arrive out of order — a `read` can land before the `delivered` that
 * logically precedes it, and a late `delivered` can follow a `read` — so the
 * update is forward-only. Encoding that as a `WHERE status IN (…)` rather than a
 * read-compare-write also makes it race-safe at the database level and idempotent
 * on redelivery.
 */
const ADVANCE_FROM = {
  sent: ['queued'],
  delivered: ['queued', 'sent'],
  read: ['queued', 'sent', 'delivered'],
  failed: ['queued', 'sent'],
} as const satisfies Partial<Record<WhatsappMessageStatus, readonly WhatsappMessageStatus[]>>;

export type DeliveryReceipt = keyof typeof ADVANCE_FROM;

/**
 * Advances one message's delivery state from a `message.ack` webhook.
 *
 * Scoped by clinic as well as by gateway message id: WhatsApp ids are unique per
 * account, not globally, so an ack for one clinic must never advance a same-id
 * row belonging to another.
 *
 * Returns the number of rows advanced — 0 means the ack was late, duplicate, or
 * about a message this app did not send, all of which are unremarkable.
 */
export async function applyDeliveryStatus(
  clinicId: string,
  gatewayMessageId: string,
  status: DeliveryReceipt,
  error?: string | null,
): Promise<number> {
  const rows = await db
    .update(whatsappMessages)
    .set({
      status,
      ...(status === 'failed' && error ? { error: error.slice(0, 500) } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(whatsappMessages.clinicId, clinicId),
        eq(whatsappMessages.gatewayMessageId, gatewayMessageId),
        inArray(whatsappMessages.status, [...ADVANCE_FROM[status]]),
      ),
    )
    .returning({ id: whatsappMessages.id });

  return rows.length;
}

type InboundRecord = {
  clinicId: string;
  clientId: string | null;
  chatId: string;
  phone: string;
  body: string;
  /** `inbound:<idempotencyKey>` — see `inbound.ts`. */
  dedupeKey: string;
  gatewayMessageId: string | null;
};

/**
 * Files a client's reply.
 *
 * Idempotent by the same unique index as an outbound claim: the gateway retries a
 * delivery it could not confirm, and a retry must not double the thread. Returns
 * `null` when this message was already recorded.
 */
export async function recordInboundMessage(record: InboundRecord): Promise<WhatsappMessage | null> {
  const [row] = await db
    .insert(whatsappMessages)
    .values({
      ...record,
      direction: 'inbound',
      kind: 'inbound',
      status: 'received',
      sentAt: new Date(),
    })
    .onConflictDoNothing({ target: [whatsappMessages.clinicId, whatsappMessages.dedupeKey] })
    .returning();

  return row ?? null;
}

