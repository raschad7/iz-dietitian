import { and, asc, eq } from 'drizzle-orm';

import { db, type Database } from '@/db';
import { isBookingConflict, pgConstraintName } from '@/db/errors';
import { appointments, clients, clinics, practitioners } from '@/db/schema';
import { normalizeForSearch } from '@/features/clients/search';
import { pickAvatarColor } from '@/lib/avatar-color';

import { type BookingInput, type CreateClientAndBookInput, type UpdateAppointmentInput } from './schema';
import { type ActionResult, type CreatedAppointment } from './types';
import { validateBooking, type ClinicHours, type ExistingAppointment } from './validation';

/**
 * Every write to the appointments table.
 *
 * Imports nothing from Next.js on purpose, so `bun test` can call these
 * directly — a `"use server"` module calling `revalidatePath` cannot run outside
 * a request scope. `actions.ts` is the thin layer that adds the Next concerns.
 *
 * ## The shape of every write
 *
 * Read fresh → validate → write, all inside one transaction:
 *
 *  1. Resolve the clinic's practitioner and confirm the client belongs to the
 *     caller's clinic. Ids arriving from the browser are not to be trusted;
 *     without this, posting another clinic's client id would book across the
 *     tenant boundary.
 *  2. Re-read opening hours and the day's appointments *inside* the transaction.
 *     The client validated against whatever was on screen, which may be stale.
 *  3. Run the same `validateBooking` the client ran. Same function, same rules —
 *     they cannot drift, because there is only one copy.
 *  4. Write, and translate a constraint violation into an ordinary rejection.
 *
 * Step 4 is not belt-and-braces. Two writes racing for the same slot both pass
 * step 3 against a clean read; only the database can arbitrate that, and it does
 * so with the constraints in `drizzle/0004`.
 */

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Who the appointment is with.
 *
 * The clinic has exactly one practitioner and it is the account holder, so this
 * is never chosen in the UI and never accepted from a request — it is resolved
 * from the session's own clinic. `ownerName` is only used the first time, to
 * name the row.
 */
export type BookingContext = { clinicId: string; ownerName: string };

/** Matches one appointment within one clinic, so a foreign id matches no rows. */
function scopedToClinic(clinicId: string, id: string) {
  return and(eq(appointments.id, id), eq(appointments.clinicId, clinicId));
}

/**
 * The clinic's practitioner, created on first use.
 *
 * The practitioner row still exists — appointments hang off it, and the overlap
 * constraint is keyed on it — but with a single-doctor clinic there is nothing
 * to choose, so it is provisioned lazily rather than asked for. That keeps
 * "hire a second dietitian" a UI change rather than a migration, which is the
 * same reasoning that gave `clinics` its own table.
 *
 * Ordered by creation so that if two concurrent first-time requests both insert,
 * every later call still agrees on which row is *the* practitioner.
 */
export async function resolvePractitioner(tx: Tx, context: BookingContext): Promise<string> {
  const [existing] = await tx
    .select({ id: practitioners.id })
    .from(practitioners)
    .where(eq(practitioners.clinicId, context.clinicId))
    .orderBy(asc(practitioners.createdAt), asc(practitioners.id))
    .limit(1);

  if (existing) return existing.id;

  const [created] = await tx
    .insert(practitioners)
    .values({ clinicId: context.clinicId, name: context.ownerName })
    .returning({ id: practitioners.id });

  if (!created) throw new Error('insert into practitioners returned no row');

  return created.id;
}

async function readHours(tx: Tx, clinicId: string): Promise<ClinicHours | null> {
  const [row] = await tx
    .select({ workingDays: clinics.workingDays, openMinute: clinics.openMinute, closeMinute: clinics.closeMinute })
    .from(clinics)
    .where(eq(clinics.id, clinicId))
    .limit(1);

  return row ?? null;
}

/**
 * The day's appointments, which is everything rules 4 and 5 consult. Reading one
 * date rather than the visible range keeps this cheap and is backed by
 * `appointments_clinic_id_date_idx`.
 */
async function readDay(tx: Tx, clinicId: string, date: string): Promise<ExistingAppointment[]> {
  return tx
    .select({
      id: appointments.id,
      practitionerId: appointments.practitionerId,
      clientId: appointments.clientId,
      date: appointments.date,
      startMinute: appointments.startMinute,
      durationMinutes: appointments.durationMinutes,
    })
    .from(appointments)
    .where(and(eq(appointments.clinicId, clinicId), eq(appointments.date, date)));
}

async function ownsClient(tx: Tx, clinicId: string, clientId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.clinicId, clinicId)))
    .limit(1);

  return row !== undefined;
}

/**
 * Turns a constraint violation into the message that rule would have produced.
 *
 * Reading the constraint name means a race reports the *specific* reason — "that
 * slot was just taken" versus "they are already booked today" — rather than a
 * generic "try again". Both constraints are named in `drizzle/0004` and in
 * `src/db/schema/appointments.ts`.
 */
function conflictToError(error: unknown): ActionResult<never> {
  switch (pgConstraintName(error)) {
    case 'appointments_practitioner_no_overlap':
      return { ok: false, error: 'errors.overlap' };
    case 'appointments_client_id_date_idx':
      return { ok: false, error: 'errors.clientBooked' };
    default:
      return { ok: false, error: 'errors.unexpected' };
  }
}

