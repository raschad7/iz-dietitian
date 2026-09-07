/**
 * Generates real weeks for real client shapes, and writes each one out to be read.
 *
 *   bun --env-file=.env.local run scripts/plan-lab.ts
 *   bun --env-file=.env.local run scripts/plan-lab.ts --only diabetes_type_2
 *   bun --env-file=.env.local run scripts/plan-lab.ts --concurrency 4 --out .plan-lab
 *
 * ## Why this exists beside `plan:sweep`
 *
 * `plan:sweep` plans with `createConsoleTransport` — dishes chosen by rotation. That
 * is exactly right for what it tests: a day landing on its target from an arbitrary
 * set of dishes proves the portion engine and the day balance, and it proves it
 * without a key or a bill. What it cannot test is the only thing a client notices,
 * which is *judgement* — whether the model picked food a family eats, whether Tuesday
 * has a shape, whether the protein rotates.
 *
 * So this is the same path with the real transport in it, and its output is not a
 * count of findings. It is the week, rendered exactly as the client receives it, with
 * the arithmetic checks and the catalog's own metadata printed alongside — a document
 * a dietitian can read meal by meal and mark up.
 *
 * **No database, nothing written, nothing published.** The catalog comes from the
 * committed dataset, the plans live for the length of the process, and each is saved
 * to a file for reading. It does spend money: roughly a cent a week at `gpt-5.6-luna`.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { plannerCaveats } from '@/features/weekly-plans/clinical';
import { datasetCatalog } from '@/features/weekly-plans/dataset-catalog';
import { reconcile, type CatalogDish } from '@/features/weekly-plans/generate';
import { getLlmTransport } from '@/features/weekly-plans/llm';
import { mealIngredientLines, mealTotals } from '@/features/weekly-plans/meal-ingredients';
import { combineTotals, emptyTotals } from '@/features/weekly-plans/nutrition';
import { chooseServings, portionLine } from '@/features/weekly-plans/portioning';
import { buildPrompt } from '@/features/weekly-plans/prompt';
import { toPromptCatalog, toPromptSides, type Board } from '@/features/weekly-plans/queries';
import { arithmeticFindings, renderPlanForReview } from '@/features/weekly-plans/review';
import { DAYS_OF_WEEK, isFixedPortion, parseGeneratedPlan } from '@/features/weekly-plans/schema';
import { slotBudgets, suggestProteinGrams, suggestTargets } from '@/features/weekly-plans/targets';
import { DEFAULT_MEAL_SCHEDULE } from '@/features/clients/nutrition';

/**
 * One client, described the way the intake form describes one.
 *
 * Anthropometrics rather than a calorie number, deliberately: the target is then
 * computed by the same `suggestTargets` the app uses, so a profile here is a client
 * the clinic could actually have rather than a number chosen to be convenient.
 */
type Profile = {
  key: string;
  /** What the case is, for the report heading. */
  titleAr: string;
  titleEn: string;
  age: number;
  sex: 'male' | 'female';
  heightCm: number;
  weightKg: number;
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  goal: 'weight_loss' | 'weight_gain' | 'maintenance' | 'medical' | 'sports';
  clinicalTags?: string[];
  dietPattern?: string | null;
  /** Allergen tags, as the profile stores them: nuts, lactose, gluten, egg, sesame, fish. */
  allergens?: string[];
  /** The prose fields, as a dietitian types them. */
  allergies?: string | null;
  preferences?: string | null;
  dislikes?: string | null;
  permanentInstructions?: string | null;
  /** This week's note. */
  instruction?: string | null;
  /** Slots, when this client does not eat on the default five. */
  schedule?: typeof DEFAULT_MEAL_SCHEDULE;
};

const THREE_MEALS = [
  { slotKey: 'breakfast', label: 'فطور', timeOfDay: '08:00', kcalShare: 0.3 },
  { slotKey: 'lunch', label: 'غداء', timeOfDay: '14:00', kcalShare: 0.45 },
  { slotKey: 'dinner', label: 'عشاء', timeOfDay: '20:00', kcalShare: 0.25 },
];

