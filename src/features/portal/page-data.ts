import { addDays } from '@/features/booking/date';
import { getClinicHours } from '@/features/booking/queries';
import { type ClinicHours } from '@/features/booking/validation';
import { getPublishedBoard, type Board } from '@/features/weekly-plans/queries';
import { planWeekDays, type PlanDaySummary } from '@/features/weekly-plans/week';

import {
  adherenceDaysFor,
  continuityPath,
  currentAdherenceStreak,
  fourWeekTrend,
  summariseAdherenceWeek,
  todayAdherenceOf,
  type ContinuityDay,
  type MonthlyTrendWeek,
  type TodayAdherence,
  type WeekAdherence,
} from './adherence';
import { splitAppointments, type SplitAppointments } from './appointments';
import { weekDates, STREAK_WINDOW_DAYS } from './check-ins';
import { buildNotifications, type PortalNotification } from './notifications';
import {
  getAssignedPractitioner,
  getOpenClientRequest,
  getPortalAppointment,
  getPortalClinic,
  listClinicBookings,
  listMealCompletions,
  listPlanAdherence,
  listPortalAppointments,
  listPortalRequests,
} from './queries';
import { type RequestSearchInput } from './schema';
import { availableSlots, selectableDays, REQUEST_WINDOW_DAYS } from './slots';
import { type PortalContext } from './session';
import {
  type PortalRequest,
  type ProfilePageData,
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

export type ProgressPageData = {
  /**
   * Today's own report — its exact fraction and the meals behind it — or null
   * when nothing has been logged yet today.
   */
  today: TodayAdherence | null;
  week: WeekAdherence;
  /** Consecutive days kept at least partially, ending today or yesterday. */
  streak: number;
  /**
   * The same streak as it stood on each of the last {@link CONTINUITY_DAYS}
   * days — the continuity card's curve. Its last point equals `streak`.
   */
  continuity: ContinuityDay[];
  /** The last four calendar weeks, oldest first. */
  monthlyTrend: MonthlyTrendWeek[];
};

/**
 * Everything the progress tab shows — adherence to the assigned nutrition
 * plan only. Deliberately reads `client_plan_adherence`, never
 * `client_check_ins`: the two answer different clinical questions, and mixing
 * a wellness score into a plan-adherence screen would answer neither
 * correctly.
 *
 * One read of the last {@link STREAK_WINDOW_DAYS} covers the week strip, the
 * streak, the continuity curve and the four-week trend — a "read once,
 * derive everything" shape over the same table.
 */
export async function loadProgressPage(context: PortalContext): Promise<ProgressPageData> {
  const dates = weekDates(context.now.date);
  const to = dates[dates.length - 1] ?? context.now.date;
  const from = addDays(context.now.date, -(STREAK_WINDOW_DAYS - 1));

  const rows = await listPlanAdherence(context.id, from, to);

  const week = summariseAdherenceWeek(rows, context.now.date);

  return {
    today: todayAdherenceOf(rows, context.now.date),
    week,
    streak: currentAdherenceStreak(rows, context.now.date),
    continuity: continuityPath(rows, context.now.date),
    monthlyTrend: fourWeekTrend(rows, context.now.date),
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

export type NotificationsPageData = {
  items: PortalNotification[];
};

/**
 * The standalone notifications screen: every item derived from data another
 * screen already owns (an appointment, this week's plan, today's adherence, a
 * request the dietitian answered) — see `./notifications.ts` for why there is
 * no notifications table behind this.
 */
export async function loadNotificationsPage(context: PortalContext): Promise<NotificationsPageData> {
  const [appointmentRows, requests, plan, todayAdherence] = await Promise.all([
    listPortalAppointments(context.id),
    listPortalRequests(context.id),
    loadCurrentPlan(context),
    listPlanAdherence(context.id, context.now.date, context.now.date),
  ]);

  return {
    items: buildNotifications({
      now: context.now,
      todayAdherenceLevel: todayAdherence[0]?.level ?? null,
      appointments: appointmentRows,
      requests,
      currentWeekPlanStartDate: plan?.weekStartDate ?? null,
    }),
  };
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

export type PlanPageData = {
  board: Board;
  days: PlanDaySummary[];
  /** The day being read, 0–6. Always a day that exists in `days`. */
  selectedDay: number;
  /**
   * Which of the selected day's meals this client has already ticked
   * complete. Only that day's, matching what the page actually renders —
   * ticking a meal on another day means opening it first.
   */
  completedMealIds: string[];
  /**
   * The clinic's own wall-clock date, `YYYY-MM-DD`.
   *
   * Passed down rather than read again in the component, because "is this day
   * still open for ticking?" and "which day is marked today in the strip?" have
   * to be the same answer — a second clock read could land either side of
   * midnight from the first. See `dayStanding`.
   */
  today: string;
};

/**
 * The plan page: the published week, plus which day of it is open.
 *
 * A whole week of dishes and ingredients is more than a phone screen can hold,
 * so the page shows the week and one day of it. Which day that is comes from the
 * URL, which means the choice survives a refresh and a shared link — and means
 * only the chosen day's meals are ever rendered, rather than all seven.
 *
 * Returns null when nothing has been published. That is not an error: it is the
 * normal state of a client whose dietitian has not written their plan yet, and
 * the page has a screen for it.
 *
 * The day picker draws the same adherence flame the home screen and the progress
 * tab do, so this reads `client_plan_adherence` too — but over **the plan's**
 * seven dates rather than today's week, which is why it calls
 * `adherenceDaysFor` and not `summariseAdherenceWeek`. A plan for next week comes
 * back as seven `future` days, which is the honest answer rather than an empty
 * one.
 */
export async function loadPlanPage(
  context: PortalContext,
  requestedDay: number | null,
): Promise<PlanPageData | null> {
  const board = await loadCurrentPlan(context);

  if (!board) return null;

  const planDays = planWeekDays(board.weekStartDate);
  const dates = planDays.map((day) => day.date);

  // Second read rather than part of `loadCurrentPlan`: the board is the
  // dietitian's published plan and this is the client's own reporting against
  // it. Bounded by the plan's own first and last date, so a plan far in the past
  // does not drag the whole table back.
  const from = dates[0];
  const to = dates[dates.length - 1];

  const adherenceRows =
    from && to ? await listPlanAdherence(context.id, from, to) : [];

  const adherenceByDate = new Map(
    adherenceDaysFor(dates, adherenceRows, context.now.date).map((day) => [day.date, day]),
  );

  // Keep the strip chronological even when this client's plan begins midweek.
  // Meal rows retain their absolute weekday id, so each date is paired by id
  // rather than by the board array's Sunday-first index.
  const days: PlanDaySummary[] = planDays.map(({ dayOfWeek, date }) => {
    const day = board.days.find((candidate) => candidate.dayOfWeek === dayOfWeek);

    return {
      dayOfWeek,
      date,
      mealCount: day?.meals.length ?? 0,
      isToday: date === context.now.date,
      adherence: adherenceByDate.get(date) ?? null,
    };
  });

  const selectedDay = pickPlanDay(days, requestedDay, context.now.date);

  // Only the day actually rendered — a whole week of meal ids to check
  // completion against would be the same over-fetch `PortalPlan` already
  // avoids for dishes and ingredients.
  const selectedMealIds =
    board.days.find((day) => day.dayOfWeek === selectedDay)?.meals.map((meal) => meal.id) ?? [];
  const completedMealIds = [...(await listMealCompletions(context.id, selectedMealIds))];

  return { board, days, selectedDay, completedMealIds, today: context.now.date };
}

/**
 * Which day the page opens on.
 *
 * The URL wins, so a chosen day survives a reload. Failing that, today — but
 * only if today has meals, because opening on an empty state when six other days
 * are full reads as a broken plan. Otherwise the first day with anything in it,
 * and only then the start of the week.
 *
 * Matched by **date**, not by weekday number. A plan published for next week
 * still has a day whose `dayOfWeek` equals today's weekday — Thursday is day 4
 * whichever week it falls in — and matching on that number alone would open the
 * page on a day seven days away while calling it today, letting a client tick
 * meals nobody can have eaten yet. Matching `date === today` only succeeds when
 * the plan's own week genuinely contains today, which is the same test
 * `isToday` above is built from.
 */
export function pickPlanDay(
  days: readonly PlanDaySummary[],
  requested: number | null,
  today: string | null,
): number {
  if (requested !== null && days.some((day) => day.dayOfWeek === requested)) return requested;

  const todayDay = days.find((day) => day.date === today);
  if (todayDay && todayDay.mealCount > 0) return todayDay.dayOfWeek;

  return days.find((day) => day.mealCount > 0)?.dayOfWeek ?? days[0]?.dayOfWeek ?? 0;
}

/**
 * The client's record as their own profile screen shows it.
 *
 * Three reads in one round, and they answer to three different owners: the
 * dietitian (the record already carried on `context.profile`), the clinic (its
 * details and who is assigned), and the client themselves (the correction they
 * have filed, if any). Keeping that separation visible in the return shape is
 * what stops a later change quietly making a clinic-owned field look editable.
 */
export async function loadProfilePage(context: PortalContext): Promise<ProfilePageData> {
  const [clinic, practitioner, openUpdateRequest] = await Promise.all([
    getPortalClinic(context.clinicId),
    getAssignedPractitioner(context.clinicId, context.assignedDietitianId),
    getOpenClientRequest(context.id, 'data_update'),
  ]);

  return { profile: context.profile, clinic, practitioner, openUpdateRequest };
}

/**
 * Everything the request form needs: which days have room, which one is open,
 * and the times still free on it.
 *
 * **One day's times, not the month's.** `selectableDays` already computes every
 * day's `openCount` — that is what decides whether a day can be chosen at all —
 * but only the chosen day's actual start times are returned. Sending all thirty
 * days' times would hand each client a map of when everybody else is booked,
 * and it is why choosing a day is a navigation rather than a filter applied in
 * the browser.
 *
 * A cancellation proposes neither, so it skips the slot work entirely — loading
 * a month of the clinic's bookings to render a form with no picker on it would
 * be pure waste.
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

  // Neither of these proposes a time, so neither needs the calendar: a `new`
  // request is a note the dietitian reads, and a `cancel` names the appointment
  // it is about and nothing more. Returning early skips the clinic's hours, a
  // month of bookings and the whole slot computation for the one kind the
  // portal actually links to.
  if (kind === 'new' || kind === 'cancel') {
    return {
      kind,
      appointment,
      days: [],
      selectedDate: context.now.date,
      slots: [],
      selectedStartMinute: null,
    };
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

  // The chosen day's own times, from the same call and the same rules that
  // produced its `openCount` — so the strip cannot say a day has four times
  // free while the list below it offers three.
  const slots = availableSlots({ ...slotInput, date: selectedDate });

  return {
    kind,
    appointment,
    days,
    selectedDate,
    slots,
    // The earliest open time, mirroring how the day above it is chosen. A day
    // with nothing free selects nothing, and the form refuses to submit rather
    // than sending an hour the clinic never offered.
    selectedStartMinute: slots[0] ?? null,
  };
}
