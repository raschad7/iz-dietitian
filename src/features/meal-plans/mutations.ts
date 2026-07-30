import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/db';
import { clients, mealPlanItems, mealPlanMeals, mealPlans } from '@/db/schema';

import {
  DAYS_OF_WEEK,
  type CopyDayInput,
  type ItemFormInput,
  type MealFormInput,
  type PlanFormInput,
} from './schema';

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

/** The blocks each day of a new plan starts with, ready to edit. */
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
 * Creates a plan and a skeleton for all seven days in ONE transaction.
 *
 * A plan with no meals is not a useful thing to land on — the dietitian would
 * face an empty page and have to build the skeleton by hand every time. Every
 * day gets the same five blocks, so `copyDay` has somewhere to copy to and the
 * week reads consistently from the start. Wrapping the writes means a failure
 * part-way leaves no half-built plan behind.
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
      DAYS_OF_WEEK.flatMap((dayOfWeek) =>
        DEFAULT_MEALS.map((meal, index) => ({
          planId: plan.id,
          dayOfWeek,
          label: meal.label,
          timeOfDay: meal.timeOfDay,
          sortOrder: index,
        })),
      ),
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

export async function addMeal(
  clinicId: string,
  planId: string,
  dayOfWeek: number,
  input: MealFormInput,
): Promise<boolean> {
  const plan = await assertPlan(clinicId, planId);
  if (!plan) return false;

  await db.insert(mealPlanMeals).values({
    planId: plan,
    dayOfWeek,
    label: input.label,
    timeOfDay: input.timeOfDay,
    // Appended after everything already scheduled that day at the same time.
    sortOrder: sql`(select coalesce(max(${mealPlanMeals.sortOrder}), -1) + 1 from ${mealPlanMeals} where ${mealPlanMeals.planId} = ${plan} and ${mealPlanMeals.dayOfWeek} = ${dayOfWeek})`,
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

/**
 * Replaces one day of the week with a copy of another.
 *
 * The target day is emptied first, so the result is a copy and not a merge —
 * "copy Sunday to Monday" has to leave Monday looking like Sunday, which it
 * cannot do if Monday's existing meals survive alongside.
 *
 * Everything happens in ONE transaction. Deleting the target and failing to
 * write the copy would destroy a day's work with nothing to show for it, which
 * is the one outcome this operation must never produce.
 *
 * Copying a day onto itself is rejected by `copyDaySchema` before reaching here;
 * it would delete the source and leave nothing to read.
 *
 * Returns false when the plan does not belong to this clinic.
 */
export async function copyDay(
  clinicId: string,
  planId: string,
  { fromDay, toDay }: CopyDayInput,
): Promise<boolean> {
  const plan = await assertPlan(clinicId, planId);
  if (!plan) return false;

  const source = await db
    .select({
      id: mealPlanMeals.id,
      label: mealPlanMeals.label,
      timeOfDay: mealPlanMeals.timeOfDay,
      sortOrder: mealPlanMeals.sortOrder,
    })
    .from(mealPlanMeals)
    .where(and(eq(mealPlanMeals.planId, plan), eq(mealPlanMeals.dayOfWeek, fromDay)))
    .orderBy(asc(mealPlanMeals.timeOfDay), asc(mealPlanMeals.sortOrder));

  const sourceItems = source.length
    ? await db
        .select({
          mealId: mealPlanItems.mealId,
          foodId: mealPlanItems.foodId,
          quantityGrams: mealPlanItems.quantityGrams,
          sortOrder: mealPlanItems.sortOrder,
        })
        .from(mealPlanItems)
        .where(
          inArray(
            mealPlanItems.mealId,
            source.map((meal) => meal.id),
          ),
        )
    : [];

  const itemsByMeal = new Map<string, typeof sourceItems>();
  for (const item of sourceItems) {
    const bucket = itemsByMeal.get(item.mealId);
    if (bucket) bucket.push(item);
    else itemsByMeal.set(item.mealId, [item]);
  }

  await db.transaction(async (tx) => {
    // Cascades to the target day's items.
    await tx
      .delete(mealPlanMeals)
      .where(and(eq(mealPlanMeals.planId, plan), eq(mealPlanMeals.dayOfWeek, toDay)));

    // An empty source day is a valid thing to copy: it clears the target.
    if (source.length === 0) return;

    const created = await tx
      .insert(mealPlanMeals)
      .values(
        source.map((meal) => ({
          planId: plan,
          dayOfWeek: toDay,
          label: meal.label,
          timeOfDay: meal.timeOfDay,
          sortOrder: meal.sortOrder,
        })),
      )
      .returning({ id: mealPlanMeals.id });

    /**
     * `returning` preserves the order of the inserted values, so the new meal at
     * index i corresponds to `source[i]` — which is how each copied meal finds
     * the items belonging to the meal it came from.
     */
    const newItems = created.flatMap((meal, index) => {
      const originalId = source[index]?.id;
      const items = originalId ? (itemsByMeal.get(originalId) ?? []) : [];

      return items.map((item) => ({
        mealId: meal.id,
        foodId: item.foodId,
        quantityGrams: item.quantityGrams,
        sortOrder: item.sortOrder,
      }));
    });

    if (newItems.length) await tx.insert(mealPlanItems).values(newItems);
  });

  await touchPlan(plan);
  return true;
}

/** Empties one day without touching the rest of the week. */
export async function clearDay(clinicId: string, planId: string, dayOfWeek: number): Promise<boolean> {
  const plan = await assertPlan(clinicId, planId);
  if (!plan) return false;

  await db
    .delete(mealPlanMeals)
    .where(and(eq(mealPlanMeals.planId, plan), eq(mealPlanMeals.dayOfWeek, dayOfWeek)));

  await touchPlan(plan);
  return true;
}

export async function deleteItem(clinicId: string, itemId: string): Promise<boolean> {
  const item = await assertItem(clinicId, itemId);
  if (!item) return false;

  await db.delete(mealPlanItems).where(eq(mealPlanItems.id, itemId));

  await touchPlan(item.planId);
  return true;
}
