import { and, eq, ne, sql } from 'drizzle-orm';

import { db } from '@/db';
import {
  clients,
  weeklyPlanGenerations,
  weeklyPlanMealOptions,
  weeklyPlanMeals,
  weeklyPlans,
} from '@/db/schema';
import { recomputeDayAdherence } from '@/features/portal/mutations';

import type { GenerationOutcome, ReconciledMeal } from './generate';
import type { GenerationScope } from './schema';
import { weekDates } from './week';

/**
 * Writes for the weekly-plans feature.
 *
 * Every function takes `clinicId` first and resolves any id the caller passed back
 * to a row inside that clinic before writing. Ids arriving from a form are
 * attacker-controlled; a mutation that trusted one would be a cross-tenant write.
 *
 * Functions return `false` rather than throwing when the scope check fails, so a
 * forged id is indistinguishable from a stale one — the action turns both into the
 * same "not found".
 */

/** Confirms a plan belongs to this clinic. The gate in front of every plan write. */
async function ownedPlan(
  clinicId: string,
  planId: string,
): Promise<{ id: string; clientId: string; status: string; kcalTargetSnapshot: number; weekStartDate: string } | null> {
  const [plan] = await db
    .select({
      id: weeklyPlans.id,
      clientId: weeklyPlans.clientId,
      status: weeklyPlans.status,
      kcalTargetSnapshot: weeklyPlans.kcalTargetSnapshot,
      weekStartDate: weeklyPlans.weekStartDate,
    })
    .from(weeklyPlans)
    .where(and(eq(weeklyPlans.id, planId), eq(weeklyPlans.clinicId, clinicId)))
    .limit(1);

  return plan ?? null;
}

/** Confirms a client belongs to this clinic. */
async function ownedClient(clinicId: string, clientId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.clinicId, clinicId)))
    .limit(1);

  return row !== undefined;
}

// ---------------------------------------------------------------------------
// The profile
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Persisting a generation
// ---------------------------------------------------------------------------

/** Turns reconciled meals into rows, for whichever scope produced them. */
function mealValues(planId: string, meals: readonly ReconciledMeal[]) {
  return meals.map((meal) => ({
    planId,
    dayOfWeek: meal.dayOfWeek,
    slotKey: meal.slotKey,
    label: meal.label,
    timeOfDay: meal.timeOfDay,
    budgetKcal: meal.budgetKcal,
    sortOrder: meal.sortOrder,
    dishId: meal.dishId,
    servings: meal.servings,
    rationaleAr: meal.rationaleAr,
  }));
}

/**
 * Writes the options for a set of just-inserted meals.
 *
 * Keyed by day and slot rather than by index: the insert returns rows in whatever
 * order PostgreSQL produced them, and pairing options to meals by position would
 * eventually attach the wrong alternatives to the wrong meal.
 */
async function insertOptions(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  inserted: { id: string; dayOfWeek: number; slotKey: string }[],
  meals: readonly ReconciledMeal[],
): Promise<void> {
  const idBySlot = new Map(inserted.map((row) => [`${row.dayOfWeek}:${row.slotKey}`, row.id]));

  const values = meals.flatMap((meal) => {
    const mealId = idBySlot.get(`${meal.dayOfWeek}:${meal.slotKey}`);
    if (!mealId) return [];

    return meal.options.map((option, index) => ({
      mealId,
      dishId: option.dishId,
      servings: option.servings,
      sortOrder: index,
    }));
  });

  if (values.length) await tx.insert(weeklyPlanMealOptions).values(values);
}

/** The audit row. Written for failures too — those are the interesting ones. */
export async function recordGeneration(input: {
  clinicId: string;
  planId: string | null;
  scope: GenerationScope;
  instruction: string | null;
  model: string;
  promptTokens?: number | null;
  completionTokens?: number | null;
  durationMs?: number | null;
  status: 'ok' | 'failed';
  error?: string | null;
}): Promise<void> {
  await db.insert(weeklyPlanGenerations).values({
    clinicId: input.clinicId,
    planId: input.planId,
    scope: input.scope,
    instruction: input.instruction,
    model: input.model,
    promptTokens: input.promptTokens ?? null,
    completionTokens: input.completionTokens ?? null,
    durationMs: input.durationMs ?? null,
    status: input.status,
    error: input.error ?? null,
  });
}

