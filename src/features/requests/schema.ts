import { z } from 'zod';

import {
  durationSchema,
  isoDateSchema,
  reasonSchema,
  startMinuteSchema,
  uuidSchema,
} from '@/features/booking/schema';
import { CLIENT_REQUEST_KINDS } from '@/features/portal/types';

/**
 * Zod schemas for everything crossing the inbox's server-action boundary.
 *
 * The primitives are imported from `src/features/booking/schema.ts` rather than
 * restated, because an approval *is* a booking: if the calendar accepts a
 * duration this rejects, the dialog would refuse a slot the day view allows.
 * One definition, one behaviour.
 *
 * As there, these check *shape* only. Whether 10:00 is actually free is a
 * question about the database, and it is answered inside the booking
 * transaction against rows read at that moment — see `./mutations.ts`.
 */

/**
 * Approving a request.
 *
 * The time is optional here and required by the mutation for the kinds that
 * need one, rather than being split into three schemas. The kind is not in this
 * payload at all: it is read from the stored row, because a browser that could
 * name the kind could turn a cancellation into a booking.
 */
export const approveAppointmentRequestSchema = z.object({
  requestId: uuidSchema,
  /** What the dietitian settled on, which need not be what was asked for. */
  date: isoDateSchema.optional(),
  startMinute: startMinuteSchema.optional(),
  durationMinutes: durationSchema.optional(),
  reason: reasonSchema,
});

export type ApproveAppointmentRequestInput = z.infer<typeof approveAppointmentRequestSchema>;

export const declineAppointmentRequestSchema = z.object({ requestId: uuidSchema });

export type DeclineAppointmentRequestInput = z.infer<typeof declineAppointmentRequestSchema>;

/**
 * Answering a request about the client's own record.
 *
 * `resolved` means a person has done whatever was asked; `declined` means they
 * will not. Neither writes anything to the client's record — see the header of
 * `src/db/schema/client-requests.ts` for why that is the design and not an
 * omission.
 */
export const answerClientRequestSchema = z.object({
  requestId: uuidSchema,
  status: z.enum(['resolved', 'declined']),
  kind: z.enum(CLIENT_REQUEST_KINDS).optional(),
});

export type AnswerClientRequestInput = z.infer<typeof answerClientRequestSchema>;