/** Ramadan is two meals and a night snack, not breakfast-lunch-dinner. */
const RAMADAN = [
  { slotKey: 'breakfast', label: 'فطور (إفطار)', timeOfDay: '18:30', kcalShare: 0.45 },
  { slotKey: 'snack_1', label: 'سناك بعد الإفطار', timeOfDay: '21:00', kcalShare: 0.2 },
  { slotKey: 'dinner', label: 'سحور', timeOfDay: '03:30', kcalShare: 0.35 },
];

/**
 * The cases the review covers.
 *
 * Three groups, chosen with the clinic: the everyday mix, where "robotic and
 * repetitive" costs the most; the clinical conditions, which test whether a prompt
 * sentence actually changes what gets chosen; and the hard constraints, where the
 * catalog filter may leave the model nothing good and the honest answer matters.
 */
const PROFILES: Profile[] = [
  /* ---- the everyday mix ---- */
  {
    key: 'loss_woman',
    titleAr: 'امرأة، خفض وزن',
    titleEn: 'Woman, weight loss',
    age: 32,
    sex: 'female',
    heightCm: 165,
    weightKg: 82,
    activityLevel: 'light',
    goal: 'weight_loss',
  },
  {
    key: 'loss_man',
    titleAr: 'رجل، خفض وزن، مكتبي',
    titleEn: 'Man, weight loss, desk job',
    age: 40,
    sex: 'male',
    heightCm: 176,
    weightKg: 95,
    activityLevel: 'sedentary',
    goal: 'weight_loss',
    dislikes: 'لا يحب السمك',
  },
  {
    key: 'maintenance_woman',
    titleAr: 'امرأة، ثبات وزن',
    titleEn: 'Woman, maintenance',
    age: 28,
    sex: 'female',
    heightCm: 160,
    weightKg: 58,
    activityLevel: 'moderate',
    goal: 'maintenance',
  },
  {
    key: 'gain_man',
    titleAr: 'شاب، زيادة وزن وكتلة عضلية',
    titleEn: 'Young man, weight/muscle gain',
    age: 24,
    sex: 'male',
    heightCm: 180,
    weightKg: 68,
    activityLevel: 'active',
    goal: 'weight_gain',
    preferences: 'يتمرن أربع مرات في الأسبوع',
  },

  /* ---- clinical conditions ---- */
  {
    key: 'diabetes_type_2',
    titleAr: 'رجل، سكري نوع ٢',
    titleEn: 'Man, type 2 diabetes',
    age: 55,
    sex: 'male',
    heightCm: 172,
    weightKg: 88,
    activityLevel: 'sedentary',
    goal: 'weight_loss',
    clinicalTags: ['diabetes_type_2'],
  },
  {
    key: 'hypertension_cholesterol',
    titleAr: 'امرأة، ضغط وكوليسترول',
    titleEn: 'Woman, hypertension + high cholesterol',
    age: 60,
    sex: 'female',
    heightCm: 158,
    weightKg: 78,
    activityLevel: 'light',
    goal: 'weight_loss',
    clinicalTags: ['hypertension', 'high_cholesterol'],
  },
  {
    key: 'pcos',
    titleAr: 'امرأة، تكيس المبايض',
    titleEn: 'Woman, PCOS',
    age: 26,
    sex: 'female',
    heightCm: 163,
    weightKg: 74,
    activityLevel: 'light',
    goal: 'weight_loss',
    clinicalTags: ['pcos'],
  },
  {
    key: 'kidney_disease',
    titleAr: 'رجل، قصور كلوي',
    titleEn: 'Man, chronic kidney disease',
    age: 58,
    sex: 'male',
    heightCm: 170,
    weightKg: 80,
    activityLevel: 'sedentary',
    goal: 'maintenance',
    clinicalTags: ['kidney_disease'],
    dietPattern: 'renal',
  },
  {
    key: 'anemia',
    titleAr: 'فتاة، فقر دم بعوز الحديد',
    titleEn: 'Young woman, iron-deficiency anaemia',
    age: 22,
    sex: 'female',
    heightCm: 162,
    weightKg: 52,
    activityLevel: 'light',
    goal: 'maintenance',
    clinicalTags: ['anemia'],
  },

  /* ---- hard constraints ---- */
  {
    key: 'celiac',
    titleAr: 'امرأة، سيلياك',
    titleEn: 'Woman, coeliac disease',
    age: 30,
    sex: 'female',
    heightCm: 167,
    weightKg: 63,
    activityLevel: 'moderate',
    goal: 'maintenance',
    clinicalTags: ['celiac'],
    allergens: ['gluten'],
    allergies: 'جلوتين',
  },
  {
    key: 'keto_epilepsy',
    titleAr: 'شاب، صرع، حمية كيتونية',
    titleEn: 'Young man, epilepsy, ketogenic',
    age: 19,
    sex: 'male',
    heightCm: 175,
    weightKg: 70,
    activityLevel: 'light',
    goal: 'medical',
    clinicalTags: ['epilepsy'],
    dietPattern: 'keto',
  },
  {
    key: 'vegetarian',
    titleAr: 'رجل نباتي',
    titleEn: 'Vegetarian man',
    age: 35,
    sex: 'male',
    heightCm: 174,
    weightKg: 72,
    activityLevel: 'moderate',
    goal: 'maintenance',
    dislikes: 'نباتي — لا لحوم ولا دجاج ولا سمك إطلاقاً',
    permanentInstructions: 'العميل نباتي. مصادر البروتين: بقوليات، بيض، ألبان، مكسرات.',
  },
  {
    key: 'multi_allergy',
    titleAr: 'امرأة، حساسية متعددة',
    titleEn: 'Woman, multiple allergies',
    age: 34,
    sex: 'female',
    heightCm: 161,
    weightKg: 70,
    activityLevel: 'light',
    goal: 'weight_loss',
    allergens: ['nuts', 'egg', 'sesame'],
    allergies: 'مكسرات، بيض، سمسم (طحينة)',
  },
  {
    key: 'eats_out',
    titleAr: 'رجل، يأكل الغداء خارج البيت',
    titleEn: 'Man, eats lunch out on workdays',
    age: 29,
    sex: 'male',
    heightCm: 178,
    weightKg: 84,
    activityLevel: 'light',
    goal: 'weight_loss',
    instruction: 'يأكل الغداء خارج البيت من الأحد إلى الخميس. الجمعة والسبت في البيت.',
  },
  {
    key: 'ramadan',
    titleAr: 'امرأة، أسبوع رمضان',
    titleEn: 'Woman, Ramadan week',
    age: 38,
    sex: 'female',
    heightCm: 164,
    weightKg: 75,
    activityLevel: 'light',
    goal: 'weight_loss',
    instruction: 'هذا الأسبوع رمضان. إفطار بعد المغرب وسحور قبل الفجر.',
    schedule: RAMADAN,
  },
  {
    key: 'three_meals_teacher',
    titleAr: 'معلّمة، ثلاث وجبات فقط',
    titleEn: 'Teacher, three meals only',
    age: 45,
    sex: 'female',
    heightCm: 159,
    weightKg: 69,
    activityLevel: 'light',
    goal: 'weight_loss',
    instruction: 'لا تأكل سناكات. ثلاث وجبات فقط.',
    schedule: THREE_MEALS,
  },
];

