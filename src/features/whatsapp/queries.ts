import { and, asc, between, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';

import { db } from '@/db';
import {
  appointments,
  clients,
  clinics,
  whatsappMessages,
  whatsappSettings,
  type WhatsappSettings,
} from '@/db/schema';
import { type Locale } from '@/i18n/routing';

import { phoneMatchKey } from './phone';
import {
  type AppointmentSeriesTarget,
  type MessageLogEntry,
  type ReminderCandidate,
  type WhatsappTarget,
} from './types';

/**
 * Reads for the WhatsApp feature. No Next.js imports, so `bun test` and the
 * reminder script call these directly.
 *
 * `clinicId` leads every clinic-scoped read. The two functions that do not take
 * one — {@link findSettingsBySessionId} and {@link listReminderReadyClinics} —
 * are the webhook and the cron job, which have no session to derive a tenant
 * from and resolve it here instead.
 */

export async function getSettings(clinicId: string): Promise<WhatsappSettings | null> {
  const [row] = await db.select().from(whatsappSettings).where(eq(whatsappSettings.clinicId, clinicId)).limit(1);

  return row ?? null;
}

/**
 * The clinic a gateway session belongs to.
 *
 * This is the whole tenant resolution for an inbound event: the delivery names a
 * session, `whatsapp_settings.session_id` is unique, and everything the handler
 * writes afterwards is scoped by the `clinicId` it returns. An event for an
 * unknown session resolves to `null` and is dropped — on a gateway shared with
 * another application, most events are exactly that.
 */
export async function findSettingsBySessionId(sessionId: string): Promise<WhatsappSettings | null> {
  const [row] = await db.select().from(whatsappSettings).where(eq(whatsappSettings.sessionId, sessionId)).limit(1);

  return row ?? null;
}

/**
 * Clinics whose reminders should run: connected, switched on, and holding a
 * session the gateway knows about.
 *
 * The clinic name comes along because it goes into the message body, and fetching
 * it per clinic inside the loop would be a query per reminder.
 */
export async function listReminderReadyClinics(): Promise<
  { settings: WhatsappSettings; clinicName: string }[]
> {
  const rows = await db
    .select({ settings: whatsappSettings, clinicName: clinics.name })
    .from(whatsappSettings)
    .innerJoin(clinics, eq(clinics.id, whatsappSettings.clinicId))
    .where(
      and(
        eq(whatsappSettings.remindersEnabled, true),
        eq(whatsappSettings.status, 'ready'),
        isNotNull(whatsappSettings.sessionId),
      ),
    )
    .orderBy(asc(whatsappSettings.clinicId));

  return rows;
}

/**
 * Appointments in a clinic-local date range, with everything a reminder needs.
 *
 * Clients with no phone number are excluded here rather than filtered later: a
 * reminder to nobody is not a reminder, and leaving them in would make the
 * "nothing to send" case indistinguishable from "everyone was reminded".
 *
 * Archived clients are still included. Somebody archived mid-course still has a
 * booked appointment, and standing them up is worse than an extra message.
 */
export async function listAppointmentsForReminders(
  clinicId: string,
  fromDate: string,
  toDate: string,
): Promise<ReminderCandidate[]> {
  const rows = await db
    .select({
      appointmentId: appointments.id,
      clientId: clients.id,
      date: appointments.date,
      startMinute: appointments.startMinute,
      clientName: clients.fullName,
      phone: clients.phone,
      preferredLocale: clients.preferredLocale,
    })
    .from(appointments)
    .innerJoin(clients, eq(clients.id, appointments.clientId))
    .where(
      and(
        eq(appointments.clinicId, clinicId),
        between(appointments.date, fromDate, toDate),
        isNotNull(clients.phone),
        sql`length(regexp_replace(${clients.phone}, '\\D', '', 'g')) > 0`,
      ),
    )
    .orderBy(asc(appointments.date), asc(appointments.startMinute));

  return rows.map((row) => ({
    ...row,
    phone: row.phone ?? '',
    preferredLocale: row.preferredLocale as Locale,
  }));
}

/**
 * One appointment, shaped for the confirmation message sent when it is booked.
 *
 * Scoped to the clinic, so an appointment id from another tenant resolves to
 * `null` instead of leaking a name and a phone number.
 */
export async function getAppointmentTarget(
  clinicId: string,
  appointmentId: string,
): Promise<(ReminderCandidate & { clinicName: string }) | null> {
  const [row] = await db
    .select({
      appointmentId: appointments.id,
      clientId: clients.id,
      date: appointments.date,
      startMinute: appointments.startMinute,
      clientName: clients.fullName,
      phone: clients.phone,
      preferredLocale: clients.preferredLocale,
      clinicName: clinics.name,
    })
    .from(appointments)
    .innerJoin(clients, eq(clients.id, appointments.clientId))
    .innerJoin(clinics, eq(clinics.id, appointments.clinicId))
    .where(and(eq(appointments.id, appointmentId), eq(appointments.clinicId, clinicId)))
    .limit(1);

  if (!row?.phone) return null;

  return { ...row, phone: row.phone, preferredLocale: row.preferredLocale as Locale };
}

/**
 * Several appointments of one client, shaped for a single message about all of
 * them.
 *
 * One query rather than a loop over {@link getAppointmentTarget}: a month of
 * weekly visits is four round-trips that way, and every row would repeat the
 * same client and clinic. Rows are read in date order so the list a patient
 * reads runs forwards in time.
 *
 * Scoped by clinic, like every read here, and returns `null` if the ids resolve
 * to nothing, to more than one client, or to a client with no phone number —
 * the last two are not errors, they are simply nothing to send.
 */
export async function getAppointmentSeriesTarget(
  clinicId: string,
  appointmentIds: readonly string[],
): Promise<AppointmentSeriesTarget | null> {
  if (appointmentIds.length === 0) return null;

  const rows = await db
    .select({
      appointmentId: appointments.id,
      clientId: clients.id,
      date: appointments.date,
      startMinute: appointments.startMinute,
      durationMinutes: appointments.durationMinutes,
      clientName: clients.fullName,
      phone: clients.phone,
      clinicName: clinics.name,
    })
    .from(appointments)
    .innerJoin(clients, eq(clients.id, appointments.clientId))
    .innerJoin(clinics, eq(clinics.id, appointments.clinicId))
    .where(and(inArray(appointments.id, [...appointmentIds]), eq(appointments.clinicId, clinicId)))
    .orderBy(asc(appointments.date), asc(appointments.startMinute));

  const [first] = rows;
  if (!first?.phone) return null;

  // One message can only be addressed to one person. A mixed set means the
  // caller has a bug, and sending one client another's schedule would be a
  // considerably worse outcome than sending nothing.
  if (rows.some((row) => row.clientId !== first.clientId)) return null;

  return {
    clientId: first.clientId,
    clientName: first.clientName,
    phone: first.phone,
    clinicName: first.clinicName,
    appointments: rows.map((row) => ({
      appointmentId: row.appointmentId,
      date: row.date,
      startMinute: row.startMinute,
      durationMinutes: row.durationMinutes,
    })),
  };
}

/** One client, shaped for a hand-typed or credential message. */
export async function getClientTarget(clinicId: string, clientId: string): Promise<WhatsappTarget | null> {
  const [row] = await db
    .select({
      clientId: clients.id,
      clientName: clients.fullName,
      phone: clients.phone,
      preferredLocale: clients.preferredLocale,
      clinicName: clinics.name,
    })
    .from(clients)
    .innerJoin(clinics, eq(clinics.id, clients.clinicId))
    .where(and(eq(clients.id, clientId), eq(clients.clinicId, clinicId)))
    .limit(1);

  if (!row) return null;

  return { ...row, preferredLocale: row.preferredLocale as Locale };
}

/**
 * The client an inbound number belongs to, or `null` for a stranger.
 *
 * Matched on the last nine digits (see `phoneMatchKey`): the roster holds
 * `0599…` while WhatsApp reports `970599…`, and those are the same person.
 * `regexp_replace` strips the punctuation staff typed, and the comparison happens
 * in SQL so this is one indexless-but-tiny scan of one clinic's clients rather
 * than a full roster fetched into memory.
 *
 * When two clients share a number — a parent's phone on two children's records —
 * the older record wins, deterministically. A misfiled reply is visible in the
 * thread; a crash or a duplicate is not.
 */
export async function findClientByPhone(clinicId: string, phone: string): Promise<string | null> {
  const key = phoneMatchKey(phone);
  if (!key) return null;

  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(
      and(
        eq(clients.clinicId, clinicId),
        sql`right(regexp_replace(${clients.phone}, '\\D', '', 'g'), 9) = ${key}`,
      ),
    )
    .orderBy(asc(clients.createdAt))
    .limit(1);

  return row?.id ?? null;
}

/** The clinic's message log, newest first — what the settings page shows. */
export async function listRecentMessages(clinicId: string, limit = 25): Promise<MessageLogEntry[]> {
  const rows = await db
    .select({
      id: whatsappMessages.id,
      direction: whatsappMessages.direction,
      kind: whatsappMessages.kind,
      status: whatsappMessages.status,
      body: whatsappMessages.body,
      phone: whatsappMessages.phone,
      error: whatsappMessages.error,
      createdAt: whatsappMessages.createdAt,
      clientId: whatsappMessages.clientId,
      clientName: clients.fullName,
    })
    .from(whatsappMessages)
    .leftJoin(clients, eq(clients.id, whatsappMessages.clientId))
    .where(eq(whatsappMessages.clinicId, clinicId))
    .orderBy(desc(whatsappMessages.createdAt), desc(whatsappMessages.id))
    .limit(limit);

  return rows as MessageLogEntry[];
}

/** One client's conversation, oldest first — the order a chat reads in. */
export async function listClientThread(
  clinicId: string,
  clientId: string,
  limit = 50,
): Promise<MessageLogEntry[]> {
  const rows = await db
    .select({
      id: whatsappMessages.id,
      direction: whatsappMessages.direction,
      kind: whatsappMessages.kind,
      status: whatsappMessages.status,
      body: whatsappMessages.body,
      phone: whatsappMessages.phone,
      error: whatsappMessages.error,
      createdAt: whatsappMessages.createdAt,
      clientId: whatsappMessages.clientId,
      clientName: clients.fullName,
    })
    .from(whatsappMessages)
    .leftJoin(clients, eq(clients.id, whatsappMessages.clientId))
    .where(and(eq(whatsappMessages.clinicId, clinicId), eq(whatsappMessages.clientId, clientId)))
    .orderBy(desc(whatsappMessages.createdAt))
    .limit(limit);

  return (rows as MessageLogEntry[]).reverse();
}
