/**
 * Plans many weeks against the shipped catalog and reports what is wrong with
 * them — without a database, without a key, and without writing anything.
 *
 *   bun run plan:sweep
 *   bun run plan:sweep --profiles 12 --ai
 *
 * ## Why a sweep rather than a review
 *
 * `plan:review` reads one finished week. That found three real catalog errors on
 * its first run, but one week touches thirty-five of nearly three hundred dishes:
 * a dish that portions badly, or a slot band that cannot reach its budget, is a
 * problem nobody meets until the week it lands in.
 *
 * This walks the catalog instead. Every profile is a different daily target and a
 * different slot schedule, and the stand-in transport rotates from a different
 * offset each time, so a dozen profiles put most of the catalog through the real
 * generation path — reconcile, portion, balance, repair variety — and then run
 * the same arithmetic checks the AI reviewer is given.
 *
 * **Nothing is written and nothing is charged.** The plans exist for the length
 * of the process. `--ai` additionally sends each rendered week to the reviewing
 * model, which does cost money — a few cents for a full sweep.
 *
 * ## What it proves, and what it does not
 *
 * The dishes are picked by rotation, not by the model. So a *day landing on its
 * target* is a real result — it means the portion engine and the day balance can
 * reach the number from an arbitrary set of dishes — and so is *an ingredient
 * appearing in seven of thirty-five meals*, because that is the catalog's own
 * concentration showing through whatever picked the dishes.
 *
 * What it cannot say anything about is the model's judgement: whether the week
 * reads well, whether the protein rotates, whether a Tuesday makes sense. That is
 * what `--ai` and `plan:review` are for.
 */
import { datasetCatalog } from '@/features/weekly-plans/dataset-catalog';
import { reconcile, type CatalogDish } from '@/features/weekly-plans/generate';
import { createConsoleTransport } from '@/features/weekly-plans/llm';
import { mealIngredientLines, mealTotals } from '@/features/weekly-plans/meal-ingredients';
import { combineTotals, emptyTotals } from '@/features/weekly-plans/nutrition';
import { buildPrompt } from '@/features/weekly-plans/prompt';
import { toPromptCatalog, toPromptSides, type Board } from '@/features/weekly-plans/queries';
import { arithmeticFindings, runReview } from '@/features/weekly-plans/review';
import { DAYS_OF_WEEK, parseGeneratedPlan } from '@/features/weekly-plans/schema';
import { slotBudgets, type SlotBudget } from '@/features/weekly-plans/targets';

/**
 * The clients a sweep plans for.
 *
 * Chosen to span what the clinic actually sees rather than to be tidy: a small
 * woman losing weight and a large man gaining are the two ends the slot budgets
 * have to reach, and the schedules differ because a three-meal day asks each slot
 * for far more than a five-meal day does.
 */
const PROFILES = [
  { name: 'امرأة صغيرة، خفض وزن', kcal: 1400, slots: 5 },
  { name: 'امرأة، خفض وزن', kcal: 1600, slots: 5 },
  { name: 'امرأة، ثبات', kcal: 1800, slots: 5 },
  { name: 'امرأة، ثلاث وجبات', kcal: 1800, slots: 3 },
  { name: 'رجل، خفض وزن', kcal: 2000, slots: 5 },
  { name: 'رجل، ثبات', kcal: 2200, slots: 5 },
  { name: 'رجل، ثلاث وجبات', kcal: 2200, slots: 3 },
  { name: 'رجل نشيط', kcal: 2400, slots: 5 },
  { name: 'رجل نشيط، أربع وجبات', kcal: 2600, slots: 4 },
  { name: 'رجل كبير، زيادة وزن', kcal: 2800, slots: 5 },
] as const;

const SCHEDULE = [
  { slotKey: 'breakfast', label: 'فطور', timeOfDay: '07:30', kcalShare: 25 },
  { slotKey: 'snack_1', label: 'سناك صباحي', timeOfDay: '10:30', kcalShare: 10 },
  { slotKey: 'lunch', label: 'غداء', timeOfDay: '14:00', kcalShare: 35 },
  { slotKey: 'snack_2', label: 'سناك عصر', timeOfDay: '17:00', kcalShare: 10 },
  { slotKey: 'dinner', label: 'عشاء', timeOfDay: '20:00', kcalShare: 20 },
];

