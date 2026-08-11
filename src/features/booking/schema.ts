import { z } from 'zod';

import { MINUTES_PER_DAY, SLOT_MINUTES } from '@/lib/time-constants';
import { defaultLocale, locales } from '@/i18n/routing';

import { isIsoDate } from './date';
import { MAX_REPEAT_WEEKS } from './repeat';

/**
 * Zod schemas for everything crossing the server-action boundary.
 *
 * These check *shape*: is this a uuid, is that an integer in range. They
 * deliberately do not check booking rules — those live in `./validation.ts` and
 * are re-run server side against freshly read rows, because whether 10:00 is
 * free is a question about the database, not about the payload.
 */

/** An untouched optional input arrives from FormData as `''`, not as absent. */
function blankToUndefined(value: unknown): unknown {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

export const localeSchema = z.enum(locales).catch(defaultLocale);

export const uuidSchema = z.uuid();

/**
 * `YYYY-MM-DD`, and a date that actually existed. The regex alone would accept
 * `2026-02-30`, which PostgreSQL would then reject with a 500 rather than a
 * readable message.
 */
export const isoDateSchema = z
  .string()
  .trim()
  .refine(isIsoDate, { message: 'expected a real YYYY-MM-DD date' });

export const startMinuteSchema = z.coerce.number().int().min(0).max(MINUTES_PER_DAY - 1);

export const durationSchema = z.coerce.number().int().min(SLOT_MINUTES).max(MINUTES_PER_DAY);

/** Free text. No default anywhere — an empty field, placeholder only. */
export const reasonSchema = z.preprocess(blankToUndefined, z.string().trim().max(500).optional());

/**
 * The shape of a booking, shared by create and update.
 *
 * No `practitionerId`. The clinic has one practitioner and it is the account
 * holder, so it is resolved from the session server side — accepting it here
 * would be a field the browser could point at another clinic's rota.
 */
export const bookingInputSchema = z.object({
  clientId: uuidSchema,
  date: isoDateSchema,
  startMinute: startMinuteSchema,
  durationMinutes: durationSchema,
  reason: reasonSchema,
});

export type BookingInput = z.infer<typeof bookingInputSchema>;

/**
 * Whether a weekly repeat was chosen alongside this booking.
 *
 * It changes nothing about what gets written — the repeat is still its own
 * action, run afterwards — and exists only so the create knows to **stay
 * quiet**. A repeat's patient message names every appointment in the course
 * including this one, so a confirmation sent from here would be the first line
 * of a message the patient is about to receive in full, seconds earlier and
 * with three quarters of it missing.
 *
 * A boolean rather than the span, because the number is the repeat action's
 * business and the create has one decision to make with it.
 */
const repeatsSchema = z.boolean().optional();

export const createAppointmentSchema = bookingInputSchema.extend({ repeats: repeatsSchema });

export const updateAppointmentSchema = bookingInputSchema.extend({ id: uuidSchema });

export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;

export const deleteAppointmentSchema = z.object({ id: uuidSchema });

/**
 * The weekly repeat: the booking that was just saved, described again, plus how
 * many weekly appointments to add after it.
 *
 * The same shape as a create: the repeats are new bookings rather than copies of
 * a row, so nothing here is read back off the original. `date` is the *first*
 * one; the server does the arithmetic for the weeks after it.
 *
 * `appointmentId` is the one thing that does name the original, and it is for
 * the patient's message rather than for the writing: the course goes out as a
 * single message listing every appointment in it, and the first of them is this
 * row. It is never cloned, never written to, and only ever read through
 * `getAppointmentSeriesTarget`, which is scoped to the session's clinic and
 * refuses a set spanning two clients — so an id the browser made up resolves to
 * nothing, and the worst it can produce is no message.
 */
export const repeatWeeklySchema = bookingInputSchema.extend({
  appointmentId: uuidSchema,
  weeks: z.coerce.number().int().min(1).max(MAX_REPEAT_WEEKS),
});

export type RepeatWeeklyInput = z.infer<typeof repeatWeeklySchema>;

/**
 * The picker's "New client" path: the minimum needed to book someone, not the
 * full intake form. The rest of the record is filled in later from the clients
 * area — the point of this dialog is that staff are mid-booking and have a
 * person in front of them.
 */
export const newClientSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.preprocess(blankToUndefined, z.string().trim().max(40).optional()),
});

export type NewClientInput = z.infer<typeof newClientSchema>;

/** Creating a client and booking them into the pending slot, in one step. */
export const createClientAndBookSchema = z.object({
  client: newClientSchema,
  booking: bookingInputSchema.omit({ clientId: true }),
  /** Same silence as the plain create — see {@link repeatsSchema}. */
  repeats: repeatsSchema,
});

export type CreateClientAndBookInput = z.infer<typeof createClientAndBookSchema>;

/** Which slice of the calendar a page is showing. */
export const CALENDAR_VIEWS = ['day', 'week', 'month'] as const;

export type CalendarView = (typeof CALENDAR_VIEWS)[number];

export const calendarSearchSchema = z.object({
  view: z.enum(CALENDAR_VIEWS).catch('week'),
  /** Falls back to "today", resolved by the caller — a schema has no clock. */
  date: z.string().trim().refine(isIsoDate).optional().catch(undefined),
});

export type CalendarSearchInput = z.infer<typeof calendarSearchSchema>;