/** The catalog a client with these allergens is planned from — the `loadCatalog` rule. */
function catalogFor(allergens: readonly string[]) {
  const blocked = new Set(allergens);
  return datasetCatalog().filter((dish) => !dish.allergenTags.some((tag) => blocked.has(tag)));
}

/** A board, assembled in memory from what `reconcile` produced. */
function boardFrom(
  profile: Profile,
  kcalTarget: number,
  proteinTarget: number | null,
  meals: ReturnType<typeof reconcile>['meals'],
  catalog: readonly CatalogDish[],
  sideCatalog: readonly CatalogDish[],
): Board {
  const byId = new Map([...catalog, ...sideCatalog].map((dish) => [dish.id, dish]));

  const days = DAYS_OF_WEEK.map((dayOfWeek) => {
    const dayMeals = meals
      .filter((meal) => meal.dayOfWeek === dayOfWeek)
      .map((meal) => {
        const dish = meal.dishId ? byId.get(meal.dishId) : undefined;
        const sides = meal.sideDishIds.flatMap((id) => {
          const side = byId.get(id);
          return side
            ? [{ id: side.id, nameAr: side.nameAr, nameEn: side.nameAr, recipe: side.recipe }]
            : [];
        });
        const lines = dish
          ? mealIngredientLines({ recipe: dish.recipe, servings: meal.servings, sides })
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
          sides: sides.map(({ id, nameAr, nameEn }) => ({ id, nameAr, nameEn })),
          hasOwnAmounts: false,
          rationaleAr: meal.rationaleAr,
          totals: mealTotals(lines),
          grams: lines.reduce((sum, line) => sum + line.quantityGrams, 0),
          nutritionFrozen: false,
          budgetKcal: meal.budgetKcal,
          options: meal.options.map((option) => {
            const alt = byId.get(option.dishId);
            return {
              dishId: option.dishId,
              slug: option.slug,
              nameAr: alt?.nameAr ?? option.slug,
              nameEn: alt?.nameAr ?? option.slug,
              servings: option.servings,
              isSimilar: option.isSimilar,
              kcal: 0,
            };
          }),
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
    id: profile.key,
    clientId: profile.key,
    clientName: profile.titleAr,
    weekStartDate: '2026-09-13',
    status: 'draft',
    publishedAt: null,
    weekInstructions: profile.instruction ?? null,
    clientNote: null,
    kcalTargetSnapshot: kcalTarget,
    proteinTargetSnapshot: proteinTarget,
    goalSnapshot: profile.goal,
    generatedBy: 'plan-lab',
    model: process.env.OPENAI_MODEL ?? null,
    updatedAt: new Date(),
    days,
    totals: combineTotals(days.map((day) => day.totals)) ?? emptyTotals(),
    unfilled: days.reduce((sum, day) => sum + day.unfilled, 0),
  } as Board;
}

/**
 * Generates, or replays a response already on disk.
 *
 * `runGeneration` is not used here, and the reason is the whole point of a lab: it
 * hands back a reconciled week and throws the model's actual answer away. Keeping
 * that answer is what makes a *replay* possible — reconciling the same response
 * twice with different rules, so "the variety repair cost this week 70 g of
 * protein" is a measurement rather than a hypothesis. It also means iterating on
 * portioning costs nothing, because the expensive half already happened.
 *
 * Everything else is the production path exactly: the same `buildPrompt`, the same
 * transport, the same `reconcile`.
 */
async function planFor(profile: Profile, options: { replay?: string } = {}) {
  const schedule = profile.schedule ?? DEFAULT_MEAL_SCHEDULE;
  const allergens = profile.allergens ?? [];

  const targets = suggestTargets({
    weightKg: profile.weightKg,
    heightCm: profile.heightCm,
    age: profile.age,
    sex: profile.sex,
    activityLevel: profile.activityLevel,
    goal: profile.goal,
    clinicalTags: profile.clinicalTags ?? [],
  });

  const kcalTarget = targets.suggestedKcal!;
  const proteinTarget = suggestProteinGrams(profile.weightKg);
  const budgets = slotBudgets(kcalTarget, schedule);

  const dishes = catalogFor(allergens);
  const catalog = toPromptCatalog(dishes, profile.dietPattern ?? null);
  const sides = toPromptSides(dishes, profile.dietPattern ?? null);

  const payload = buildPrompt({
    client: {
        age: profile.age,
        sex: profile.sex,
        heightCm: profile.heightCm,
        weightKg: profile.weightKg,
        bmi: targets.bmi,
        bmiCategory: targets.bmiCategory,
        activityLevel: profile.activityLevel,
        goal: profile.goal,
        dailyKcalTarget: kcalTarget,
        proteinTargetGrams: proteinTarget,
        allergies: profile.allergies ?? null,
        preferences: profile.preferences ?? null,
        dislikes: profile.dislikes ?? null,
        permanentInstructions: profile.permanentInstructions ?? null,
        clinicalTags: profile.clinicalTags ?? [],
        dietPattern: profile.dietPattern ?? null,
      },
    budgets,
    catalog,
    sides,
    instruction: profile.instruction ?? null,
    previousSlugs: [],
    days: [...DAYS_OF_WEEK],
    scope: 'week',
  });

  const startedAt = Date.now();

  const raw = options.replay
    ? { content: options.replay, model: 'replay', usage: { promptTokens: null, completionTokens: null } }
    : await getLlmTransport().complete(payload);

  const parsed = parseGeneratedPlan(
    JSON.parse(raw.content),
    budgets.map((slot) => slot.slotKey),
  );

  const outcome = {
    ...reconcile({
      plan: parsed,
      days: [...DAYS_OF_WEEK],
      budgets,
      catalog,
      sides,
      allergens,
    }),
    model: raw.model,
    usage: raw.usage,
    durationMs: Date.now() - startedAt,
  };

  const board = boardFrom(profile, kcalTarget, proteinTarget, outcome.meals, catalog, sides);

  return { board, outcome, targets, budgets, catalog, sides, kcalTarget, proteinTarget, raw };
}

/**
 * What the variety repair changed, meal by meal.
 *
 * The model's answer is on the wire and the client's week is on the board, and
 * between them sits `repairVariety`, which swaps dishes to break up repetition. It
 * reports how many meals it touched and nothing about what that cost — so a week
 * whose protein collapses on Friday looks, from the audit row, like a week the
 * model planned badly.
 *
 * This prints both sides. `→` is a meal the repair rewrote, with what each dish is
 * worth in that slot — both portioned to the same budget by the same chooser — so
 * the cost of a swap is a number rather than an impression.
 */
function varietyDiff(
  raw: { content: string },
  board: Board,
  catalog: readonly CatalogDish[],
): string[] {
  const bySlug = new Map(catalog.map((dish) => [dish.slug, dish]));
  const parsed = JSON.parse(raw.content) as {
    days: (Record<string, { dish?: string }> & { dayOfWeek: number })[];
  };
  const chose = new Map<string, string>();

  for (const day of parsed.days) {
    for (const [slotKey, value] of Object.entries(day)) {
      if (slotKey === 'dayOfWeek' || typeof value !== 'object' || !value?.dish) continue;
      chose.set(`${day.dayOfWeek}:${slotKey}`, value.dish);
    }
  }

  /**
   * What the model's dish would have carried, at the portion `reconcile` would
   * have given it.
   *
   * Portioned through `chooseServings` against the same slot budget rather than
   * multiplied by the replacement's stored multiplier, because the two dishes are
   * not portioned alike: a 0.75x fattoush and a 0.75x kofta plate are different
   * amounts of food, and comparing one dish at the other's multiplier would make
   * the swap look better or worse than it was.
   */
  const proteinOf = (slug: string | undefined, budgetKcal: number) => {
    const dish = slug ? bySlug.get(slug) : undefined;
    if (!dish) return null;

    const servings =
      chooseServings(dish.recipe, budgetKcal, { wholeOnly: isFixedPortion(dish.source) }) ?? 1;

    return Math.round(
      dish.recipe.reduce(
        (sum, line) => sum + (line.food.protein * portionLine(line, servings).quantityGrams) / 100,
        0,
      ),
    );
  };

  const out: string[] = [];
  let swapped = 0;
  let proteinLost = 0;

  for (const day of board.days) {
    for (const meal of day.meals) {
      const wanted = chose.get(`${day.dayOfWeek}:${meal.slotKey}`);
      const got = meal.dish?.slug;
      if (!wanted || wanted === got) continue;

      swapped += 1;
      const before = proteinOf(wanted, meal.budgetKcal) ?? 0;
      // The main only: a side's protein is not what the repair traded away.
      const after = proteinOf(got, meal.budgetKcal) ?? 0;
      proteinLost += before - after;

      out.push(
        `- day ${day.dayOfWeek} ${meal.slotKey}: ${wanted} (P~${before} g) → ${got} (P ${after} g)`,
      );
    }
  }

  return [
    `${swapped} of ${board.days.reduce((n, d) => n + d.meals.length, 0)} meals were rewritten by the variety repair;` +
      ` net protein change ${proteinLost > 0 ? '−' : '+'}${Math.abs(proteinLost)} g across the week.`,
    ...out,
  ];
}

/** The report for one profile: the client, the week, and every check that ran. */
function report(profile: Profile, run: Awaited<ReturnType<typeof planFor>>): string {
  const { board, outcome, targets, budgets, catalog, sides, kcalTarget, proteinTarget, raw } = run;
  const caveats = plannerCaveats(profile.clinicalTags ?? [], profile.dietPattern ?? null);

  const out: string[] = [
    `# ${profile.titleEn} — ${profile.titleAr}`,
    '',
    '## Client',
    `- ${profile.age} y, ${profile.sex}, ${profile.heightCm} cm, ${profile.weightKg} kg, ${profile.activityLevel}, goal ${profile.goal}`,
    `- BMI ${targets.bmi?.toFixed(1)} (${targets.bmiCategory}) · BMR ${Math.round(targets.bmr ?? 0)} · TDEE ${Math.round(targets.tdee ?? 0)}`,
    `- Target ${kcalTarget} kcal · protein ${proteinTarget} g` +
      (targets.lifeStageKcal ? ` (includes +${targets.lifeStageKcal} life stage)` : ''),
    `- Clinical: ${(profile.clinicalTags ?? []).join(', ') || '—'} · pattern: ${profile.dietPattern ?? '—'}`,
    `- Allergens filtered: ${(profile.allergens ?? []).join(', ') || '—'}`,
    `- Dislikes: ${profile.dislikes ?? '—'}`,
    `- Standing: ${profile.permanentInstructions ?? '—'}`,
    `- Week instruction: ${profile.instruction ?? '—'}`,
    `- Caveats raised: ${caveats.join(', ') || '—'}`,
    '',
    '## Budgets',
    ...budgets.map((slot) => `- ${slot.slotKey} (${slot.timeOfDay}): ${slot.kcal} kcal`),
    '',
    '## Generation',
    `- model ${outcome.model} · ${Math.round(outcome.durationMs / 1000)}s · ${outcome.usage.promptTokens} in / ${outcome.usage.completionTokens} out`,
    `- catalog offered: ${catalog.length} mains, ${sides.length} sides`,
    `- unfilled slots: ${outcome.unfilled} · variety repaired: ${outcome.variety.repaired}, unresolved: ${outcome.variety.unresolved}`,
    `- warnings: ${outcome.warnings.length ? outcome.warnings.map((w) => `${w.kind}@${w.dayOfWeek}/${w.slotKey}`).join(', ') : '—'}`,
    '',
    '## Model note to the dietitian (summaryAr)',
    outcome.summaryAr ?? '—',
    '',
    '## Arithmetic findings',
    ...(arithmeticFindings(board).map((line) => `- ${line}`) || []),
    '',
    '## What the variety repair changed',
    ...varietyDiff(raw, board, catalog),
    '',
    '## Per-day totals',
    ...board.days.map(
      (day) =>
        `- day ${day.dayOfWeek}: ${Math.round(day.totals.kcal.value)} kcal · P ${Math.round(day.totals.protein.value)} g · C ${Math.round(day.totals.carbs.value)} g · F ${Math.round(day.totals.fat.value)} g` +
        ` · fibre ${Math.round(day.totals.fiber?.value ?? 0)} g`,
    ),
    '',
    '## Dishes chosen, with catalog metadata',
    ...board.days.flatMap((day) =>
      day.meals.map((meal) => {
        const dish = meal.dish;
        if (!dish) return `- day ${day.dayOfWeek} ${meal.slotKey}: — EMPTY —`;
        return (
          `- day ${day.dayOfWeek} ${meal.slotKey}: ${dish.nameAr} (${dish.slug}) ×${dish.servings}` +
          ` · ${Math.round(meal.totals.kcal.value)}/${meal.budgetKcal} kcal · P ${Math.round(meal.totals.protein.value)} g` +
          ` · ${dish.source}/${dish.effort}/${dish.cost}/${dish.occasion}` +
          (meal.sides.length ? ` · + ${meal.sides.map((s) => s.nameAr).join(' + ')}` : '')
        );
      }),
    ),
    '',
    '---',
    '',
    renderPlanForReview(board),
  ];

  return out.join('\n');
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
  const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1]! : '.plan-lab';
  const concurrency = Number(args[args.indexOf('--concurrency') + 1]) || 3;
  const fromDisk = args.includes('--replay');

  const chosen = only ? PROFILES.filter((p) => p.key === only) : PROFILES;
  if (!chosen.length) {
    console.error(`No profile "${only}". Known: ${PROFILES.map((p) => p.key).join(', ')}`);
    process.exit(1);
  }

  await mkdir(outDir, { recursive: true });
  console.info(
    fromDisk
      ? `replaying ${chosen.length} saved response(s) from ${outDir}/ — no API calls\n`
      : `planning ${chosen.length} week(s) with ${process.env.OPENAI_MODEL} → ${outDir}/\n`,
  );

  const queue = [...chosen];
  const failures: string[] = [];

  async function worker() {
    for (;;) {
      const profile = queue.shift();
      if (!profile) return;

      const started = Date.now();
      try {
        // A replay reconciles the answer already on disk, so iterating on
        // portioning or variety costs nothing and compares like with like.
        const replay = fromDisk
          ? await readFile(join(outDir, `${profile.key}.response.json`), 'utf8').catch(() => null)
          : null;

        if (fromDisk && !replay) {
          console.error(`${profile.key.padEnd(26)} SKIPPED: no saved response to replay`);
          continue;
        }

        const run = await planFor(profile, { replay: replay ?? undefined });

        if (!fromDisk) {
          await writeFile(join(outDir, `${profile.key}.response.json`), run.raw.content, 'utf8');
        }
        await writeFile(join(outDir, `${profile.key}.md`), report(profile, run), 'utf8');

        const perDay = Math.round(run.board.totals.kcal.value / 7);
        const drift = Math.round(((perDay - run.kcalTarget) / run.kcalTarget) * 100);
        const findings = arithmeticFindings(run.board).length;

        console.info(
          `${profile.key.padEnd(26)} ${String(perDay).padStart(5)} kcal/day (${drift > 0 ? '+' : ''}${drift}%) ` +
            `· ${String(findings).padStart(2)} finding(s) · ${run.outcome.unfilled} unfilled · ` +
            `${Math.round((Date.now() - started) / 1000)}s`,
        );
      } catch (error) {
        failures.push(profile.key);
        console.error(`${profile.key.padEnd(26)} FAILED: ${(error as Error).message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, chosen.length) }, worker));

  console.info(`\nwrote ${chosen.length - failures.length} week(s) to ${outDir}/`);
  if (failures.length) console.info(`failed: ${failures.join(', ')}`);
}