/** Three meals means the snacks are dropped and their share goes to the meals. */
function scheduleOf(count: number) {
  if (count >= 5) return SCHEDULE;
  if (count === 4) return SCHEDULE.filter((slot) => slot.slotKey !== 'snack_2');
  return SCHEDULE.filter((slot) => !slot.slotKey.startsWith('snack'));
}

/**
 * The stand-in planner, started from a different place in each slot's list.
 *
 * `createConsoleTransport` rotates by day and slot, which is enough to keep one
 * week from being seven identical days but not enough to reach a catalog of three
 * hundred. The offset is what turns ten weeks into coverage.
 */
function offsetTransport(offset: number) {
  const inner = createConsoleTransport();

  return {
    model: 'sweep',
    async complete(payload: Parameters<typeof inner.complete>[0]) {
      const result = await inner.complete(payload);
      const parsed = JSON.parse(result.content) as {
        summaryAr: string;
        days: Record<string, unknown>[];
      };

      // Re-pick every slot from the same enums the schema published, `offset`
      // further along. Reading the schema rather than the catalog is what keeps
      // this from choosing a dish the slot does not allow.
      const schema = payload.jsonSchema as {
        properties: {
          days: { items: { properties: Record<string, { properties?: { dish?: { enum?: string[] } } }> } };
        };
      };
      const slots = schema.properties.days.items.properties;

      for (const [index, day] of parsed.days.entries()) {
        for (const [slotKey, slotSchema] of Object.entries(slots)) {
          const options = slotSchema.properties?.dish?.enum;
          if (!options?.length || !day[slotKey]) continue;

          const meal = day[slotKey] as { dish: string };
          meal.dish = options[(offset + index * 3) % options.length]!;
        }
      }

      return { ...result, content: JSON.stringify(parsed) };
    },
  };
}

/** A board, assembled in memory from what `reconcile` produced. */
function boardFrom(
  profile: (typeof PROFILES)[number],
  budgets: readonly SlotBudget[],
  meals: ReturnType<typeof reconcile>['meals'],
  catalog: readonly CatalogDish[],
): Board {
  const byId = new Map(catalog.map((dish) => [dish.id, dish]));
  const days = DAYS_OF_WEEK.map((dayOfWeek) => {
    const dayMeals = meals
      .filter((meal) => meal.dayOfWeek === dayOfWeek)
      .map((meal) => {
        const dish = meal.dishId ? byId.get(meal.dishId) : undefined;
        const lines = dish
          ? mealIngredientLines({ recipe: dish.recipe, servings: meal.servings })
          : [];

        return {
          id: `${dayOfWeek}:${meal.slotKey}`,
          slotKey: meal.slotKey,
          label: meal.label,
          timeOfDay: meal.timeOfDay,
          dish: dish
            ? {
                id: dish.id,
                clinicId: null,
                slug: dish.slug,
                nameAr: dish.nameAr,
                nameEn: dish.nameAr,
                mealTypes: [...dish.mealTypes],
                source: dish.source,
                effort: dish.effort,
                cost: dish.cost,
                occasion: dish.occasion,
                isSide: false,
                allergenTags: [...dish.allergenTags],
                baseServingLabel: 'حصة',
                isActive: true,
                ingredients: [...dish.recipe],
                servings: meal.servings,
              }
            : null,
          lines,
          hasOwnAmounts: false,
          rationaleAr: meal.rationaleAr,
          totals: mealTotals(lines),
          grams: lines.reduce((sum, line) => sum + line.quantityGrams, 0),
          nutritionFrozen: false,
          budgetKcal: meal.budgetKcal,
          options: [],
        };
      });

    return {
      dayOfWeek,
      meals: dayMeals,
      totals: combineTotals(dayMeals.map((meal) => meal.totals)),
      unfilled: dayMeals.filter((meal) => meal.dish === null).length,
    };
  });

  return {
    id: 'sweep',
    clientId: 'sweep',
    clientName: profile.name,
    weekStartDate: '2026-01-04',
    status: 'draft',
    publishedAt: null,
    weekInstructions: null,
    kcalTargetSnapshot: profile.kcal,
    proteinTargetSnapshot: null,
    goalSnapshot: null,
    generatedBy: 'sweep',
    model: 'sweep',
    updatedAt: new Date(),
    days,
    totals: combineTotals(days.map((day) => day.totals)) ?? emptyTotals(),
    unfilled: days.reduce((sum, day) => sum + day.unfilled, 0),
    // `budgets` is not on a Board; kept in scope so a future check can compare.
    ...({} as Record<string, never>),
  } satisfies Board;
}

