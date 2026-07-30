import { addDays, weekdayOf } from '@/features/booking/date';
import { getClinicHours } from '@/features/booking/queries';
import { type ClinicHours } from '@/features/booking/validation';
import { getPublishedBoard, type Board, type BoardDay } from '@/features/weekly-plans/queries';

import { nextAppointment, splitAppointments, type SplitAppointments } from './appointments';
import {
  getPortalAppointment,
  listClinicBookings,
  listPortalAppointments,
  listPortalRequests,
} from './queries';
import { type RequestSearchInput } from './schema';
import { availableSlots, selectableDays, REQUEST_WINDOW_DAYS } from './slots';
import { type PortalContext } from './session';
import {
  type PortalAppointment,
  type PortalRequest,
  type RequestKind,
  type RequestPageData,
} from './types';

/**
 * The server-side work behind each portal page.
 *
 * Route files under `src/app/[locale]/portal/**` resolve params, call the guard
 * and render — the reads are composed here, which is the project's architecture
 * rule (`src/features/README.md`). It also keeps each page to a single round of
 * parallel queries rather than a waterfall.
 */

/** Opening hours, or a loud failure — never an invented default. */
async function requireHours(clinicId: string): Promise<ClinicHours> {
  const hours = await getClinicHours(clinicId);

  if (!hours) {
    // The guard already proved this client belongs to a clinic, so a missing row
    // means it was deleted mid-request. Failing loudly beats offering slots
    // against opening hours nobody set.
    throw new Error(`clinic ${clinicId} has no row; cannot read opening hours`);
  }

  return { ...hours, workingDays: [...hours.workingDays] };
}

export type DashboardData = {
  next: PortalAppointment | null;
  /**
   * The week the published plan covers (`YYYY-MM-DD`), or null when nothing has been
   * published yet. Weekly plans have no title of their own — the week they are for is
   * the thing that identifies them to a client.
   */
  planTitle: string | null;
  /** Today's meals from that plan. Null when there is no plan or today is unplanned. */
  today: BoardDay | null;
  /** Requests still waiting on the dietitian. */
  pending: PortalRequest[];
};

export async function loadDashboard(context: PortalContext): Promise<DashboardData> {
  const [appointmentRows, requests, plan] = await Promise.all([
    listPortalAppointments(context.id),
    listPortalRequests(context.id),
    loadCurrentPlan(context),
  ]);

  const weekday = weekdayOf(context.now.date);

  return {
    next: nextAppointment(appointmentRows, context.now),
    planTitle: plan?.weekStartDate ?? null,
    today: plan && weekday !== null ? (plan.days[weekday] ?? null) : null,
    pending: requests.filter((request) => request.status === 'pending'),
  };
}

export type AppointmentsData = SplitAppointments & { requests: PortalRequest[] };

export async function loadAppointments(context: PortalContext): Promise<AppointmentsData> {
  const [appointmentRows, requests] = await Promise.all([
    listPortalAppointments(context.id),
    listPortalRequests(context.id),
  ]);

  return { ...splitAppointments(appointmentRows, context.now), requests };
}

/**
 * The plan the client is on, fully costed.
 *
 * Reuses `getPublishedBoard` from the weekly-plans feature rather than reading the
 * tables again: the nutrition a client reads must be the same numbers, from the same
 * code, as the ones their dietitian built the plan against.
 *
 * Only a PUBLISHED plan is ever visible here. A draft is the dietitian's working
 * copy, and a client following a plan that is still being edited is the failure this
 * whole status column exists to prevent — so there is deliberately no fallback to
 * the newest plan of any status.
 */
export async function loadCurrentPlan(context: PortalContext): Promise<Board | null> {
  return getPublishedBoard(context.id);
}

/**
 * Everything the request form needs: which days have room, and what is free on
 * the chosen one.
 *
 * A cancellation proposes no time, so it skips the slot work entirely — loading
 * a month of the clinic's bookings to render a form with no date picker on it
 * would be pure waste.
 */
export async function loadRequestPage(
  context: PortalContext,
  search: RequestSearchInput,
): Promise<RequestPageData> {
  const appointment = search.appointmentId
    ? await getPortalAppointment(context.id, search.appointmentId)
    : null;

  // A kind that needs an appointment, without one that belongs to this client,
  // is not a reschedule or a cancellation — it is a new request. Falling back
  // rather than 404ing keeps a stale link useful.
  const kind: RequestKind = search.kind !== 'new' && appointment ? search.kind : 'new';

  if (kind === 'cancel') {
    return { kind, appointment, days: [], selectedDate: context.now.date, slots: [] };
  }

  const hours = await requireHours(context.clinicId);

  // Today plus the window, inclusive of today — the same span `selectableDays`
  // walks, so every day it reports was read from the database.
  const lastDay = addDays(context.now.date, REQUEST_WINDOW_DAYS - 1);
  const existing = await listClinicBookings(context.clinicId, context.now.date, lastDay);

  const slotInput = {
    hours,
    existing,
    clientId: context.id,
    now: context.now,
    excludeAppointmentId: kind === 'reschedule' ? (appointment?.id ?? null) : null,
  };

  const days = selectableDays(slotInput);

  // The URL wins when it names a day inside the window; otherwise open on the
  // first day with anything free, so the form is useful without a single tap.
  const fromUrl = days.find((day) => day.date === search.date);
  const selectedDate =
    (fromUrl ?? days.find((day) => day.openCount > 0) ?? days[0])?.date ?? context.now.date;

  return {
    kind,
    appointment,
    days,
    selectedDate,
    slots: availableSlots({ ...slotInput, date: selectedDate }),
  };
}
