import { type AdherenceDay, summariseAdherenceRun } from '@/features/portal/adherence';
import { listMealCompletions, listPlanAdherenceForClinic } from '@/features/portal/queries';
import { getBoard } from '@/features/weekly-plans/queries';
import { weekDates } from '@/features/weekly-plans/week';
import { type IsoDate } from '@/lib/iso-date';

/**
 * One selected week of a client's plan adherence, read for the dietitian
 * dashboard's Progress tab.
 *
 * Built entirely from `client_plan_adherence` — the same table and the same
 * arithmetic (`summariseAdherenceRun` in `portal/adherence.ts`) the
 * client's own portal reads, so a dietitian and a client looking at the same
 * week can never see two different percentages for it. Nothing here computes
 * an adherence figure of its own.
 */
export type ClientWeekProgress = {
  weekStartDate: IsoDate;
  /** The seven calendar dates this week covers, Sunday first. */
  dates: IsoDate[];
  days: AdherenceDay[];
  /** Days in this week with any report, past or present. */
  recordedCount: number;
  /** Days in this week reported as fully completed. */
  fullyCompletedCount: number;
  /** Mean of the week's reported days, 0–1, or null when none were reported. */
  averageFraction: number | null;
  /** Sum of `completedMeals` across the week's reported days. */
  totalCompletedMeals: number;
  /** Sum of `totalMeals` across the week's reported days. */
  totalPlannedMeals: number;
  /** Whether any day in this week has a report at all — false is the empty state. */
  hasData: boolean;
};

/**
 * Reads and summarises one client's adherence for one week.
 *
 * `weekStartDate` is a plan's own `week_start_date` — the same Sunday
 * `listPlans` hands the week selector — so the days read here line up with
 * the plan the client was actually following that week, whichever week that
 * was. A week with no `client_plan_adherence` rows at all (no plan was ever
 * published for it, or one was and nothing has been ticked) comes back with
 * `hasData: false` and every count at zero, rather than a fabricated figure.
 */
export async function getClientWeekProgress(
  clinicId: string,
  clientId: string,
  weekStartDate: string,
  today: IsoDate,
): Promise<ClientWeekProgress> {
  const dates = weekDates(weekStartDate) as IsoDate[];

  if (dates.length === 0) {
    return {
      weekStartDate: weekStartDate as IsoDate,
      dates: [],
      days: [],
      recordedCount: 0,
      fullyCompletedCount: 0,
      averageFraction: null,
      totalCompletedMeals: 0,
      totalPlannedMeals: 0,
      hasData: false,
    };
  }

  const fromDate = dates[0] as IsoDate;
  const toDate = dates[6] as IsoDate;

  const rows = await listPlanAdherenceForClinic(clinicId, clientId, fromDate, toDate);
  const summary = summariseAdherenceRun(dates, rows, today);

  const totalCompletedMeals = summary.days.reduce((sum, day) => sum + day.completedMeals, 0);
  const totalPlannedMeals = summary.days.reduce((sum, day) => sum + day.totalMeals, 0);

  return {
    weekStartDate: weekStartDate as IsoDate,
    dates,
    days: summary.days,
    recordedCount: summary.recordedCount,
    fullyCompletedCount: summary.fullyCompletedCount,
    averageFraction: summary.averageFraction,
    totalCompletedMeals,
    totalPlannedMeals,
    hasData: rows.length > 0,
  };
}

/** One meal, named, for the Progress tab's "which meals" detail. */
export type ClientDayMeal = {
  id: string;
  /** Matches `mealTypeForSlot`, for the same meal-type icon the portal draws. */
  slotKey: string;
  label: string;
  timeOfDay: string;
  /** The dish assigned to it, or null for a slot the plan never filled. */
  dishNameAr: string | null;
  completed: boolean;
};

/**
 * One plan's meals, grouped by day of week, each marked with whether this
 * client has ticked it complete.
 *
 * `ClientWeekProgress` only carries counts — "3 of 4 meals" — because that is
 * all `client_plan_adherence` stores; a dietitian asking *which* meal was
 * skipped needs the plan itself, so this is a second, deliberately separate
 * read rather than something folded into `getClientWeekProgress`. Built on
 * `getBoard`, the same assembly `weekly-plans` already uses for its own
 * dish/nutrition joins, rather than a second hand-rolled meal query.
 *
 * `planId` is the caller's own choice of which plan represents the week —
 * `listPlans` already orders newest-updated first, so the week picker and
 * this read agree on "the current plan for this week" without either one
 * re-deriving it. Returns an empty map for a week with no plan.
 */
export async function getClientWeekMeals(
  clinicId: string,
  clientId: string,
  planId: string,
): Promise<Map<number, ClientDayMeal[]>> {
  const board = await getBoard(clinicId, planId);
  if (!board || board.clientId !== clientId) return new Map();

  const mealIds = board.days.flatMap((day) => day.meals.map((meal) => meal.id));
  const completed = await listMealCompletions(clientId, mealIds);

  return new Map(
    board.days.map((day) => [
      day.dayOfWeek,
      day.meals.map((meal) => ({
        id: meal.id,
        slotKey: meal.slotKey,
        label: meal.label,
        timeOfDay: meal.timeOfDay,
        dishNameAr: meal.dish?.nameAr ?? null,
        completed: completed.has(meal.id),
      })),
    ]),
  );
}
