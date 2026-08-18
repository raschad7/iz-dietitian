import { and, desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { clients, weeklyPlanMealOptions, weeklyPlanMeals, weeklyPlans } from '@/db/schema';
import { recomputeDayAdherence } from '@/features/portal/mutations';

import { DAYS_OF_WEEK } from './schema';
import { snapServings } from './similar';
import type { SkeletonMeal } from './skeleton';
import { planWeekDays, weekDateForDay } from './week';

/**
 * Writes for the manual side of weekly plans — the plans nobody generated.
 *
 * Same rules as `mutations.ts`: `clinicId` first, every id resolved back to a row
 * inside that clinic before anything is written, and `null` rather than a throw
 * when the scope check fails, so a forged id is indistinguishable from a stale one.
 *
 * **Every write that changes how many meals a day holds also recomputes that
 * day's `client_plan_adherence` row**, the same obligation `mutations.ts`
 * documents beside `recomputeDayAdherence` itself. This file used to be the
 * one place that didn't: a plan built by hand — `createPlanFromSkeleton`, or
 * a slot added or removed on the board afterward — wrote real
 * `weekly_plan_meals` rows and never told `client_plan_adherence` those days
 * now had something to report on, so the dietitian dashboard's Progress tab
 * read a plan with meals in it as a week with no data at all. Placing a dish,
 * changing its servings, clearing a slot back to empty, or moving a dish
 * between two slots never changes a day's meal *count*, so none of those
 * three touch adherence — only the five writes that add or remove a row do:
 * `createPlanFromSkeleton`, `addMeal`, `addMealToWeek`, `removeMeal`, and
 * `removeMealFromWeek`.
 */

/** Confirms a client belongs to this clinic. */
async function ownedClient(clinicId: string, clientId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.clinicId, clinicId)))
    .limit(1);

  return row !== undefined;
}

/**
 * Creates a draft plan from a laid-out week.
 *
 * The manual counterpart to `createPlanFromGeneration`, and deliberately the same
 * shape: one transaction, and it replaces any existing DRAFT for that client and
 * week. A dietitian who starts a week twice wants the second attempt, not two
 * drafts. Published and archived plans are untouched — the partial unique index on
 * published weeks means anything else would be a constraint violation rather than a
 * decision.
 *
 * `generated_by` is `manual` and `model` is null: nothing here called a model, and
 * an audit trail implying otherwise would be worse than none.
 */
export async function createPlanFromSkeleton(input: {
  clinicId: string;
  clientId: string;
  weekStartDate: string;
  kcalTarget: number;
  meals: readonly SkeletonMeal[];
}): Promise<string | null> {
  if (!(await ownedClient(input.clinicId, input.clientId))) return null;
  // A plan with no slots is not a plan. It would also publish clean, because the
  // unfilled count that gates publishing would be zero.
  if (!input.meals.length) return null;

  return db.transaction(async (tx) => {
    await tx
      .delete(weeklyPlans)
      .where(
        and(
          eq(weeklyPlans.clientId, input.clientId),
          eq(weeklyPlans.weekStartDate, input.weekStartDate),
          eq(weeklyPlans.status, 'draft'),
        ),
      );

    const [plan] = await tx
      .insert(weeklyPlans)
      .values({
        clinicId: input.clinicId,
        clientId: input.clientId,
        weekStartDate: input.weekStartDate,
        status: 'draft',
        kcalTargetSnapshot: input.kcalTarget,
        generatedBy: 'manual',
        model: null,
      })
      .returning({ id: weeklyPlans.id });

    if (!plan) return null;

    await tx.insert(weeklyPlanMeals).values(
      input.meals.map((meal) => ({
        planId: plan.id,
        dayOfWeek: meal.dayOfWeek,
        slotKey: meal.slotKey,
        label: meal.label,
        timeOfDay: meal.timeOfDay,
        budgetKcal: meal.budgetKcal,
        sortOrder: meal.sortOrder,
        dishId: meal.dishId,
        servings: meal.servings,
      })),
    );

    // Every day of the week, exactly as `createPlanFromGeneration` does it —
    // a day the skeleton left empty still needs its stale adherence (from
    // whatever draft this just deleted) cleared, which is what the `null`
    // branch of `recomputeDayAdherence` does for a day with zero meals.
    for (const { dayOfWeek, date } of planWeekDays(input.weekStartDate)) {
      await recomputeDayAdherence(tx, {
        clinicId: input.clinicId,
        clientId: input.clientId,
        planId: plan.id,
        dayOfWeek,
        date,
      });
    }

    return plan.id;
  });
}

