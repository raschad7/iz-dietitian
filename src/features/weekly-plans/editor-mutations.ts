import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { clients, weeklyPlanMeals, weeklyPlans } from '@/db/schema';

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
