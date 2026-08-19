import { beforeEach, describe, expect, test } from 'bun:test';

import { db } from '@/db';
import { weeklyPlanMeals, weeklyPlans } from '@/db/schema';
import { createTestClient, createTestClinic, resetDatabase } from '../../../tests/helpers';

import { toggleMealCompletion } from './mutations';
import { loadProgressPage } from './page-data';
import { type PortalContext } from './session';

/**
 * Integration test against `TEST_DATABASE_URL`, exercising the whole progress
 * pipeline the portal actually runs: real meal ticks through
 * `toggleMealCompletion` (which writes `weekly_plan_meal_completions` and
 * derives `client_plan_adherence`, both covered on their own in
 * `mutations.test.ts`), read back through `listPlanAdherence`, and assembled
 * by `loadProgressPage` into exactly the shape the progress tab renders.
 *
 * `adherence.ts`'s pure functions already have thorough coverage against
 * hand-built fixtures (`adherence.test.ts`) — the thing *not* covered
 * anywhere else is that a real sequence of ticks against a real database
 * produces the fraction the client actually sees, with nothing hardcoded on
 * either side of the assertion.
 */

let clinicId: string;
let clientId: string;
let planId: string;

/** Sunday 2 August 2026. */
const SUNDAY = '2026-08-02';
const MONDAY = '2026-08-03';
const TUESDAY = '2026-08-04';
/** "Today" for every assertion below. */
const WEDNESDAY = '2026-08-05';

function context(today: string): PortalContext {
  return {
    id: clientId,
    clinicId,
    assignedDietitianId: null,
    profile: {} as PortalContext['profile'],
    session: {} as PortalContext['session'],
    now: { date: today, minute: 480 },
  };
}

beforeEach(async () => {
  await resetDatabase();
  clinicId = await createTestClinic();
  clientId = await createTestClient(clinicId, 'سارة عبد الله');

  const [plan] = await db
    .insert(weeklyPlans)
    .values({ clinicId, clientId, weekStartDate: SUNDAY, status: 'published', kcalTargetSnapshot: 1800 })
    .returning({ id: weeklyPlans.id });
  if (!plan) throw new Error('fixture failed: insert into weekly_plans returned no row');
  planId = plan.id;

  // Sunday: 4 meals. Monday: 2. Tuesday: 3. Wednesday (today): 2.
  await db.insert(weeklyPlanMeals).values([
    { planId, dayOfWeek: 0, slotKey: 'breakfast', label: 'فطور', timeOfDay: '08:00', budgetKcal: 300 },
    { planId, dayOfWeek: 0, slotKey: 'lunch', label: 'غداء', timeOfDay: '13:00', budgetKcal: 500 },
    { planId, dayOfWeek: 0, slotKey: 'dinner', label: 'عشاء', timeOfDay: '19:00', budgetKcal: 500 },
    { planId, dayOfWeek: 0, slotKey: 'snack', label: 'سناك', timeOfDay: '16:00', budgetKcal: 200 },
    { planId, dayOfWeek: 1, slotKey: 'breakfast', label: 'فطور', timeOfDay: '08:00', budgetKcal: 400 },
    { planId, dayOfWeek: 1, slotKey: 'lunch', label: 'غداء', timeOfDay: '13:00', budgetKcal: 600 },
    { planId, dayOfWeek: 2, slotKey: 'breakfast', label: 'فطور', timeOfDay: '08:00', budgetKcal: 400 },
    { planId, dayOfWeek: 2, slotKey: 'lunch', label: 'غداء', timeOfDay: '13:00', budgetKcal: 500 },
    { planId, dayOfWeek: 2, slotKey: 'dinner', label: 'عشاء', timeOfDay: '19:00', budgetKcal: 500 },
    { planId, dayOfWeek: 3, slotKey: 'breakfast', label: 'فطور', timeOfDay: '08:00', budgetKcal: 400 },
    { planId, dayOfWeek: 3, slotKey: 'lunch', label: 'غداء', timeOfDay: '13:00', budgetKcal: 600 },
  ]);
});

async function mealsOn(dayOfWeek: number): Promise<string[]> {
  const all = await db.select({ id: weeklyPlanMeals.id, dayOfWeek: weeklyPlanMeals.dayOfWeek }).from(weeklyPlanMeals);
  return all.filter((row) => row.dayOfWeek === dayOfWeek).map((row) => row.id);
}

