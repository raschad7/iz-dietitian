'use server';

import { revalidatePath } from 'next/cache';

import { requireStaffClinic } from '@/lib/session';
import { type Locale } from '@/i18n/routing';

import {
  createAppointment,
  createClientAndBook,
  deleteAppointment,
  updateAppointment,
  type BookingContext,
} from './mutations';
import {
  createAppointmentSchema,
  createClientAndBookSchema,
  deleteAppointmentSchema,
  localeSchema,
  updateAppointmentSchema,
} from './schema';
import { type ActionResult, type CreatedAppointment } from './types';

/**
 * The booking feature's mutations.
 *
 * A server action is a public endpoint: the page guard protects the render, not
 * the write. So every action here re-verifies the session and scopes the write
 * to the caller's own clinic, exactly as `src/features/clients/actions.ts` does.
 *
 * These are thin on purpose. Validation lives in `./schema.ts`, the rules in
 * `./validation.ts`, and the read-validate-write transaction in `./mutations.ts`.
 * What is added here — and only here — are the Next.js concerns: the session
 * lookup and `revalidatePath`.
 *
 * Every action returns a discriminated result carrying a message key. Expected
 * business-rule failures are never thrown: "that slot is taken" is an answer,
 * and throwing would turn it into a 500 the user cannot read.
 *
 * This module is `"use server"`, so it may only export async functions — shared
 * types live in `./types.ts`.
 */

/**
 * Verifies the session and returns everything a write needs to know about who is
 * asking: the clinic to scope to, and the account holder's name, which names the
 * practitioner row the first time one is needed.
 */
async function bookingContext(locale: Locale): Promise<BookingContext> {
  const { session, clinicId } = await requireStaffClinic(locale);
  return { clinicId, ownerName: session.user.name };
}

/**
 * Revalidates every calendar view, not just the one the write came from — a
 * booking made in the day view changes what the week and month show too.
 */
function revalidateCalendar(locale: Locale): void {
  revalidatePath(`/${locale}/app/calendar`, 'layout');
}

export async function createAppointmentAction(
  rawLocale: string,
  input: unknown,
): Promise<ActionResult<CreatedAppointment>> {
  const locale = localeSchema.parse(rawLocale);
  const context = await bookingContext(locale);

  const parsed = createAppointmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'errors.invalid' };

  const result = await createAppointment(context, parsed.data);

  if (result.ok) revalidateCalendar(locale);

  return result;
}

export async function updateAppointmentAction(rawLocale: string, input: unknown): Promise<ActionResult> {
  const locale = localeSchema.parse(rawLocale);
  const context = await bookingContext(locale);

  const parsed = updateAppointmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'errors.invalid' };

  const result = await updateAppointment(context, parsed.data);

  if (result.ok) revalidateCalendar(locale);

  return result;
}

export async function deleteAppointmentAction(rawLocale: string, input: unknown): Promise<ActionResult> {
  const locale = localeSchema.parse(rawLocale);
  const context = await bookingContext(locale);

  const parsed = deleteAppointmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'errors.invalid' };

  const result = await deleteAppointment(context.clinicId, parsed.data.id);

  if (result.ok) revalidateCalendar(locale);

  return result;
}

/**
 * The picker's "New client" path: creates the client and books the pending slot
 * together, so an abandoned or rejected booking leaves no orphaned record.
 */
export async function createClientAndBookAction(
  rawLocale: string,
  input: unknown,
): Promise<ActionResult<CreatedAppointment>> {
  const locale = localeSchema.parse(rawLocale);
  const context = await bookingContext(locale);

  const parsed = createClientAndBookSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'errors.invalid' };

  const result = await createClientAndBook(context, parsed.data);

  if (result.ok) {
    revalidateCalendar(locale);
    // The register gained a client, so its list is stale too.
    revalidatePath(`/${locale}/app/clients`);
  }

  return result;
}
