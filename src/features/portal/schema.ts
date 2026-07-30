import { z } from 'zod';

import { isoDateSchema, startMinuteSchema, uuidSchema } from '@/features/booking/schema';
import { defaultLocale, locales } from '@/i18n/routing';

import { REQUEST_KINDS } from './types';

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
 */
export const appointmentRequestSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal(REQUEST_KINDS[0]),
    preferredDate: isoDateSchema,
    preferredStartMinute: startMinuteSchema,
    note: noteSchema,
  }),
  z.object({
    kind: z.literal(REQUEST_KINDS[1]),
    appointmentId: uuidSchema,
    preferredDate: isoDateSchema,
    preferredStartMinute: startMinuteSchema,
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

/** The one setting a client owns: which language the clinic writes to them in. */
export const languagePreferenceSchema = z.object({ preferredLocale: z.enum(locales) });

/** `?date=` on the request page. Falls back to today, which a schema has no clock to know. */
export const requestSearchSchema = z.object({
  date: z.string().trim().refine((value) => isoDateSchema.safeParse(value).success).optional().catch(undefined),
  kind: z.enum(REQUEST_KINDS).catch('new'),
  appointmentId: z.string().trim().pipe(uuidSchema).optional().catch(undefined),
});

export type RequestSearchInput = z.infer<typeof requestSearchSchema>;
