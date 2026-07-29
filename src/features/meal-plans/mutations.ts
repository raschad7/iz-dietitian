import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { clients, mealPlanItems, mealPlanMeals, mealPlans } from '@/db/schema';

import { type ItemFormInput, type MealFormInput, type PlanFormInput } from './schema';

/**
 * Every write to the meal-plan tables.
 *
 * Imports nothing from Next.js, for the same reason `src/features/clients/mutations.ts`
 * does not: `bun test` can call these directly, whereas a `"use server"` module
 * calling `revalidatePath` cannot run outside a request scope.
 *
 * A meal and an item are reached through their plan, and the plan is what
 * carries `clinic_id` — so every function here starts from a `clinicId` and
 * walks down. There is no path into these tables that skips the tenant check.
 */

/** The blocks a new plan starts with — a full day, ready to edit. */
const DEFAULT_MEALS = [
  { label: 'Breakfast', timeOfDay: '07:00' },
  { label: 'Morning snack', timeOfDay: '10:00' },
  { label: 'Lunch', timeOfDay: '13:00' },
  { label: 'Afternoon snack', timeOfDay: '16:00' },
  { label: 'Dinner', timeOfDay: '19:00' },
] as const;

export type DefaultMeal = (typeof DEFAULT_MEALS)[number];

/** Matches one plan within one clinic. Every write below is scoped through this. */
function scopedToClinic(clinicId: string, planId: string) {
  return and(eq(mealPlans.id, planId), eq(mealPlans.clinicId, clinicId));
}

/**
 * Confirms the plan belongs to this clinic before a meal or item write touches
 * it. Returns the plan id, or null when the caller has no business with it.
 */
async function assertPlan(clinicId: string, planId: string): Promise<string | null> {
  const [plan] = await db
    .select({ id: mealPlans.id })
    .from(mealPlans)
    .where(scopedToClinic(clinicId, planId))
    .limit(1);

  return plan?.id ?? null;
}

/**
 * Resolves a meal to its plan, checking the tenant on the way.
 *
 * The join is the point: a meal id is submitted by the browser, so it must never
 * be trusted to belong to the caller's clinic just because it exists.
 */
async function assertMeal(clinicId: string, mealId: string): Promise<{ planId: string } | null> {
  const [meal] = await db
    .select({ planId: mealPlanMeals.planId })
    .from(mealPlanMeals)
    .innerJoin(mealPlans, eq(mealPlans.id, mealPlanMeals.planId))
    .where(and(eq(mealPlanMeals.id, mealId), eq(mealPlans.clinicId, clinicId)))
    .limit(1);

  return meal ?? null;
}

/** Same, one level deeper: an item id back to the plan it ultimately belongs to. */
async function assertItem(clinicId: string, itemId: string): Promise<{ planId: string } | null> {
  const [item] = await db
    .select({ planId: mealPlans.id })
    .from(mealPlanItems)
    .innerJoin(mealPlanMeals, eq(mealPlanMeals.id, mealPlanItems.mealId))
    .innerJoin(mealPlans, eq(mealPlans.id, mealPlanMeals.planId))
    .where(and(eq(mealPlanItems.id, itemId), eq(mealPlans.clinicId, clinicId)))
    .limit(1);

  return item ?? null;
}

/** Bumps the plan's timestamp so the list orders by genuine last activity. */
function touchPlan(planId: string) {
  return db.update(mealPlans).set({ updatedAt: new Date() }).where(eq(mealPlans.id, planId));
}

/**
 * Creates a plan and its default day in ONE transaction.
 *
 * A plan with no meals is not a useful thing to land on — the dietitian would
 * face an empty page and have to build the skeleton by hand every time. Wrapping
 * both writes means a failure part-way leaves no half-built plan behind.
 *
 * Returns null when the client id does not belong to this clinic, which is what
 * stops a plan being attached to another clinic's client.
 */
