import { and, desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { clients, weeklyPlanMealOptions, weeklyPlanMeals, weeklyPlans } from '@/db/schema';

import { snapServings } from './similar';
import type { SkeletonMeal } from './skeleton';

/**
 * Writes for the manual side of weekly plans — the plans nobody generated.
 *
 * Same rules as `mutations.ts`: `clinicId` first, every id resolved back to a row
 * inside that clinic before anything is written, and `null` rather than a throw
 * when the scope check fails, so a forged id is indistinguishable from a stale one.
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

    return plan.id;
  });
}

// ---------------------------------------------------------------------------
// Editing a plan
// ---------------------------------------------------------------------------

/**
 * The gate in front of every edit below.
 *
 * `draft` always. `published` only when the caller states it meant to — the
 * dietitian turned on the edit-published mode, and a client is following this plan
 * right now. `archived` never: an archived plan is the record of what was, and
 * rewriting it would move the ground the compare view stands on.
 *
 * Lives in the mutation layer rather than the action layer so the rule cannot be
 * skipped by a caller that forgets it. `allowPublished` is a deliberate-action
 * check, not an authorisation one — `requireStaffClinic` has already established
 * who is writing, and the clinic scope is re-checked here regardless.
 */
async function editablePlan(
  clinicId: string,
  planId: string,
  allowPublished: boolean,
): Promise<{ id: string; clientId: string } | null> {
  const [plan] = await db
    .select({ id: weeklyPlans.id, clientId: weeklyPlans.clientId, status: weeklyPlans.status })
    .from(weeklyPlans)
    .where(and(eq(weeklyPlans.id, planId), eq(weeklyPlans.clinicId, clinicId)))
    .limit(1);

  if (!plan) return null;
  if (plan.status === 'draft') return { id: plan.id, clientId: plan.clientId };
  if (plan.status === 'published' && allowPublished) return { id: plan.id, clientId: plan.clientId };

  return null;
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
  allowPublished = false,
): Promise<boolean> {
  const plan = await editablePlan(clinicId, planId, allowPublished);
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
  allowPublished = false,
): Promise<boolean> {
  const plan = await editablePlan(clinicId, planId, allowPublished);
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
  allowPublished = false,
): Promise<boolean> {
  const plan = await editablePlan(clinicId, planId, allowPublished);
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
export async function removeMeal(
  clinicId: string,
  planId: string,
  mealId: string,
  allowPublished = false,
): Promise<boolean> {
  const plan = await editablePlan(clinicId, planId, allowPublished);
  if (!plan) return false;

  return db.transaction(async (tx) => {
    const deleted = await tx
      .delete(weeklyPlanMeals)
      .where(and(eq(weeklyPlanMeals.id, mealId), eq(weeklyPlanMeals.planId, planId)))
      .returning({ id: weeklyPlanMeals.id });

    if (!deleted.length) return false;

    await touchPlan(tx, planId);

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
  allowPublished = false,
): Promise<string | null> {
  const plan = await editablePlan(clinicId, planId, allowPublished);
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

    return added.id;
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
  allowPublished = false,
): Promise<boolean> {
  const plan = await editablePlan(clinicId, planId, allowPublished);
  if (!plan) return false;
  if (fromMealId === toMealId) return false;

  return db.transaction(async (tx) => {
    const [source] = await tx
      .select({ dishId: weeklyPlanMeals.dishId, servings: weeklyPlanMeals.servings })
      .from(weeklyPlanMeals)
      .where(and(eq(weeklyPlanMeals.id, fromMealId), eq(weeklyPlanMeals.planId, planId)))
      .limit(1);

    if (!source?.dishId) return false;

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
        .set({ dishId: null, servings: 1, rationaleAr: null, updatedAt: new Date() })
        .where(eq(weeklyPlanMeals.id, fromMealId));
    }

    await touchPlan(tx, planId);

    return true;
  });
}
