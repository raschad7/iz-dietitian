/**
 * Freezes the nutrition of weekly plans that were published before publishing
 * started freezing it.
 *
 *   bun run db:backfill:plan-snapshots           # report only, writes nothing
 *   bun run db:backfill:plan-snapshots --apply   # write the snapshots
 *
 * Scope: `published` and `archived` plans only. **Drafts are deliberately
 * untouched** — a draft is a working copy and must keep recalculating live, which
 * is exactly what a null `nutrition_snapshot` means.
 *
 * ## What this can and cannot do
 *
 * It captures **what the database calculates today**, not what the patient saw on
 * the day the plan was published. Those are the same number only if nothing has
 * changed the recipe or its foods since. No historical nutrition exists anywhere in
 * this repository or database — plans have only ever stored `dish_id + servings`,
 * and neither `weekly_plans` nor `weekly_plan_meals` nor the audit rows in
 * `weekly_plan_generations` carry a nutrient value — so for a plan whose recipe has
 * already drifted, the original figures are unrecoverable. Running this stops the
 * drift from today onward; it cannot undo drift that already happened.
 *
 * ## Guarantees
 *
 * - **Idempotent.** A meal already carrying a *readable* snapshot is left exactly
 *   as it is and counted as `alreadySnapshotted`. Running twice changes nothing the
 *   second time.
 * - **Repairs damage.** A meal whose blob is malformed, or written by a snapshot
 *   version this build cannot read, is re-frozen rather than skipped. Testing the
 *   column against null instead of reading it is how a corrupted snapshot used to
 *   survive every backfill it was offered to.
 * - **Fail-loud.** A populated meal whose dish will not load is reported with its
 *   clinic, plan, meal and dish ids, and the run writes nothing. It is never
 *   silently skipped and never filled with zeroes — a fabricated zero is
 *   indistinguishable from a meal that genuinely contains nothing.
 * - **Atomic.** All writes happen in one transaction, so the database is either
 *   fully backfilled or untouched.
 * - **Report first.** Without `--apply` it only counts, so the numbers can be read
 *   before anything is written.
 */
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { db } from '@/db';
import { clients, weeklyPlanMeals, weeklyPlans } from '@/db/schema';
import {
  FROZEN_PLAN_STATUSES,
  buildMealSnapshot,
  readMealSnapshot,
} from '@/features/weekly-plans/nutrition-snapshot';
import { mealIngredientLines } from '@/features/weekly-plans/meal-ingredients';
import { loadDishesByIds, ownAmountsByMeal } from '@/features/weekly-plans/queries';

type Unresolved = {
  clinicId: string;
  planId: string;
  weekStartDate: string;
  status: string;
  mealId: string;
  dayOfWeek: number;
  slotKey: string;
  dishId: string;
};

export type BackfillReport = {
  publishedPlans: number;
  archivedPlans: number;
  mealRowsInspected: number;
  populatedMeals: number;
  emptyMeals: number;
  alreadySnapshotted: number;
  /**
   * Meals that held a non-null blob which is not a readable snapshot — a damaged
   * one, or one written by a version this build cannot read. Counted apart from
   * `alreadySnapshotted` because they are re-frozen rather than left alone.
   */
  invalidSnapshots: number;
  snapshotsCreated: number;
  snapshotsRepaired: number;
  unresolved: Unresolved[];
  applied: boolean;
};