export async function createPlan(clinicId: string, input: PlanFormInput): Promise<{ id: string } | null> {
  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, input.clientId), eq(clients.clinicId, clinicId)))
    .limit(1);

  if (!client) return null;

  return db.transaction(async (tx) => {
    const [plan] = await tx
      .insert(mealPlans)
      .values({
        clinicId,
        clientId: client.id,
        title: input.title,
        notes: input.notes ?? null,
      })
      .returning({ id: mealPlans.id });

    if (!plan) throw new Error('insert into meal_plans returned no row');

    await tx.insert(mealPlanMeals).values(
      DEFAULT_MEALS.map((meal, index) => ({
        planId: plan.id,
        label: meal.label,
        timeOfDay: meal.timeOfDay,
        sortOrder: index,
      })),
    );

    return plan;
  });
}

export async function updatePlan(clinicId: string, planId: string, input: PlanFormInput): Promise<boolean> {
  const rows = await db
    .update(mealPlans)
    .set({ title: input.title, notes: input.notes ?? null, updatedAt: new Date() })
    .where(scopedToClinic(clinicId, planId))
    .returning({ id: mealPlans.id });

  return rows.length > 0;
}

/** Cascades to the plan's meals and their items. */
export async function deletePlan(clinicId: string, planId: string): Promise<boolean> {
  const rows = await db
    .delete(mealPlans)
    .where(scopedToClinic(clinicId, planId))
    .returning({ id: mealPlans.id });

  return rows.length > 0;
}

export async function addMeal(clinicId: string, planId: string, input: MealFormInput): Promise<boolean> {
  const plan = await assertPlan(clinicId, planId);
  if (!plan) return false;

  await db.insert(mealPlanMeals).values({
    planId: plan,
    label: input.label,
    timeOfDay: input.timeOfDay,
    // Appended after everything already scheduled at the same time.
    sortOrder: sql`(select coalesce(max(${mealPlanMeals.sortOrder}), -1) + 1 from ${mealPlanMeals} where ${mealPlanMeals.planId} = ${plan})`,
  });

  await touchPlan(plan);
  return true;
}

export async function updateMeal(clinicId: string, mealId: string, input: MealFormInput): Promise<boolean> {
  const meal = await assertMeal(clinicId, mealId);
  if (!meal) return false;

  await db
    .update(mealPlanMeals)
    .set({ label: input.label, timeOfDay: input.timeOfDay, updatedAt: new Date() })
    .where(eq(mealPlanMeals.id, mealId));

  await touchPlan(meal.planId);
  return true;
}

/** Cascades to the meal's items. */
export async function deleteMeal(clinicId: string, mealId: string): Promise<boolean> {
  const meal = await assertMeal(clinicId, mealId);
  if (!meal) return false;

  await db.delete(mealPlanMeals).where(eq(mealPlanMeals.id, mealId));

  await touchPlan(meal.planId);
  return true;
}

/**
 * Adds a food to a meal.
 *
 * Only the food id and a quantity cross the wire — never the nutrition figures.
 * Those are read from `foods` at display time, so a tampered form cannot put
 * invented numbers into a client's plan.
 */
export async function addItem(clinicId: string, mealId: string, input: ItemFormInput): Promise<boolean> {
  const meal = await assertMeal(clinicId, mealId);
  if (!meal) return false;

  await db.insert(mealPlanItems).values({
    mealId,
    foodId: input.foodId,
    quantityGrams: input.quantityGrams,
    sortOrder: sql`(select coalesce(max(${mealPlanItems.sortOrder}), -1) + 1 from ${mealPlanItems} where ${mealPlanItems.mealId} = ${mealId})`,
  });

  await touchPlan(meal.planId);
  return true;
}

/** Changes how much of a food is in a meal. The food itself is not editable — remove and re-add. */
export async function updateItemQuantity(
  clinicId: string,
  itemId: string,
  quantityGrams: number,
): Promise<boolean> {
  const item = await assertItem(clinicId, itemId);
  if (!item) return false;

  await db
    .update(mealPlanItems)
    .set({ quantityGrams, updatedAt: new Date() })
    .where(eq(mealPlanItems.id, itemId));

  await touchPlan(item.planId);
  return true;
}

export async function deleteItem(clinicId: string, itemId: string): Promise<boolean> {
  const item = await assertItem(clinicId, itemId);
  if (!item) return false;

  await db.delete(mealPlanItems).where(eq(mealPlanItems.id, itemId));

  await touchPlan(item.planId);
  return true;
}