// ---------------------------------------------------------------------------
// Editing a plan
// ---------------------------------------------------------------------------

/**
 * The gate in front of every edit below: **only a draft is editable.**
 *
 * `published` used to be editable in place, behind an `allowPublished`
 * deliberate-action flag and a confirmation dialog. That is gone. Publishing now
 * freezes each meal's nutrition (`publishPlan` → `snapshotPlanMeals`), and an
 * in-place edit would leave a frozen total describing a dish the plan no longer
 * holds — a published card showing the previous dish's calories under the new
 * dish's name. Rather than overwrite a snapshot on every touch, a published plan is
 * immutable and the supported route is explicit:
 *
 *     unpublish  →  snapshots cleared, plan is a live draft again
 *                →  edit
 *                →  republish, which freezes it afresh
 *
 * `archived` was never editable and still is not: it is the record of what was, and
 * rewriting it would move the ground the compare view stands on.
 *
 * Lives in the mutation layer rather than the action layer so the rule cannot be
 * skipped by a caller that forgets it. This is not an authorisation check —
 * `requireStaffClinic` has already established who is writing — but the clinic
 * scope is re-checked here regardless.
 */
async function editablePlan(
  clinicId: string,
  planId: string,
): Promise<{ id: string; clientId: string; weekStartDate: string } | null> {
  const [plan] = await db
    .select({
      id: weeklyPlans.id,
      clientId: weeklyPlans.clientId,
      weekStartDate: weeklyPlans.weekStartDate,
      status: weeklyPlans.status,
    })
    .from(weeklyPlans)
    .where(and(eq(weeklyPlans.id, planId), eq(weeklyPlans.clinicId, clinicId)))
    .limit(1);

  if (!plan) return null;
  if (plan.status === 'draft') {
    return { id: plan.id, clientId: plan.clientId, weekStartDate: plan.weekStartDate };
  }

  return null;
}

/** `recomputeDayAdherence` for one day of an already-resolved plan. */
async function recomputePlanDay(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  clinicId: string,
  plan: { id: string; clientId: string; weekStartDate: string },
  dayOfWeek: number,
): Promise<void> {
  const date = weekDateForDay(plan.weekStartDate, dayOfWeek);
  if (!date) return;

  await recomputeDayAdherence(tx, { clinicId, clientId: plan.clientId, planId: plan.id, dayOfWeek, date });
}

/** Marks the plan changed. Every edit does it, so it is written once. */
async function touchPlan(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  planId: string,
): Promise<void> {
  await tx.update(weeklyPlans).set({ updatedAt: new Date() }).where(eq(weeklyPlans.id, planId));
}

/**
 * Puts a dish in a slot, replacing whatever was there.
 *
 * The replaced dish is demoted to an alternative rather than discarded, so a
 * mistaken drop is one click to undo and nobody has to remember what they
 * displaced. The rationale is cleared: it explained the previous dish, and leaving
 * the model's words under a dish a person chose would misattribute both.
 */
