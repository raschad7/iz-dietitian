import { beforeEach, describe, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { clientPlanAdherence, weeklyPlanMealCompletions, weeklyPlanMeals, weeklyPlans } from '@/db/schema';
import { weekDates } from '@/features/weekly-plans/week';
import { createTestClient, createTestClinic, resetDatabase } from '../../../tests/helpers';

import { toggleMealCompletion } from './mutations';

/**
 * Integration tests against `TEST_DATABASE_URL`.
 *
 * What these are for: the transaction that keeps `weekly_plan_meal_completions`
 * and the derived `client_plan_adherence` row in agreement, the ownership proof
 * that stops a client touching a meal that is not theirs, and the tenant scope —
 * all properties of the database and the query, not of a pure function.
 */

let clinicId: string;
let otherClinicId: string;
let clientId: string;
let otherClientId: string;
let planId: string;

/** Sunday 2 August 2026 — day 0 of the plan. */
const WEEK_START = '2026-08-02';

async function insertPlan(
  ownerClientId: string,
  ownerClinicId: string,
  status: 'draft' | 'published' = 'published',
): Promise<string> {
  const [plan] = await db
    .insert(weeklyPlans)
    .values({
      clinicId: ownerClinicId,
      clientId: ownerClientId,
      weekStartDate: WEEK_START,
      status,
      kcalTargetSnapshot: 1800,
    })
    .returning({ id: weeklyPlans.id });

  if (!plan) throw new Error('fixture failed: insert into weekly_plans returned no row');

  return plan.id;
}

/** Two meals on day 0, one on day 1 — enough to test both the day's fraction and day scoping. */
async function insertMeals(forPlanId: string): Promise<{ dayZero: string[]; dayOne: string[] }> {
  const rows = await db
    .insert(weeklyPlanMeals)
    .values([
      { planId: forPlanId, dayOfWeek: 0, slotKey: 'breakfast', label: 'فطور', timeOfDay: '08:00', budgetKcal: 400 },
      { planId: forPlanId, dayOfWeek: 0, slotKey: 'lunch', label: 'غداء', timeOfDay: '14:00', budgetKcal: 600 },
      { planId: forPlanId, dayOfWeek: 1, slotKey: 'lunch', label: 'غداء', timeOfDay: '14:00', budgetKcal: 600 },
    ])
    .returning({ id: weeklyPlanMeals.id, dayOfWeek: weeklyPlanMeals.dayOfWeek });

  return {
    dayZero: rows.filter((row) => row.dayOfWeek === 0).map((row) => row.id),
    dayOne: rows.filter((row) => row.dayOfWeek === 1).map((row) => row.id),
  };
}

async function adherenceLevel(forClientId: string, date: string): Promise<string | null> {
  const [row] = await db
    .select({ level: clientPlanAdherence.level })
    .from(clientPlanAdherence)
    .where(and(eq(clientPlanAdherence.clientId, forClientId), eq(clientPlanAdherence.date, date)));

  return row?.level ?? null;
}

async function completionExists(forClientId: string, mealId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: weeklyPlanMealCompletions.id })
    .from(weeklyPlanMealCompletions)
    .where(and(eq(weeklyPlanMealCompletions.clientId, forClientId), eq(weeklyPlanMealCompletions.mealId, mealId)));

  return Boolean(row);
}

beforeEach(async () => {
  await resetDatabase();
  clinicId = await createTestClinic();
  otherClinicId = await createTestClinic('Other Clinic');
  clientId = await createTestClient(clinicId, 'سارة عبد الله');
  otherClientId = await createTestClient(clinicId, 'ليلى حسن');
  planId = await insertPlan(clientId, clinicId);
});