export async function createAppointment(
  context: BookingContext,
  input: BookingInput,
): Promise<ActionResult<CreatedAppointment>> {
  const { clinicId } = context;

  try {
    return await db.transaction(async (tx) => {
      const hours = await readHours(tx, clinicId);
      if (!hours) return { ok: false, error: 'errors.unexpected' };

      if (!(await ownsClient(tx, clinicId, input.clientId))) {
        return { ok: false, error: 'errors.notFound' };
      }

      const practitionerId = await resolvePractitioner(tx, context);
      const existing = await readDay(tx, clinicId, input.date);

      const failure = validateBooking({ ...input, practitionerId }, existing, hours);
      if (failure) return { ok: false, error: failure };

      const [row] = await tx
        .insert(appointments)
        .values({
          clinicId,
          practitionerId,
          clientId: input.clientId,
          date: input.date,
          startMinute: input.startMinute,
          durationMinutes: input.durationMinutes,
          reason: input.reason ?? null,
        })
        .returning({ id: appointments.id });

      if (!row) return { ok: false, error: 'errors.unexpected' };

      return { ok: true, data: { id: row.id } };
    });
  } catch (error) {
    if (isBookingConflict(error)) return conflictToError(error);
    console.error('[booking] create failed', error);
    return { ok: false, error: 'errors.unexpected' };
  }
}

export async function updateAppointment(
  context: BookingContext,
  input: UpdateAppointmentInput,
): Promise<ActionResult> {
  const { clinicId } = context;

  try {
    return await db.transaction(async (tx) => {
      const hours = await readHours(tx, clinicId);
      if (!hours) return { ok: false, error: 'errors.unexpected' };

      const [current] = await tx
        .select({ id: appointments.id, practitionerId: appointments.practitionerId })
        .from(appointments)
        .where(scopedToClinic(clinicId, input.id))
        .limit(1);

      if (!current) return { ok: false, error: 'errors.notFound' };

      if (!(await ownsClient(tx, clinicId, input.clientId))) {
        return { ok: false, error: 'errors.notFound' };
      }

      // The appointment keeps whichever practitioner it was booked with. There
      // is no UI to change it, so it is read from the row rather than accepted
      // from the request.
      const practitionerId = current.practitionerId;

      const existing = await readDay(tx, clinicId, input.date);

      // `excludeId` is what stops a move from colliding with the appointment
      // being moved.
      const failure = validateBooking({ ...input, practitionerId, excludeId: input.id }, existing, hours);
      if (failure) return { ok: false, error: failure };

      await tx
        .update(appointments)
        .set({
          clientId: input.clientId,
          date: input.date,
          startMinute: input.startMinute,
          durationMinutes: input.durationMinutes,
          reason: input.reason ?? null,
          updatedAt: new Date(),
        })
        .where(scopedToClinic(clinicId, input.id));

      return { ok: true, data: undefined };
    });
  } catch (error) {
    if (isBookingConflict(error)) return conflictToError(error);
    console.error('[booking] update failed', error);
    return { ok: false, error: 'errors.unexpected' };
  }
}

export async function deleteAppointment(clinicId: string, id: string): Promise<ActionResult> {
  try {
    const rows = await db.delete(appointments).where(scopedToClinic(clinicId, id)).returning({ id: appointments.id });

    // No rows means either "no such appointment" or "not this clinic's". The
    // caller cannot tell the two apart, which is deliberate.
    return rows.length > 0 ? { ok: true, data: undefined } : { ok: false, error: 'errors.notFound' };
  } catch (error) {
    console.error('[booking] delete failed', error);
    return { ok: false, error: 'errors.unexpected' };
  }
}

/**
 * Creates a client and books the pending slot in one transaction.
 *
 * One step, because that is what the picker promises: the doctor pressed "New
 * client" *while* booking. If the booking is then rejected — the slot went in
 * the meantime — the client is rolled back too rather than being left behind as
 * a half-finished record nobody asked for.
 */
export async function createClientAndBook(
  context: BookingContext,
  input: CreateClientAndBookInput,
): Promise<ActionResult<CreatedAppointment>> {
  const { clinicId } = context;

  try {
    return await db.transaction(async (tx) => {
      const hours = await readHours(tx, clinicId);
      if (!hours) return { ok: false, error: 'errors.unexpected' };

      const practitionerId = await resolvePractitioner(tx, context);
      const existing = await readDay(tx, clinicId, input.booking.date);

      // Validated before the client row is written: a rejected slot should not
      // leave a new person in the register. `clientId` is absent, so rule 5 is
      // skipped — a brand-new client cannot already be booked.
      const failure = validateBooking({ ...input.booking, practitionerId }, existing, hours);
      if (failure) return { ok: false, error: failure };

      const [client] = await tx
        .insert(clients)
        .values({
          clinicId,
          fullName: input.client.fullName,
          searchName: normalizeForSearch(input.client.fullName),
          phone: input.client.phone ?? null,
          color: pickAvatarColor(input.client.fullName),
        })
        .returning({ id: clients.id });

      if (!client) return { ok: false, error: 'errors.unexpected' };

      const [row] = await tx
        .insert(appointments)
        .values({
          clinicId,
          practitionerId,
          clientId: client.id,
          date: input.booking.date,
          startMinute: input.booking.startMinute,
          durationMinutes: input.booking.durationMinutes,
          reason: input.booking.reason ?? null,
        })
        .returning({ id: appointments.id });

      if (!row) return { ok: false, error: 'errors.unexpected' };

      return { ok: true, data: { id: row.id } };
    });
  } catch (error) {
    if (isBookingConflict(error)) return conflictToError(error);
    console.error('[booking] create client and book failed', error);
    return { ok: false, error: 'errors.unexpected' };
  }
}

/**
 * Provisions the clinic's practitioner outside a write path, so the calendar
 * can render before anything has been booked.
 */
export async function ensurePractitioner(context: BookingContext): Promise<string> {
  return db.transaction((tx) => resolvePractitioner(tx, context));
}