export async function placeDish(
  clinicId: string,
  planId: string,
  mealId: string,
  dishId: string,
  servings: number,
): Promise<boolean> {
  const plan = await editablePlan(clinicId, planId);
  if (!plan) return false;

  return db.transaction(async (tx) => {
    const [meal] = await tx
      .select({
        id: weeklyPlanMeals.id,
        dishId: weeklyPlanMeals.dishId,
        servings: weeklyPlanMeals.servings,
      })
      .from(weeklyPlanMeals)
      .where(and(eq(weeklyPlanMeals.id, mealId), eq(weeklyPlanMeals.planId, planId)))
      .limit(1);

    if (!meal) return false;

    // The incoming dish must not remain among the options, or the panel would
    // offer the meal as an alternative to itself.
    await tx
      .delete(weeklyPlanMealOptions)
      .where(
        and(eq(weeklyPlanMealOptions.mealId, mealId), eq(weeklyPlanMealOptions.dishId, dishId)),
      );

    if (meal.dishId && meal.dishId !== dishId) {
      await tx
        .insert(weeklyPlanMealOptions)
        .values({ mealId, dishId: meal.dishId, servings: meal.servings, sortOrder: 0 })
        .onConflictDoNothing();
    }

    await tx
      .update(weeklyPlanMeals)
      .set({ dishId, servings: snapServings(servings), rationaleAr: null, updatedAt: new Date() })
      .where(eq(weeklyPlanMeals.id, mealId));

    await touchPlan(tx, planId);

    return true;
  });
}

/** Changes a portion without changing the dish. Snapped to a legal multiplier. */
export async function setMealServings(
  clinicId: string,
  planId: string,
  mealId: string,
  servings: number,
): Promise<boolean> {
  const plan = await editablePlan(clinicId, planId);
  if (!plan) return false;

  return db.transaction(async (tx) => {
    const updated = await tx
      .update(weeklyPlanMeals)
      .set({ servings: snapServings(servings), updatedAt: new Date() })
      .where(and(eq(weeklyPlanMeals.id, mealId), eq(weeklyPlanMeals.planId, planId)))
      .returning({ id: weeklyPlanMeals.id });

    if (!updated.length) return false;

    await touchPlan(tx, planId);

    return true;
  });
}

/**
 * Empties a slot, keeping it.
 *
 * Distinct from removing it. An empty slot is a gap still to close before
 * publishing, and the unfilled banner counts it; removing the slot says the client
 * is not eating then at all.
 */
export async function clearMeal(
  clinicId: string,
  planId: string,
  mealId: string,
): Promise<boolean> {
  const plan = await editablePlan(clinicId, planId);
  if (!plan) return false;

  return db.transaction(async (tx) => {
    const updated = await tx
      .update(weeklyPlanMeals)
      .set({ dishId: null, servings: 1, rationaleAr: null, updatedAt: new Date() })
      .where(and(eq(weeklyPlanMeals.id, mealId), eq(weeklyPlanMeals.planId, planId)))
      .returning({ id: weeklyPlanMeals.id });

    if (!updated.length) return false;

    await touchPlan(tx, planId);

    return true;
  });
}

/** Deletes a slot from one day. The client's stored schedule is untouched. */
/**
 * Removes a slot from every day of the week.
 *
 * The counterpart to `addMealToWeek`, and the same argument for doing it in one
 * statement: the board draws a slot as a row, so deleting it day by day would
 * pass through six intermediate states in which the row exists on some days and
 * not others. `weekly_plan_meal_options` is cleaned up by the schema's cascade,
 * exactly as it is for a single `removeMeal`.
 */
export async function removeMealFromWeek(
  clinicId: string,
  planId: string,
  slotKey: string,
): Promise<number> {
  const plan = await editablePlan(clinicId, planId);
  if (!plan) return 0;

  return db.transaction(async (tx) => {
    const deleted = await tx
      .delete(weeklyPlanMeals)
      .where(and(eq(weeklyPlanMeals.planId, planId), eq(weeklyPlanMeals.slotKey, slotKey)))
      .returning({ id: weeklyPlanMeals.id, dayOfWeek: weeklyPlanMeals.dayOfWeek });

    if (!deleted.length) return 0;

    await touchPlan(tx, planId);

    const affectedDays = new Set(deleted.map((row) => row.dayOfWeek));
    for (const dayOfWeek of affectedDays) {
      await recomputePlanDay(tx, clinicId, plan, dayOfWeek);
    }

    return deleted.length;
  });
}