describe('toggleMealCompletion', () => {
  test('ticking one of two meals writes a completion row and derives partial', async () => {
    const { dayZero } = await insertMeals(planId);
    const [first] = dayZero;
    if (!first) throw new Error('fixture failed: no meal on day 0');

    const result = await toggleMealCompletion({ clientId, clinicId }, first, true);

    expect(result).toEqual({ ok: true, data: { date: WEEK_START, level: 'partial' } });
    expect(await completionExists(clientId, first)).toBe(true);
    expect(await adherenceLevel(clientId, WEEK_START)).toBe('partial');
  });

  test('ticking every meal on the day derives full', async () => {
    const { dayZero } = await insertMeals(planId);
    const [first, second] = dayZero;
    if (!first || !second) throw new Error('fixture failed: expected two meals on day 0');

    await toggleMealCompletion({ clientId, clinicId }, first, true);
    const result = await toggleMealCompletion({ clientId, clinicId }, second, true);

    expect(result).toEqual({ ok: true, data: { date: WEEK_START, level: 'full' } });
    expect(await adherenceLevel(clientId, WEEK_START)).toBe('full');
  });

  test('unticking a meal removes its row and recomputes down to missed', async () => {
    const { dayZero } = await insertMeals(planId);
    const [first] = dayZero;
    if (!first) throw new Error('fixture failed: no meal on day 0');

    await toggleMealCompletion({ clientId, clinicId }, first, true);
    const result = await toggleMealCompletion({ clientId, clinicId }, first, false);

    expect(result).toEqual({ ok: true, data: { date: WEEK_START, level: 'missed' } });
    expect(await completionExists(clientId, first)).toBe(false);
    expect(await adherenceLevel(clientId, WEEK_START)).toBe('missed');
  });

  test('ticking twice is a no-op rather than a duplicate row or an error', async () => {
    const { dayZero } = await insertMeals(planId);
    const [first] = dayZero;
    if (!first) throw new Error('fixture failed: no meal on day 0');

    await toggleMealCompletion({ clientId, clinicId }, first, true);
    await toggleMealCompletion({ clientId, clinicId }, first, true);

    const rows = await db
      .select({ id: weeklyPlanMealCompletions.id })
      .from(weeklyPlanMealCompletions)
      .where(and(eq(weeklyPlanMealCompletions.clientId, clientId), eq(weeklyPlanMealCompletions.mealId, first)));

    expect(rows).toHaveLength(1);
  });

  test('only touches the day the meal belongs to', async () => {
    const { dayZero, dayOne } = await insertMeals(planId);
    const [zero] = dayZero;
    const [one] = dayOne;
    if (!zero || !one) throw new Error('fixture failed: expected meals on both days');

    await toggleMealCompletion({ clientId, clinicId }, zero, true);

    const mondayDate = weekDates(WEEK_START)[1];
    if (!mondayDate) throw new Error('fixture failed: could not compute Monday date');

    expect(await adherenceLevel(clientId, mondayDate)).toBeNull();
    expect(await completionExists(clientId, one)).toBe(false);
  });

  test('refuses a meal on a draft plan', async () => {
    const draftPlanId = await insertPlan(otherClientId, clinicId, 'draft');
    const { dayZero } = await insertMeals(draftPlanId);
    const [first] = dayZero;
    if (!first) throw new Error('fixture failed: no meal on day 0');

    const result = await toggleMealCompletion({ clientId: otherClientId, clinicId }, first, true);

    expect(result).toEqual({ ok: false, error: 'errors.notFound' });
    expect(await completionExists(otherClientId, first)).toBe(false);
  });

  test('refuses a meal belonging to another client', async () => {
    const { dayZero } = await insertMeals(planId);
    const [first] = dayZero;
    if (!first) throw new Error('fixture failed: no meal on day 0');

    const result = await toggleMealCompletion({ clientId: otherClientId, clinicId }, first, true);

    expect(result).toEqual({ ok: false, error: 'errors.notFound' });
    expect(await completionExists(otherClientId, first)).toBe(false);
  });

  test('refuses a meal read through another clinic', async () => {
    const { dayZero } = await insertMeals(planId);
    const [first] = dayZero;
    if (!first) throw new Error('fixture failed: no meal on day 0');

    const result = await toggleMealCompletion({ clientId, clinicId: otherClinicId }, first, true);

    expect(result).toEqual({ ok: false, error: 'errors.notFound' });
  });
});