async function planFor(
  profile: (typeof PROFILES)[number],
  offset: number,
  catalog: readonly CatalogDish[],
  sides: readonly CatalogDish[],
) {
  const budgets = slotBudgets(profile.kcal, scheduleOf(profile.slots));

  const payload = buildPrompt({
    client: {
      age: 35,
      sex: null,
      heightCm: null,
      weightKg: null,
      bmi: null,
      bmiCategory: null,
      activityLevel: null,
      goal: null,
      dailyKcalTarget: profile.kcal,
      proteinTargetGrams: null,
      allergies: null,
      preferences: null,
      dislikes: null,
      permanentInstructions: null,
    },
    budgets,
    catalog: catalog.map((dish) => dish),
    sides: sides.map((dish) => dish),
    instruction: null,
    previousSlugs: [],
    days: [...DAYS_OF_WEEK],
    scope: 'week',
  });

  const result = await offsetTransport(offset).complete(payload);
  const parsed = parseGeneratedPlan(
    JSON.parse(result.content),
    budgets.map((slot) => slot.slotKey),
  );

  const outcome = reconcile({
    plan: parsed,
    days: [...DAYS_OF_WEEK],
    budgets,
    catalog,
    sides,
    allergens: [],
  });

  return { board: boardFrom(profile, budgets, outcome.meals, catalog), outcome };
}

/** Collapses "الأحد · غداء: …" into the sentence without the day, so like groups. */
function shapeOf(finding: string): string {
  return finding
    .replace(/^[^:]*: /, '')
    .replace(/\d+/g, 'N')
    .slice(0, 90);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const withAi = args.includes('--ai');
  const limit = Number(args[args.indexOf('--profiles') + 1]) || PROFILES.length;

  const dishes = datasetCatalog();
  const catalog = toPromptCatalog(dishes);
  const sides = toPromptSides(dishes);

  console.info(`sweeping ${Math.min(limit, PROFILES.length)} profiles over ${catalog.length} dishes`);
  console.info(`${sides.length} side(s) available\n`);

  const shapes = new Map<string, { count: number; example: string }>();
  const used = new Set<string>();
  let meals = 0;
  let unfilled = 0;

  for (const [index, profile] of PROFILES.slice(0, limit).entries()) {
    const { board, outcome } = await planFor(profile, index * 17, catalog, sides);
    const findings = arithmeticFindings(board);

    for (const day of board.days) {
      for (const meal of day.meals) {
        meals += 1;
        if (meal.dish) used.add(meal.dish.slug);
        else unfilled += 1;
      }
    }

    for (const finding of findings) {
      const shape = shapeOf(finding);
      const seen = shapes.get(shape);
      if (seen) seen.count += 1;
      else shapes.set(shape, { count: 1, example: finding });
    }

    const kcal = Math.round(board.totals.kcal.value / 7);
    const drift = Math.round(((kcal - profile.kcal) / profile.kcal) * 100);

    console.info(
      `${profile.name.padEnd(26)} ${String(kcal).padStart(5)} kcal/day ` +
        `(${drift > 0 ? '+' : ''}${drift}%)  ${String(findings.length).padStart(2)} finding(s)` +
        (outcome.unfilled ? `  ${outcome.unfilled} unfilled` : ''),
    );

    if (withAi) {
      const review = await runReview(board);
      console.info(
        `  reviewer: ${review.review.verdict}, ${review.review.findings.length} finding(s)`,
      );
      for (const finding of review.review.findings.slice(0, 3)) {
        console.info(
          `    [${finding.severity}] ${finding.slotKey || 'الأسبوع'}: ${finding.problemAr}`,
        );
      }
    }
  }

  console.info(`\n${meals} meals planned, ${used.size} of ${catalog.length} dishes reached`);
  if (unfilled) console.info(`${unfilled} slot(s) could not be filled at all`);

  if (!shapes.size) {
    console.info('\nno arithmetic findings.');
  } else {
    console.info('\nfindings by shape, commonest first:');
    for (const [, { count, example }] of [...shapes].sort((a, b) => b[1].count - a[1].count)) {
      console.info(`  ${String(count).padStart(3)} ×  ${example}`);
    }
  }
}
