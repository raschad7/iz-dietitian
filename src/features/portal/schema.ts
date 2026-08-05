import { z } from 'zod';

import { isoDateSchema, uuidSchema } from '@/features/booking/schema';
import { defaultLocale, locales } from '@/i18n/routing';

import { ADHERENCE_LEVELS } from './adherence';
import {
  CLIENT_REQUEST_TOPICS,
  CONTACT_METHODS,
  NOTIFICATION_KINDS,
  REQUEST_KINDS,
  THEME_PREFERENCES,
} from './types';

/**
 * Zod schemas for everything crossing the portal's server-action boundary.
 *
 * Shape only. Whether a slot is actually free is a question about the database,
 * so it is answered in `./mutations.ts` against rows read inside the write — the
 * same split as `src/features/booking/schema.ts`, whose date and minute schemas
 * are reused here rather than restated.
 */

export const localeSchema = z.enum(locales).catch(defaultLocale);

/** An untouched optional field arrives from FormData as `''`, not as absent. */
function blankToUndefined(value: unknown): unknown {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

const noteSchema = z.preprocess(blankToUndefined, z.string().trim().max(500).optional());

/**
 * A request to book, move, or cancel.
 *
 * Discriminated on `kind`, because the three carry genuinely different payloads
 * and a single optional-everything object would push the "which fields does
 * this one need?" question into the mutation, where the database check
 * constraints would be the only thing left enforcing it.
 *
 * **A client names a day, never a time.** Which hour they are seen at is the
 * dietitian's call — it depends on how long the consultation needs, what else
 * is on that day, and who else is waiting, none of which the client can see. So
 * there is no `preferredStartMinute` here, and its absence is the enforcement:
 * a crafted post cannot smuggle one in, because the schema has nowhere to put
 * it. The dietitian sets the time when they approve, from `/app/requests`.
 *
 * That is also why `startMinuteSchema` is no longer imported in this module. It
 * still governs the staff side, where a time genuinely is chosen — see
 * `src/features/requests/schema.ts`.
 */
export const appointmentRequestSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal(REQUEST_KINDS[0]),
    preferredDate: isoDateSchema,
    note: noteSchema,
  }),
  z.object({
    kind: z.literal(REQUEST_KINDS[1]),
    appointmentId: uuidSchema,
    preferredDate: isoDateSchema,
    note: noteSchema,
  }),
  z.object({
    kind: z.literal(REQUEST_KINDS[2]),
    appointmentId: uuidSchema,
    note: noteSchema,
  }),
]);

export type AppointmentRequestInput = z.infer<typeof appointmentRequestSchema>;

export const withdrawRequestSchema = z.object({ requestId: uuidSchema });

/** Which language the clinic writes to the client in. */
export const languagePreferenceSchema = z.object({ preferredLocale: z.enum(locales) });

/**
 * One notification switch being flipped.
 *
 * A key plus a boolean rather than the whole set: each switch is its own form,
 * so a slow save on one cannot roll back a change the client made to another
 * while it was in flight.
 *
 * The value arrives as the string a `<button name value>` submits, because that
 * is what makes the switch work with no JavaScript at all.
 */
export const notificationSettingSchema = z.object({
  kind: z.enum(NOTIFICATION_KINDS),
  enabled: z.enum(['on', 'off']).transform((value) => value === 'on'),
});

export type NotificationSettingInput = z.infer<typeof notificationSettingSchema>;

/**
 * A day's adherence report — the value the progress tab's segmented control
 * submits directly (§9.3: "a segment carries the value it selects"). The date
 * is never part of this shape: the action always writes against the clinic's
 * own `today`, never a date the caller names.
 */
export const planAdherenceSchema = z.object({ level: z.enum(ADHERENCE_LEVELS) });

export const themePreferenceSchema = z.object({ theme: z.enum(THEME_PREFERENCES) });

export const contactMethodSchema = z.object({ preferredContact: z.enum(CONTACT_METHODS) });

/**
 * A request to have something in the record corrected.
 *
 * The topic is a hidden field the screen supplies, so the client is never asked
 * to classify their own problem before they can describe it. The message is
 * required and bounded: an inbox item that does not say what is wrong is one
 * nobody can act on, and the database restates the same rule as a check
 * constraint.
 */
export const dataUpdateRequestSchema = z.object({
  topic: z.enum(CLIENT_REQUEST_TOPICS),
  message: z.string().trim().min(1).max(1000),
});

export type DataUpdateRequestInput = z.infer<typeof dataUpdateRequestSchema>;

/**
 * A request to close the account. The reason is optional — someone asking to
 * leave does not owe an explanation before the ask is accepted.
 */
export const accountDeletionRequestSchema = z.object({
  message: z.preprocess(blankToUndefined, z.string().trim().max(1000).optional()),
  /**
   * The confirmation step, carried as data rather than as trust in the UI. The
   * screen asks twice; this is what proves the second answer reached the server,
   * so a stray POST cannot file a deletion on a client's behalf.
   */
  confirm: z.literal('confirmed'),
});

export type AccountDeletionRequestInput = z.infer<typeof accountDeletionRequestSchema>;

/** `?date=` on the request page. Falls back to today, which a schema has no clock to know. */
export const requestSearchSchema = z.object({
  date: z.string().trim().refine((value) => isoDateSchema.safeParse(value).success).optional().catch(undefined),
  kind: z.enum(REQUEST_KINDS).catch('new'),
  appointmentId: z.string().trim().pipe(uuidSchema).optional().catch(undefined),
});

export type RequestSearchInput = z.infer<typeof requestSearchSchema>;

/**
 * `?day=` on the meal-plan page: which day of the published week is open.
 *
 * Nullable rather than defaulted, because "not asked for" and "asked for Sunday"
 * are different — the page falls back to today, and a schema has no clock to
 * know which day that is. Anything unparseable is treated as not asked for
 * rather than rejected: a mistyped URL should open the plan, not a 500.
 */
export const planSearchSchema = z.object({
  day: z.coerce.number().int().min(0).max(6).nullable().catch(null),
});

export type PlanSearchInput = z.infer<typeof planSearchSchema>;