export async function backfillPlanNutritionSnapshots(
  options: { apply?: boolean } = {},
): Promise<BackfillReport> {
  const apply = options.apply ?? false;

  // `clinic_id` is carried through purely so an unresolved row can be handed to
  // whoever owns that clinic. The selection itself is intentionally global: this is
  // a maintenance script freezing historical records, not a tenant-facing read.
  const plans = await db
    .select({
      id: weeklyPlans.id,
      clinicId: weeklyPlans.clinicId,
      status: weeklyPlans.status,
      weekStartDate: weeklyPlans.weekStartDate,
    })
    .from(weeklyPlans)
    .innerJoin(clients, eq(clients.id, weeklyPlans.clientId))
    .where(inArray(weeklyPlans.status, [...FROZEN_PLAN_STATUSES]));

  const report: BackfillReport = {
    publishedPlans: plans.filter((plan) => plan.status === 'published').length,
    archivedPlans: plans.filter((plan) => plan.status === 'archived').length,
    mealRowsInspected: 0,
    populatedMeals: 0,
    emptyMeals: 0,
    alreadySnapshotted: 0,
    invalidSnapshots: 0,
    snapshotsCreated: 0,
    snapshotsRepaired: 0,
    unresolved: [],
    applied: false,
  };

  if (!plans.length) return report;

  const planById = new Map(plans.map((plan) => [plan.id, plan]));

  const meals = await db
    .select({
      id: weeklyPlanMeals.id,
      planId: weeklyPlanMeals.planId,
      dayOfWeek: weeklyPlanMeals.dayOfWeek,
      slotKey: weeklyPlanMeals.slotKey,
      dishId: weeklyPlanMeals.dishId,
      servings: weeklyPlanMeals.servings,
      nutritionSnapshot: weeklyPlanMeals.nutritionSnapshot,
    })
    .from(weeklyPlanMeals)
    .where(
      inArray(
        weeklyPlanMeals.planId,
        plans.map((plan) => plan.id),
      ),
    );

  report.mealRowsInspected = meals.length;

  // Four populations, counted separately so the report says what it did rather
  // than just how many rows it saw.
  //
  // The damaged group is why this reads every blob instead of testing it against
  // null. "Has a snapshot" used to mean "the column is not null", so a meal
  // holding `{"version":1,"totals":{}}` was counted as already frozen, skipped
  // for ever, and went on calculating live behind a column that said it did not.
  const needsSnapshot: typeof meals = [];
  const needsRepair: typeof meals = [];

  for (const meal of meals) {
    if (meal.dishId === null) {
      report.emptyMeals += 1;
      continue;
    }

    report.populatedMeals += 1;

    const read = readMealSnapshot(meal.nutritionSnapshot);

    if (read.status === 'valid') {
      report.alreadySnapshotted += 1;
      continue;
    }

    if (read.status === 'absent') {
      needsSnapshot.push(meal);
      continue;
    }

    report.invalidSnapshots += 1;
    needsRepair.push(meal);
  }

  const pending = [...needsSnapshot, ...needsRepair];
  if (!pending.length) return report;

  const dishIds = [...new Set(pending.map((meal) => meal.dishId!))];
  const dishById = new Map((await loadDishesByIds(dishIds)).map((dish) => [dish.id, dish]));

  // Resolve everything before writing anything, exactly as `seed-dishes.ts` does:
  // a partially backfilled set is worse than an unbackfilled one, because the gap
  // is invisible afterwards.
  for (const meal of pending) {
    if (dishById.has(meal.dishId!)) continue;

    const plan = planById.get(meal.planId);
    report.unresolved.push({
      clinicId: plan?.clinicId ?? 'unknown',
      planId: meal.planId,
      weekStartDate: plan?.weekStartDate ?? 'unknown',
      status: plan?.status ?? 'unknown',
      mealId: meal.id,
      dayOfWeek: meal.dayOfWeek,
      slotKey: meal.slotKey,
      dishId: meal.dishId!,
    });
  }

  if (report.unresolved.length) return report;
  if (!apply) return report;

  await db.transaction(async (tx) => {
    // The hand-set amounts for every meal about to be frozen. A meal a dietitian
    // adjusted must be backfilled at the amounts she set, not at the dish's.
    const ownAmounts = await ownAmountsByMeal(
      [...needsSnapshot, ...needsRepair].map((meal) => meal.id),
      tx,
    );

    const linesFor = (meal: (typeof needsSnapshot)[number]) =>
      mealIngredientLines({
        recipe: dishById.get(meal.dishId!)!.ingredients,
        servings: meal.servings,
        stored: ownAmounts.get(meal.id),
      });

    for (const meal of needsSnapshot) {
      await tx
        .update(weeklyPlanMeals)
        .set({ nutritionSnapshot: buildMealSnapshot(linesFor(meal)) })
        // `is null` in the predicate as well as in the scan above: it makes the
        // write itself idempotent, so a concurrent publish that froze this meal
        // between the read and the write is not overwritten.
        .where(and(eq(weeklyPlanMeals.id, meal.id), isNull(weeklyPlanMeals.nutritionSnapshot)));

      report.snapshotsCreated += 1;
    }

    // Repairs write over a value rather than into a gap, so they cannot carry the
    // `is null` guard. There is nothing to protect here anyway: what is being
    // replaced is a blob no reader can use.
    for (const meal of needsRepair) {
      await tx
        .update(weeklyPlanMeals)
        .set({ nutritionSnapshot: buildMealSnapshot(linesFor(meal)) })
        .where(eq(weeklyPlanMeals.id, meal.id));

      report.snapshotsRepaired += 1;
    }
  });

  report.applied = true;

  return report;
}

if (import.meta.main) {
  const apply = process.argv.includes('--apply');

  const [database] = await db.execute<{ name: string }>(
    sql`select current_database() as name`,
  );
  console.info(`database: ${database?.name ?? 'unknown'}`);
  console.info(apply ? 'mode: APPLY (writes)' : 'mode: report only (add --apply to write)');
  console.info('');

  const report = await backfillPlanNutritionSnapshots({ apply });

  console.info(`published plans found:    ${report.publishedPlans}`);
  console.info(`archived plans found:     ${report.archivedPlans}`);
  console.info(`meal rows inspected:      ${report.mealRowsInspected}`);
  console.info(`  populated:              ${report.populatedMeals}`);
  console.info(`  empty slots (skipped):  ${report.emptyMeals}`);
  console.info(`  already snapshotted:    ${report.alreadySnapshotted}`);
  console.info(`  damaged/unsupported:    ${report.invalidSnapshots}`);
  console.info(`snapshots created:        ${report.snapshotsCreated}`);
  console.info(`snapshots repaired:       ${report.snapshotsRepaired}`);
  console.info(`unresolved:               ${report.unresolved.length}`);

  if (report.unresolved.length) {
    console.error('\nNothing was written. These populated meals could not be resolved:');
    for (const row of report.unresolved) {
      console.error(
        `  clinic=${row.clinicId} plan=${row.planId} (${row.status}, week ${row.weekStartDate}) meal=${row.mealId} day=${row.dayOfWeek} slot=${row.slotKey} dish=${row.dishId}`,
      );
    }
    process.exit(1);
  }

  if (!apply && report.populatedMeals > report.alreadySnapshotted) {
    console.info('\nRe-run with --apply to write these snapshots.');
  }

  console.info(
    '\nNote: snapshots capture what the database calculates TODAY. For a plan whose recipe or foods have already changed since publication, the original figures are not recoverable.',
  );

  process.exit(0);
}