export async function removeMeal(
  clinicId: string,
  planId: string,
  mealId: string,
): Promise<boolean> {
  const plan = await editablePlan(clinicId, planId);
  if (!plan) return false;

  return db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(weeklyPlanMeals)
      .where(and(eq(weeklyPlanMeals.id, mealId), eq(weeklyPlanMeals.planId, planId)))
      .returning({ id: weeklyPlanMeals.id, dayOfWeek: weeklyPlanMeals.dayOfWeek });

    if (!deleted) return false;

    await touchPlan(tx, planId);
    await recomputePlanDay(tx, clinicId, plan, deleted.dayOfWeek);

    return true;
  });
}

/**
 * Adds a slot to one day.
 *
 * `budget_kcal` is 0, which already means "no budget" everywhere in this feature.
 * The added meal's calories count toward the day, so its header will show the day
 * running over target — which is true, and is the point. Rebalancing the day's
 * other budgets to make room would rewrite the numbers the rest of the week was
 * generated against.
 */
export async function addMeal(
  clinicId: string,
  planId: string,
  input: { dayOfWeek: number; slotKey: string; label: string; timeOfDay: string },
): Promise<string | null> {
  const plan = await editablePlan(clinicId, planId);
  if (!plan) return null;

  return db.transaction(async (tx) => {
    // Appended after everything already on that day, read inside the transaction
    // so two adds in the same moment cannot both claim the same position.
    const [last] = await tx
      .select({ sortOrder: weeklyPlanMeals.sortOrder })
      .from(weeklyPlanMeals)
      .where(
        and(eq(weeklyPlanMeals.planId, planId), eq(weeklyPlanMeals.dayOfWeek, input.dayOfWeek)),
      )
      .orderBy(desc(weeklyPlanMeals.sortOrder))
      .limit(1);

    const [added] = await tx
      .insert(weeklyPlanMeals)
      .values({
        planId,
        dayOfWeek: input.dayOfWeek,
        slotKey: input.slotKey,
        label: input.label,
        timeOfDay: input.timeOfDay,
        budgetKcal: 0,
        sortOrder: (last?.sortOrder ?? -1) + 1,
        dishId: null,
        servings: 1,
      })
      .returning({ id: weeklyPlanMeals.id });

    if (!added) return null;

    await touchPlan(tx, planId);
    await recomputePlanDay(tx, clinicId, plan, input.dayOfWeek);

    return added.id;
  });
}

/**
 * The same slot, appended to every day of the week.
 *
 * One transaction and one insert rather than seven calls to `addMeal`: the
 * board renders slots as rows, so a half-applied add would leave a row that
 * exists on four days and is missing from three, which is exactly the ragged
 * state the row model is there to avoid.
 *
 * Each day keeps its **own** next `sortOrder`. They are normally identical —
 * `planSkeleton` gives every day the same schedule — but a day that has had a
 * slot removed is one shorter, and forcing a shared position there would either
 * leave a hole or collide with an existing row.
 */