/**
 * Creates a draft plan from a whole-week generation.
 *
 * One transaction: a plan with half its meals is worse than no plan, because it
 * looks like a plan. Replaces any existing DRAFT for the same client and week —
 * regenerating is an overwrite of the draft you are looking at, not an accumulation
 * of drafts nobody will read. Published and archived plans are untouched.
 *
 * The draft being replaced can itself be an unpublished plan a client already
 * ticked meals against — `unpublishPlan` only flips the status, it does not
 * touch the meals — and deleting it here cascades away those
 * `weekly_plan_meal_completions` rows along with it. `client_plan_adherence`
 * carries no reference to either table, so without the recompute pass at the
 * end this would leave the client's Progress tab reporting a day exactly as
 * complete as it was before the regeneration, with nothing left behind it.
 */
export async function createPlanFromGeneration(input: {
  clinicId: string;
  clientId: string;
  weekStartDate: string;
  kcalTarget: number;
  /** Null when the week used the client's own figures. */
  proteinTarget: number | null;
  goal: string | null;
  weekInstructions: string | null;
  outcome: GenerationOutcome;
}): Promise<string | null> {
  if (!(await ownedClient(input.clinicId, input.clientId))) return null;

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
        weekInstructions: input.weekInstructions,
        kcalTargetSnapshot: input.kcalTarget,
        proteinTargetSnapshot: input.proteinTarget,
        goalSnapshot: input.goal,
        generatedBy: 'ai',
        model: input.outcome.model,
      })
      .returning({ id: weeklyPlans.id });

    if (!plan) return null;

    const inserted = await tx
      .insert(weeklyPlanMeals)
      .values(mealValues(plan.id, input.outcome.meals))
      .returning({
        id: weeklyPlanMeals.id,
        dayOfWeek: weeklyPlanMeals.dayOfWeek,
        slotKey: weeklyPlanMeals.slotKey,
      });

    await insertOptions(tx, inserted, input.outcome.meals);

    for (const [dayOfWeek, date] of weekDates(input.weekStartDate).entries()) {
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

/**
 * Replaces one day, or one meal, of an existing plan.
 *
 * Scoped deletion first, then insert, inside a transaction. The meal table's
 * unique index on `(plan_id, day_of_week, slot_key)` means a partial failure cannot
 * leave two meals in one slot — it would abort instead.
 *
 * Refuses to touch a published plan: republishing is an explicit act, and silently
 * editing a plan the client is already following would be the worst kind of
 * surprise. A draft plan reaches here having been published before, though — a
 * dietitian unpublishes to fix something, which is exactly what `replaceMeals`
 * is for — so its meals can already carry `weekly_plan_meal_completions` from
 * when the client was following it. The delete above cascades those away with
 * the old meal rows; the recompute pass at the end re-derives each affected
 * day from what is left (nothing, on the meals just replaced), so the day
 * reads as not-yet-followed rather than keeping whatever it was ticked to
 * before the edit.
 */
export async function replaceMeals(
  clinicId: string,
  planId: string,
  meals: readonly ReconciledMeal[],
  model: string,
): Promise<boolean> {
  const plan = await ownedPlan(clinicId, planId);
  if (!plan || plan.status !== 'draft') return false;
  if (!meals.length) return false;

  const dates = weekDates(plan.weekStartDate);
  const affectedDays = [...new Set(meals.map((meal) => meal.dayOfWeek))];

  await db.transaction(async (tx) => {
    for (const meal of meals) {
      await tx
        .delete(weeklyPlanMeals)
        .where(
          and(
            eq(weeklyPlanMeals.planId, planId),
            eq(weeklyPlanMeals.dayOfWeek, meal.dayOfWeek),
            eq(weeklyPlanMeals.slotKey, meal.slotKey),
          ),
        );
    }

    const inserted = await tx
      .insert(weeklyPlanMeals)
      .values(mealValues(planId, meals))
      .returning({
        id: weeklyPlanMeals.id,
        dayOfWeek: weeklyPlanMeals.dayOfWeek,
        slotKey: weeklyPlanMeals.slotKey,
      });

    await insertOptions(tx, inserted, meals);

    await tx
      .update(weeklyPlans)
      .set({ model, updatedAt: new Date() })
      .where(eq(weeklyPlans.id, planId));

    for (const dayOfWeek of affectedDays) {
      const date = dates[dayOfWeek];
      if (!date) continue;

      await recomputeDayAdherence(tx, { clinicId, clientId: plan.clientId, planId, dayOfWeek, date });
    }
  });

  return true;
}

// ---------------------------------------------------------------------------
// Manual edits
// ---------------------------------------------------------------------------

/**
 * Swaps the dish in one meal.
 *
 * The replaced dish becomes an option, so the swap is reversible from the panel —
 * a dietitian who changes their mind should not have to remember what was there.
 * The rationale is cleared: it explained the previous dish, and leaving the
 * model's words under a dish the dietitian chose would misattribute both.
 */
export async function swapMealDish(
  clinicId: string,
  planId: string,
  mealId: string,
  dishId: string,
  servings: number,
): Promise<boolean> {
  const plan = await ownedPlan(clinicId, planId);
  if (!plan || plan.status !== 'draft') return false;

  return db.transaction(async (tx) => {
    const [meal] = await tx
      .select({ id: weeklyPlanMeals.id, dishId: weeklyPlanMeals.dishId, servings: weeklyPlanMeals.servings })
      .from(weeklyPlanMeals)
      .where(and(eq(weeklyPlanMeals.id, mealId), eq(weeklyPlanMeals.planId, planId)))
      .limit(1);

    if (!meal) return false;

    // The incoming dish must not remain in the options, or the panel would offer
    // the meal as an alternative to itself.
    await tx
      .delete(weeklyPlanMealOptions)
      .where(and(eq(weeklyPlanMealOptions.mealId, mealId), eq(weeklyPlanMealOptions.dishId, dishId)));

    if (meal.dishId && meal.dishId !== dishId) {
      await tx
        .insert(weeklyPlanMealOptions)
        .values({ mealId, dishId: meal.dishId, servings: meal.servings, sortOrder: 0 })
        // Already there as an alternative: nothing to add.
        .onConflictDoNothing();
    }

    await tx
      .update(weeklyPlanMeals)
      .set({ dishId, servings, rationaleAr: null, updatedAt: new Date() })
      .where(eq(weeklyPlanMeals.id, mealId));

    await tx.update(weeklyPlans).set({ updatedAt: new Date() }).where(eq(weeklyPlans.id, planId));

    return true;
  });
}

/** Updates the week's instruction note without regenerating anything. */
export async function saveWeekInstructions(
  clinicId: string,
  planId: string,
  instructions: string | null,
): Promise<boolean> {
  const plan = await ownedPlan(clinicId, planId);
  if (!plan) return false;

  await db
    .update(weeklyPlans)
    .set({ weekInstructions: instructions, updatedAt: new Date() })
    .where(eq(weeklyPlans.id, planId));

  return true;
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

/**
 * Publishes a draft to the client portal.
 *
 * Archives whatever was published for that client and week first, in the same
 * transaction — the unique partial index on `(client_id, week_start_date) where
 * status = 'published'` would otherwise reject the update, which is exactly the
 * safety net that makes this ordering mandatory rather than merely tidy.
 *
 * Refuses to publish a plan with unfilled slots. A client opening their portal to
 * find Wednesday's lunch blank is a worse outcome than the dietitian being made to
 * fill it in.
 */
export async function publishPlan(clinicId: string, planId: string): Promise<
  { ok: true } | { ok: false; reason: 'not_found' | 'not_draft' | 'unfilled' }
> {
  const plan = await ownedPlan(clinicId, planId);
  if (!plan) return { ok: false, reason: 'not_found' };
  if (plan.status !== 'draft') return { ok: false, reason: 'not_draft' };

  const [gaps] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(weeklyPlanMeals)
    .where(and(eq(weeklyPlanMeals.planId, planId), sql`${weeklyPlanMeals.dishId} is null`));

  if ((gaps?.value ?? 0) > 0) return { ok: false, reason: 'unfilled' };

  await db.transaction(async (tx) => {
    const [target] = await tx
      .select({ clientId: weeklyPlans.clientId, weekStartDate: weeklyPlans.weekStartDate })
      .from(weeklyPlans)
      .where(eq(weeklyPlans.id, planId))
      .limit(1);

    if (!target) return;

    await tx
      .update(weeklyPlans)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(
        and(
          eq(weeklyPlans.clientId, target.clientId),
          eq(weeklyPlans.weekStartDate, target.weekStartDate),
          eq(weeklyPlans.status, 'published'),
          ne(weeklyPlans.id, planId),
        ),
      );

    await tx
      .update(weeklyPlans)
      .set({ status: 'published', publishedAt: new Date(), updatedAt: new Date() })
      .where(eq(weeklyPlans.id, planId));
  });

  return { ok: true };
}

/**
 * Takes a published plan back to draft so it can be edited.
 *
 * The client loses access immediately, which is the point: an unpublished plan is
 * one nobody should be following.
 */
export async function unpublishPlan(clinicId: string, planId: string): Promise<boolean> {
  const plan = await ownedPlan(clinicId, planId);
  if (!plan || plan.status !== 'published') return false;

  await db
    .update(weeklyPlans)
    .set({ status: 'draft', publishedAt: null, updatedAt: new Date() })
    .where(eq(weeklyPlans.id, planId));

  return true;
}

/**
 * Deletes a plan. Cascades take its meals, their options, and any
 * `weekly_plan_meal_completions` a client had already ticked against them.
 *
 * `client_plan_adherence` is not covered by that cascade — it carries no
 * reference to either table — so every day of the plan's week is recomputed
 * after the delete, inside the same transaction. The plan's meals are gone by
 * then, so each recompute sees zero and clears the day's row rather than
 * leaving it reporting adherence to a plan that no longer exists.
 */
export async function deletePlan(clinicId: string, planId: string): Promise<boolean> {
  const plan = await ownedPlan(clinicId, planId);
  if (!plan) return false;

  await db.transaction(async (tx) => {
    await tx.delete(weeklyPlans).where(eq(weeklyPlans.id, planId));

    for (const [dayOfWeek, date] of weekDates(plan.weekStartDate).entries()) {
      await recomputeDayAdherence(tx, { clinicId, clientId: plan.clientId, planId, dayOfWeek, date });
    }
  });

  return true;
}

/** The meals of one day, for a day-scoped regeneration. */
export async function planMealIds(clinicId: string, planId: string, dayOfWeek: number): Promise<string[]> {
  const plan = await ownedPlan(clinicId, planId);
  if (!plan) return [];

  const rows = await db
    .select({ id: weeklyPlanMeals.id })
    .from(weeklyPlanMeals)
    .where(and(eq(weeklyPlanMeals.planId, planId), eq(weeklyPlanMeals.dayOfWeek, dayOfWeek)));

  return rows.map((row) => row.id);
}

/** One meal, resolved through its plan so the clinic scope is checked. */
export async function getMealForRegeneration(
  clinicId: string,
  planId: string,
  mealId: string,
): Promise<{ dayOfWeek: number; slotKey: string; label: string; timeOfDay: string; budgetKcal: number } | null> {
  const plan = await ownedPlan(clinicId, planId);
  if (!plan) return null;

  const [meal] = await db
    .select({
      dayOfWeek: weeklyPlanMeals.dayOfWeek,
      slotKey: weeklyPlanMeals.slotKey,
      label: weeklyPlanMeals.label,
      timeOfDay: weeklyPlanMeals.timeOfDay,
      budgetKcal: weeklyPlanMeals.budgetKcal,
    })
    .from(weeklyPlanMeals)
    .where(and(eq(weeklyPlanMeals.id, mealId), eq(weeklyPlanMeals.planId, planId)))
    .limit(1);

  return meal ?? null;
}