describe('loadProgressPage', () => {
  test('reflects a real sequence of meal ticks across several days, end to end', async () => {
    const sunday = await mealsOn(0);
    const monday = await mealsOn(1);
    const tuesday = await mealsOn(2);
    const wednesday = await mealsOn(3);

    // Sunday: 3 of 4 ticked, as-if reported that day.
    for (const mealId of sunday.slice(0, 3)) {
      await toggleMealCompletion({ clientId, clinicId, today: SUNDAY }, mealId, true);
    }

    // Monday: both ticked — a fully completed day.
    for (const mealId of monday) {
      await toggleMealCompletion({ clientId, clinicId, today: MONDAY }, mealId, true);
    }

    // Tuesday: ticked one meal, then unticked it — an explicit "missed" day,
    // distinct from a day nobody answered at all.
    const [tuesdayMeal] = tuesday;
    if (!tuesdayMeal) throw new Error('fixture failed: no meal on Tuesday');
    await toggleMealCompletion({ clientId, clinicId, today: TUESDAY }, tuesdayMeal, true);
    await toggleMealCompletion({ clientId, clinicId, today: TUESDAY }, tuesdayMeal, false);

    // Wednesday (today): 1 of 2 ticked — a partial day, in progress.
    const [wedFirst] = wednesday;
    if (!wedFirst) throw new Error('fixture failed: no meal on Wednesday');
    await toggleMealCompletion({ clientId, clinicId, today: WEDNESDAY }, wedFirst, true);

    const page = await loadProgressPage(context(WEDNESDAY));

    // Today's ring: exactly what was ticked on the current day, nothing more.
    expect(page.today).toEqual({ level: 'partial', completedMeals: 1, totalMeals: 2, fraction: 0.5 });

    // Week strip: each day carries its own real fraction.
    const byDate = new Map(page.week.days.map((day) => [day.date, day]));
    expect(byDate.get(SUNDAY)?.fraction).toBe(0.75);
    expect(byDate.get(SUNDAY)?.state).toBe('partial');
    expect(byDate.get(MONDAY)?.fraction).toBe(1);
    expect(byDate.get(MONDAY)?.state).toBe('full');
    expect(byDate.get(TUESDAY)?.fraction).toBe(0);
    expect(byDate.get(TUESDAY)?.state).toBe('missed');
    expect(byDate.get(WEDNESDAY)?.state).toBe('today');
    // Thursday onward has not happened yet.
    expect(byDate.get('2026-08-06')?.state).toBe('future');

    // Weekly average is the mean of each recorded day's own fraction:
    // (0.75 + 1 + 0 + 0.5) / 4 = 0.5625 — never a pooled meal count.
    expect(page.week.recordedCount).toBe(4);
    expect(page.week.averageFraction).toBeCloseTo(0.5625, 4);
    expect(page.week.fullyCompletedCount).toBe(1);

    // Streak: Wednesday and Sunday were kept, but Tuesday's explicit "missed"
    // breaks the run, so only today counts.
    expect(page.streak).toBe(1);

    // Four-week trend: only the current week has any data.
    expect(page.monthlyTrend).toHaveLength(4);
    const currentWeek = page.monthlyTrend.find((week) => week.isCurrent);
    expect(currentWeek?.weekStartDate).toBe(SUNDAY);
    expect(currentWeek?.averageFraction).toBeCloseTo(0.5625, 4);
    expect(page.monthlyTrend.filter((week) => !week.isCurrent).every((week) => week.averageFraction === null)).toBe(
      true,
    );
  });

  test('a client who has never ticked a meal sees an empty progress page, not an error', async () => {
    const page = await loadProgressPage(context(WEDNESDAY));

    expect(page.today).toBeNull();
    expect(page.week.recordedCount).toBe(0);
    expect(page.week.averageFraction).toBeNull();
    expect(page.streak).toBe(0);
    expect(page.monthlyTrend.every((week) => week.averageFraction === null)).toBe(true);
  });

  test('a fully completed week (every day ticked in full) reads 100%', async () => {
    const sunday = await mealsOn(0);
    const monday = await mealsOn(1);
    const tuesday = await mealsOn(2);
    const wednesday = await mealsOn(3);

    for (const mealId of sunday) await toggleMealCompletion({ clientId, clinicId, today: SUNDAY }, mealId, true);
    for (const mealId of monday) await toggleMealCompletion({ clientId, clinicId, today: MONDAY }, mealId, true);
    for (const mealId of tuesday) await toggleMealCompletion({ clientId, clinicId, today: TUESDAY }, mealId, true);
    for (const mealId of wednesday) await toggleMealCompletion({ clientId, clinicId, today: WEDNESDAY }, mealId, true);

    const page = await loadProgressPage(context(WEDNESDAY));

    expect(page.week.averageFraction).toBe(1);
    expect(page.week.fullyCompletedCount).toBe(4);
    expect(page.today).toEqual({ level: 'full', completedMeals: 2, totalMeals: 2, fraction: 1 });
    expect(page.streak).toBe(4);
  });

  test('scopes strictly to the requesting client, never mixing in another client\'s ticks', async () => {
    const otherClientId = await createTestClient(clinicId, 'ليلى حسن');
    const [otherPlan] = await db
      .insert(weeklyPlans)
      .values({ clinicId, clientId: otherClientId, weekStartDate: SUNDAY, status: 'published', kcalTargetSnapshot: 1800 })
      .returning({ id: weeklyPlans.id });
    if (!otherPlan) throw new Error('fixture failed: insert into weekly_plans returned no row');

    const [otherMeal] = await db
      .insert(weeklyPlanMeals)
      .values({
        planId: otherPlan.id,
        dayOfWeek: 3,
        slotKey: 'breakfast',
        label: 'فطور',
        timeOfDay: '08:00',
        budgetKcal: 400,
      })
      .returning({ id: weeklyPlanMeals.id });
    if (!otherMeal) throw new Error('fixture failed: no meal for other client');

    await toggleMealCompletion({ clientId: otherClientId, clinicId, today: WEDNESDAY }, otherMeal.id, true);

    const page = await loadProgressPage(context(WEDNESDAY));

    expect(page.today).toBeNull();
    expect(page.week.recordedCount).toBe(0);
  });
});