export async function addMealToWeek(
  clinicId: string,
  planId: string,
  input: { slotKey: string; label: string; timeOfDay: string },
): Promise<number> {
  const plan = await editablePlan(clinicId, planId);
  if (!plan) return 0;

  return db.transaction(async (tx) => {
    const existing = await tx
      .select({
        dayOfWeek: weeklyPlanMeals.dayOfWeek,
        slotKey: weeklyPlanMeals.slotKey,
        sortOrder: weeklyPlanMeals.sortOrder,
      })
      .from(weeklyPlanMeals)
      .where(eq(weeklyPlanMeals.planId, planId));

    const nextSortOrder = new Map<number, number>();
    const alreadyHas = new Set<number>();

    for (const row of existing) {
      const seen = nextSortOrder.get(row.dayOfWeek) ?? 0;
      nextSortOrder.set(row.dayOfWeek, Math.max(seen, row.sortOrder + 1));
      // A day that already carries this slot is skipped rather than given a
      // duplicate. Two rows with one slot key would make the board's row lookup
      // ambiguous, and the dietitian asked for the row to exist, not for a
      // second copy of it on the days that had it.
      if (row.slotKey === input.slotKey) alreadyHas.add(row.dayOfWeek);
    }

    const values = DAYS_OF_WEEK.filter((dayOfWeek) => !alreadyHas.has(dayOfWeek)).map(
      (dayOfWeek) => ({
        planId,
        dayOfWeek,
        slotKey: input.slotKey,
        label: input.label,
        timeOfDay: input.timeOfDay,
        budgetKcal: 0,
        sortOrder: nextSortOrder.get(dayOfWeek) ?? 0,
        dishId: null,
        servings: 1,
      }),
    );

    if (values.length === 0) return 0;

    const added = await tx
      .insert(weeklyPlanMeals)
      .values(values)
      .returning({ id: weeklyPlanMeals.id });

    await touchPlan(tx, planId);

    const affectedDays = new Set(values.map((value) => value.dayOfWeek));
    for (const dayOfWeek of affectedDays) {
      await recomputePlanDay(tx, clinicId, plan, dayOfWeek);
    }

    return added.length;
  });
}

/**
 * Moves or copies a dish from one slot to another.
 *
 * The dish and its portion travel; the target's own label, time and budget stay
 * where they are. Moving the row instead would carry a lunch's 647 kcal budget
 * into whatever slot it landed on, so dropping lunch on a breakfast slot would
 * quietly re-budget breakfast.
 *
 * Refuses when the source holds no dish: dragging an empty card is a gesture with
 * nothing behind it, and emptying the target would be a surprising way to read it.
 */
export async function moveMealDish(
  clinicId: string,
  planId: string,
  fromMealId: string,
  toMealId: string,
  mode: 'move' | 'copy',
): Promise<boolean> {
  const plan = await editablePlan(clinicId, planId);
  if (!plan) return false;
  if (fromMealId === toMealId) return false;

  return db.transaction(async (tx) => {
    const [source] = await tx
      .select({ dishId: weeklyPlanMeals.dishId, servings: weeklyPlanMeals.servings })
      .from(weeklyPlanMeals)
      .where(and(eq(weeklyPlanMeals.id, fromMealId), eq(weeklyPlanMeals.planId, planId)))
      .limit(1);

    if (!source?.dishId) return false;

    const [target] = await tx
      .select({ dishId: weeklyPlanMeals.dishId, servings: weeklyPlanMeals.servings })
      .from(weeklyPlanMeals)
      .where(and(eq(weeklyPlanMeals.id, toMealId), eq(weeklyPlanMeals.planId, planId)))
      .limit(1);

    if (!target) return false;

    const updated = await tx
      .update(weeklyPlanMeals)
      .set({
        dishId: source.dishId,
        servings: source.servings,
        rationaleAr: null,
        updatedAt: new Date(),
      })
      .where(and(eq(weeklyPlanMeals.id, toMealId), eq(weeklyPlanMeals.planId, planId)))
      .returning({ id: weeklyPlanMeals.id });

    if (!updated.length) return false;

    if (mode === 'move') {
      await tx
        .update(weeklyPlanMeals)
        .set({
          dishId: target.dishId,
          servings: target.dishId ? target.servings : 1,
          rationaleAr: null,
          updatedAt: new Date(),
        })
        .where(and(eq(weeklyPlanMeals.id, fromMealId), eq(weeklyPlanMeals.planId, planId)));
    }

    await touchPlan(tx, planId);

    return true;
  });
}
