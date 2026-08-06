import { addDays } from '@/features/booking/date';
import { getClinicHours } from '@/features/booking/queries';
import { type ClinicHours } from '@/features/booking/validation';
import { getPublishedBoard, type Board, type BoardDay } from '@/features/weekly-plans/queries';
import { weekDates as planWeekDates, type PlanDaySummary } from '@/features/weekly-plans/week';

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
import { nextAppointment, splitAppointments, type SplitAppointments } from './appointments';
import { weekDates, STREAK_WINDOW_DAYS } from './check-ins';
import { buildNotifications, type PortalNotification } from './notifications';
import {
  getAssignedPractitioner,
  getOpenClientRequest,
  getPortalAppointment,
  getPortalClinic,
  getSharedWeight,
  listClinicBookings,
  listMealCompletions,
  listPlanAdherence,
  listPortalAppointments,
  listPortalRequests,
} from './queries';
import { type RequestSearchInput } from './schema';
import { selectableDays, REQUEST_WINDOW_DAYS } from './slots';
import { type PortalContext } from './session';
import {
  type PortalAppointment,
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
  /**
   * This week's plan adherence, already derived into what the home screen
   * draws — the same `client_plan_adherence` rows and the same summarising
   * function the progress tab reads, so the two screens can never disagree
   * about how the week has gone. See {@link loadProgressPage}.
   */
  week: WeekAdherence;
  /** Consecutive days kept at least partially, ending today or yesterday. */
  streak: number;
};

export async function loadDashboard(context: PortalContext): Promise<DashboardData> {
  // The clinic week `now` falls in. Read once here so the strip and the ring
  // are describing the same seven days.
  const dates = weekDates(context.now.date);
  const to = dates[dates.length - 1] ?? context.now.date;

  // The streak reaches back further than the week the strip draws, so one read
  // covers both. `summariseAdherenceWeek` documents that it ignores dates
  // outside the week, which is what makes the over-fetch safe rather than a
  // second query.
  const from = addDays(context.now.date, -(STREAK_WINDOW_DAYS - 1));

  const [appointmentRows, requests, plan, adherenceRows] = await Promise.all([
    listPortalAppointments(context.id),
    listPortalRequests(context.id),
    loadCurrentPlan(context),
    listPlanAdherence(context.id, from, to),
  ]);

  // The plan's own week, not today's — a dietitian who has published next
  // week's plan already means `plan.weekStartDate` is not the week `today`
  // falls in, and `plan.days` is ordered by *that* week's weekday. Indexing
  // it by `weekdayOf(context.now.date)` would silently hand back a day that
  // shares today's weekday number but is a week away, which is not today's
  // plan by any definition a client would recognise.
  const todayIndexInPlan = plan ? planWeekDates(plan.weekStartDate).indexOf(context.now.date) : -1;

  return {
    next: nextAppointment(appointmentRows, context.now),
    planTitle: plan?.weekStartDate ?? null,
    today: plan && todayIndexInPlan !== -1 ? (plan.days[todayIndexInPlan] ?? null) : null,
    pending: requests.filter((request) => request.status === 'pending'),
    week: summariseAdherenceWeek(adherenceRows, context.now.date),
    streak: currentAdherenceStreak(adherenceRows, context.now.date),
  };
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
 * streak, the continuity curve and the four-week trend — the same "read once,
 * derive everything" shape `loadDashboard` uses for its own, shorter window
 * over the same table.
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

  const dates = planWeekDates(board.weekStartDate);

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

  // `getPublishedBoard` builds one entry per weekday, in order, so the index is
  // the day of week and every day is present even when it holds no meals.
  const days: PlanDaySummary[] = board.days.map((day, index) => {
    const date = dates[index] ?? null;

    return {
      dayOfWeek: day.dayOfWeek,
      date,
      mealCount: day.meals.length,
      isToday: date === context.now.date,
      adherence: date === null ? null : (adherenceByDate.get(date) ?? null),
    };
  });

  const selectedDay = pickPlanDay(days, requestedDay, context.now.date);

  // Only the day actually rendered — a whole week of meal ids to check
  // completion against would be the same over-fetch `PortalPlan` already
  // avoids for dishes and ingredients.
  const selectedMealIds = board.days[selectedDay]?.meals.map((meal) => meal.id) ?? [];
  const completedMealIds = [...(await listMealCompletions(context.id, selectedMealIds))];

  return { board, days, selectedDay, completedMealIds };
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
 * Four reads in one round, and they answer to three different owners: the
 * dietitian (the weight, and the record already carried on `context.profile`),
 * the clinic (its details and who is assigned), and the client themselves (the
 * correction they have filed, if any). Keeping that separation visible in the
 * return shape is what stops a later change quietly making a clinic-owned
 * field look editable.
 */
export async function loadProfilePage(context: PortalContext): Promise<ProfilePageData> {
  const [weightKg, clinic, practitioner, openUpdateRequest] = await Promise.all([
    getSharedWeight(context.id),
    getPortalClinic(context.clinicId),
    getAssignedPractitioner(context.clinicId, context.assignedDietitianId),
    getOpenClientRequest(context.id, 'data_update'),
  ]);

  return { profile: context.profile, weightKg, clinic, practitioner, openUpdateRequest };
}

/**
 * Everything the request form needs: which days have room, and which one is
 * open.
 *
 * Not which *times* are free — a client asks for a day and the dietitian sets
 * the hour, so the page has no time picker to feed. `selectableDays` still
 * computes each day's `openCount` internally, because "has this day any room at
 * all" is exactly what decides whether it can be chosen.
 *
 * A cancellation proposes no day either, so it skips the slot work entirely —
 * loading a month of the clinic's bookings to render a form with no date picker
 * on it would be pure waste.
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
    return { kind, appointment, days: [], selectedDate: context.now.date };
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

  return { kind, appointment, days, selectedDate };
}
