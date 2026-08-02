# Weekly Plan Editor — Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the dietitian two ways to start a week that do not call the model — copy a previous plan, or start an empty one — and let a week be generated against calorie, protein and goal figures that apply to that week only.

**Architecture:** All three doors into a plan build the same skeleton from the client's *current* nutrition profile (`planSkeleton`, a pure function), then differ only in what fills it. One new mutation, `createPlanFromSkeleton`, persists it. Per-week figures are nullable snapshot columns on `weekly_plans` that prompt assembly falls back through.

**Tech Stack:** Next.js App Router + server actions, Drizzle ORM on PostgreSQL, Zod, next-intl, Bun test.

**Covers spec stages 1–3 of** [`docs/superpowers/specs/2026-08-02-weekly-plan-editor-design.md`](../specs/2026-08-02-weekly-plan-editor-design.md). Stages 4–6 (drag-and-drop editor, published-plan editing, compare view) are a second plan.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/features/weekly-plans/nutrition.ts` | *Modify* — `DishDetail` gains `isActive`. |
| `src/features/weekly-plans/queries.ts` | *Modify* — `loadDishesByIds`, `planDishesBySlot`; `assembleBoard` stops filtering retired dishes. |
| `src/features/weekly-plans/skeleton.ts` | *Create* — `planSkeleton`, pure. The one place a week's slots are laid out. |
| `src/features/weekly-plans/skeleton.test.ts` | *Create* — its tests. |
| `src/features/weekly-plans/editor-mutations.ts` | *Create* — `createPlanFromSkeleton`. |
| `src/features/weekly-plans/editor-mutations.test.ts` | *Create* — integration tests. |
| `src/features/weekly-plans/editor-actions.ts` | *Create* — `startEmptyWeekAction`, `startWeekFromPlanAction`. |
| `src/features/weekly-plans/schema.ts` | *Modify* — input schemas for the two actions and the generate overrides. |
| `src/features/weekly-plans/form-state.ts` | *Modify* — `NewWeekState`. |
| `src/features/weekly-plans/prompt.ts` | *Modify* — read the per-week overrides. |
| `src/features/weekly-plans/actions.ts` | *Modify* — `generateWeekAction` accepts and stores the overrides. |
| `src/features/weekly-plans/components/new-week-menu.tsx` | *Create* — the three doors. |
| `src/features/weekly-plans/components/plan-history.tsx` | *Create* — the Past tab body. |
| `src/features/weekly-plans/components/rail-tabs.tsx` | *Create* — the rail's tab bar. |
| `src/features/weekly-plans/components/plan-board.tsx` | *Modify* — hosts the tabs. |
| `src/app/[locale]/app/weekly-plans/[clientId]/page.tsx` | *Modify* — composes the above. |
| `src/db/schema/weekly-plans.ts` | *Modify* — two nullable columns. |
| `src/i18n/messages/{ar,en}.json` | *Modify* — new strings. |

---

### Task 1: A retired dish still renders on the plans that use it

`dishes.is_active` exists so a dish can stop being offered while the plans holding it keep working (`src/db/schema/dishes.ts:74`). `assembleBoard` breaks that promise: it looks dishes up through `loadCatalog()`, which filters `is_active = true` (`queries.ts:96`), so a deactivated dish renders as an empty slot and inflates the unfilled count that gates publishing.

**Files:**
- Modify: `src/features/weekly-plans/nutrition.ts:212-222`
- Modify: `src/features/weekly-plans/queries.ts`
- Test: `src/features/weekly-plans/queries.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/features/weekly-plans/queries.test.ts`, and add the imports it needs at the top of the file (`dishes`, `dishIngredients`, `foods`, `weeklyPlanMeals`, `eq` from `drizzle-orm`, and `getBoard` from `./queries`):

```ts
describe('getBoard', () => {
  test('renders a dish that has since been retired, and does not count it unfilled', async () => {
    const [food] = await db
      .insert(foods)
      .values({ fdcId: 999101, description: 'Staple', category: 'Test', kcal: 300, protein: 12, fat: 5, carbs: 50 })
      .returning({ id: foods.id });

    const [dish] = await db
      .insert(dishes)
      .values({
        slug: 'retired-lunch',
        nameAr: 'طبق متقاعد',
        nameEn: 'Retired dish',
        mealTypes: ['lunch'],
        tags: [],
        allergenTags: [],
        baseServingLabel: 'حصة',
      })
      .returning({ id: dishes.id });

    await db
      .insert(dishIngredients)
      .values({ dishId: dish!.id, foodId: food!.id, quantityGrams: 200, sortOrder: 0 });

    const [plan] = await db
      .insert(weeklyPlans)
      .values({ clinicId, clientId, weekStartDate: '2026-08-02', status: 'draft', kcalTargetSnapshot: 1800 })
      .returning({ id: weeklyPlans.id });

    await db.insert(weeklyPlanMeals).values({
      planId: plan!.id,
      dayOfWeek: 0,
      slotKey: 'lunch',
      label: 'غداء',
      timeOfDay: '14:00',
      budgetKcal: 600,
      sortOrder: 0,
      dishId: dish!.id,
      servings: 1,
    });

    await db.update(dishes).set({ isActive: false }).where(eq(dishes.id, dish!.id));

    const board = await getBoard(clinicId, plan!.id);

    expect(board?.unfilled).toBe(0);
    expect(board?.days[0]?.meals[0]?.dish?.slug).toBe('retired-lunch');
    expect(board?.days[0]?.meals[0]?.dish?.isActive).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
bun test src/features/weekly-plans/queries.test.ts
```

Expected: FAIL. `board?.unfilled` is `1` and the dish is `null`, because `assembleBoard` could not find the retired dish. A type error on `.isActive` is also expected — `DishDetail` has no such field yet.

- [ ] **Step 3: Add `isActive` to `DishDetail`**

In `src/features/weekly-plans/nutrition.ts`, add the field to the type (after `baseServingLabel`):

```ts
export type DishDetail = {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  mealTypes: string[];
  tags: string[];
  allergenTags: string[];
  baseServingLabel: string;
  /** False for a retired dish. It stays readable on the plans that already use it. */
  isActive: boolean;
  ingredients: DishIngredientDetail[];
};
```

- [ ] **Step 4: Select `isActive` in the catalog reader**

In `src/features/weekly-plans/queries.ts`, inside `loadCatalog`, add `isActive: dishes.isActive,` to the `.select({...})` object for `dishRows`, immediately after `baseServingLabel`.

- [ ] **Step 5: Add the id-based reader**

In `src/features/weekly-plans/queries.ts`, directly below `loadCatalog`, add:

```ts
/**
 * Dishes by id, regardless of `is_active`.
 *
 * The board must render a plan as it was written. `loadCatalog` filters retired
 * dishes because nothing new should be built from them, but a plan that already
 * holds one would otherwise show a blank card and count it toward the unfilled
 * total that gates publishing — punishing the dietitian for a catalog change they
 * did not make.
 */
export async function loadDishesByIds(ids: readonly string[]): Promise<DishDetail[]> {
  if (!ids.length) return [];

  const dishRows = await db
    .select({
      id: dishes.id,
      slug: dishes.slug,
      nameAr: dishes.nameAr,
      nameEn: dishes.nameEn,
      mealTypes: dishes.mealTypes,
      tags: dishes.tags,
      allergenTags: dishes.allergenTags,
      baseServingLabel: dishes.baseServingLabel,
      isActive: dishes.isActive,
    })
    .from(dishes)
    .where(inArray(dishes.id, [...ids]))
    .orderBy(asc(dishes.slug));

  if (!dishRows.length) return [];

  const ingredientRows = await db
    .select({
      dishId: dishIngredients.dishId,
      quantityGrams: dishIngredients.quantityGrams,
      food: foodColumns,
    })
    .from(dishIngredients)
    .innerJoin(foods, eq(foods.id, dishIngredients.foodId))
    .where(
      inArray(
        dishIngredients.dishId,
        dishRows.map((dish) => dish.id),
      ),
    )
    .orderBy(asc(dishIngredients.sortOrder));

  const byDish = new Map<string, DishDetail['ingredients']>();
  for (const { dishId, ...ingredient } of ingredientRows) {
    const bucket = byDish.get(dishId);
    if (bucket) bucket.push(ingredient);
    else byDish.set(dishId, [ingredient]);
  }

  return dishRows.map((dish) => ({ ...dish, ingredients: byDish.get(dish.id) ?? [] }));
}
```

- [ ] **Step 6: Use it in `assembleBoard`**

In `src/features/weekly-plans/queries.ts`, inside `assembleBoard`, replace the catalog load. Find:

```ts
  // The full catalog, unfiltered: a plan may reference a dish the client has since
  // become allergic to, and hiding it would leave a blank card with no explanation.
  const catalog = await loadCatalog();
  const dishById = new Map(catalog.map((dish) => [dish.id, dish]));
```

Replace with:

```ts
  // Only the dishes this plan references, and by id rather than through the
  // catalog: a plan may hold a dish the client has since become allergic to, or one
  // that has since been retired, and either way the card must show what is actually
  // planned rather than a blank the dietitian cannot explain.
  const referenced = new Set<string>();
  for (const meal of mealRows) if (meal.dishId) referenced.add(meal.dishId);
  for (const option of optionRows) referenced.add(option.dishId);

  const dishById = new Map((await loadDishesByIds([...referenced])).map((dish) => [dish.id, dish]));
```

- [ ] **Step 7: Run the test and verify it passes**

```bash
bun test src/features/weekly-plans/queries.test.ts
```

Expected: PASS, both tests.

- [ ] **Step 8: Run the whole suite and the checks**

```bash
bun run typecheck
```

Expected: no errors. If `listDishes` or a component fails to compile, it is because `DishDetail` now requires `isActive` — the object literal in `listDishes` spreads a `loadCatalog` row, so it should already carry it.

```bash
bun test
bun run lint
```

- [ ] **Step 9: Commit**

```bash
git add src/features/weekly-plans/nutrition.ts src/features/weekly-plans/queries.ts src/features/weekly-plans/queries.test.ts
git commit -m "fix: keep a retired dish visible on the plans that already use it"
```

---

### Task 2: `planSkeleton` — one place that lays out a week

Every door into a plan needs the same thing: seven days of slots taken from the client's current schedule, budgeted against their current calorie target. Generation builds this today inside `generate.ts`; the copy and empty doors need it without a model. Pure and separate so all three cannot drift.

**Files:**
- Create: `src/features/weekly-plans/skeleton.ts`
- Test: `src/features/weekly-plans/skeleton.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/weekly-plans/skeleton.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';

import { planSkeleton, slotFillKey } from './skeleton';
import type { MealScheduleInput } from './schema';

const schedule: MealScheduleInput = [
  { slotKey: 'breakfast', label: 'فطور', timeOfDay: '07:30', kcalShare: 0.3 },
  { slotKey: 'lunch', label: 'غداء', timeOfDay: '14:00', kcalShare: 0.7 },
];

describe('planSkeleton', () => {
  test('lays out every slot on every day of the week', () => {
    const meals = planSkeleton({ schedule, dailyKcal: 1000 });

    expect(meals).toHaveLength(14);
    expect(new Set(meals.map((meal) => meal.dayOfWeek))).toEqual(new Set([0, 1, 2, 3, 4, 5, 6]));
  });

  test('budgets each slot by its share of the day', () => {
    const [breakfast, lunch] = planSkeleton({ schedule, dailyKcal: 1000 });

    expect(breakfast?.budgetKcal).toBe(300);
    expect(lunch?.budgetKcal).toBe(700);
  });

  test('orders slots within a day by their position in the schedule', () => {
    const sunday = planSkeleton({ schedule, dailyKcal: 1000 }).filter((meal) => meal.dayOfWeek === 0);

    expect(sunday.map((meal) => meal.slotKey)).toEqual(['breakfast', 'lunch']);
    expect(sunday.map((meal) => meal.sortOrder)).toEqual([0, 1]);
  });

  test('leaves every slot empty when nothing fills it', () => {
    const meals = planSkeleton({ schedule, dailyKcal: 1000 });

    expect(meals.every((meal) => meal.dishId === null)).toBe(true);
    expect(meals.every((meal) => meal.servings === 1)).toBe(true);
  });

  test('fills the slots it has a dish for and leaves the rest empty', () => {
    const meals = planSkeleton({
      schedule,
      dailyKcal: 1000,
      fill: new Map([[slotFillKey(2, 'lunch'), { dishId: 'dish-1', servings: 1.5 }]]),
    });

    const filled = meals.filter((meal) => meal.dishId !== null);

    expect(filled).toHaveLength(1);
    expect(filled[0]).toMatchObject({ dayOfWeek: 2, slotKey: 'lunch', dishId: 'dish-1', servings: 1.5 });
  });

  test('ignores a fill entry whose slot is no longer in the schedule', () => {
    const meals = planSkeleton({
      schedule,
      dailyKcal: 1000,
      fill: new Map([[slotFillKey(0, 'snack_1'), { dishId: 'dish-9', servings: 1 }]]),
    });

    expect(meals).toHaveLength(14);
    expect(meals.every((meal) => meal.dishId === null)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
bun test src/features/weekly-plans/skeleton.test.ts
```

Expected: FAIL — `Cannot find module './skeleton'`.

- [ ] **Step 3: Write the implementation**

Create `src/features/weekly-plans/skeleton.ts`:

```ts
import { DAYS_OF_WEEK, type MealScheduleInput } from './schema';
import { slotBudgets } from './targets';

/**
 * Laying out the week a plan is written into.
 *
 * Pure, and the single source of a plan's shape. Three doors lead into a plan —
 * generation, a copy of an earlier week, and an empty week — and all three must
 * produce the same slots for the same client, or "start from last week" would
 * quietly mean something different from "generate".
 *
 * The skeleton always comes from the client's CURRENT schedule and target, never
 * from the plan being copied. Removing the afternoon snack from a profile and then
 * copying July's plan gives four meals a day, not five and seven deletions.
 */

/** One meal row, before it has an id. Matches `weekly_plan_meals`. */
export type SkeletonMeal = {
  dayOfWeek: number;
  slotKey: string;
  label: string;
  timeOfDay: string;
  budgetKcal: number;
  sortOrder: number;
  dishId: string | null;
  servings: number;
};

/** What may be dropped into a slot. */
export type SlotFill = { dishId: string; servings: number };

/**
 * The key a fill map is addressed by.
 *
 * A function rather than a bare template literal at each call site, so the two
 * sides of the map can never disagree about the separator.
 */
export function slotFillKey(dayOfWeek: number, slotKey: string): string {
  return `${dayOfWeek}:${slotKey}`;
}

/**
 * Seven days of slots, optionally filled.
 *
 * `fill` is consulted, never trusted: a key naming a slot the schedule no longer
 * has is ignored rather than added back. That is what makes a copy follow the
 * client's current schedule instead of resurrecting the old one.
 */
export function planSkeleton(input: {
  schedule: MealScheduleInput;
  dailyKcal: number;
  fill?: ReadonlyMap<string, SlotFill>;
}): SkeletonMeal[] {
  const budgets = slotBudgets(input.dailyKcal, input.schedule);

  return DAYS_OF_WEEK.flatMap((dayOfWeek) =>
    budgets.map((slot, index) => {
      const filled = input.fill?.get(slotFillKey(dayOfWeek, slot.slotKey));

      return {
        dayOfWeek,
        slotKey: slot.slotKey,
        label: slot.label,
        timeOfDay: slot.timeOfDay,
        budgetKcal: slot.kcal,
        // Position in the schedule, not time of day: the schedule is the order the
        // dietitian arranged, and two slots may share a time.
        sortOrder: index,
        dishId: filled?.dishId ?? null,
        servings: filled?.servings ?? 1,
      };
    }),
  );
}
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
bun test src/features/weekly-plans/skeleton.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/weekly-plans/skeleton.ts src/features/weekly-plans/skeleton.test.ts
git commit -m "feat: lay out a plan's week in one pure place"
```

---

### Task 3: Read an earlier plan's dishes, keyed by slot

The copy door needs the source plan's dishes addressed the way `planSkeleton` fills them.

**Files:**
- Modify: `src/features/weekly-plans/queries.ts`
- Test: `src/features/weekly-plans/queries.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/features/weekly-plans/queries.test.ts` (add `planDishesBySlot` to the `./queries` import and `slotFillKey` from `./skeleton`):

```ts
describe('planDishesBySlot', () => {
  test('keys a plan\'s filled slots, skipping the empty ones', async () => {
    const [dish] = await db
      .insert(dishes)
      .values({
        slug: 'copy-source',
        nameAr: 'مصدر',
        nameEn: 'Source',
        mealTypes: ['lunch'],
        tags: [],
        allergenTags: [],
        baseServingLabel: 'حصة',
      })
      .returning({ id: dishes.id });

    const [plan] = await db
      .insert(weeklyPlans)
      .values({ clinicId, clientId, weekStartDate: '2026-07-26', status: 'published', kcalTargetSnapshot: 1800 })
      .returning({ id: weeklyPlans.id });

    await db.insert(weeklyPlanMeals).values([
      {
        planId: plan!.id,
        dayOfWeek: 1,
        slotKey: 'lunch',
        label: 'غداء',
        timeOfDay: '14:00',
        budgetKcal: 600,
        sortOrder: 0,
        dishId: dish!.id,
        servings: 1.25,
      },
      {
        planId: plan!.id,
        dayOfWeek: 1,
        slotKey: 'dinner',
        label: 'عشاء',
        timeOfDay: '20:00',
        budgetKcal: 400,
        sortOrder: 1,
        dishId: null,
        servings: 1,
      },
    ]);

    const fill = await planDishesBySlot(clinicId, plan!.id);

    expect(fill.size).toBe(1);
    expect(fill.get(slotFillKey(1, 'lunch'))).toEqual({ dishId: dish!.id, servings: 1.25 });
  });

  test('returns nothing for a plan belonging to another clinic', async () => {
    const otherClinicId = await createTestClinic('Other Clinic');
    const otherClientId = await createTestClient(otherClinicId, 'Other Client');

    const [plan] = await db
      .insert(weeklyPlans)
      .values({
        clinicId: otherClinicId,
        clientId: otherClientId,
        weekStartDate: '2026-07-26',
        status: 'draft',
        kcalTargetSnapshot: 1800,
      })
      .returning({ id: weeklyPlans.id });

    expect((await planDishesBySlot(clinicId, plan!.id)).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
bun test src/features/weekly-plans/queries.test.ts
```

Expected: FAIL — `planDishesBySlot is not a function`.

- [ ] **Step 3: Write the implementation**

In `src/features/weekly-plans/queries.ts`, below `listPlans`, add (and import `slotFillKey` and `type SlotFill` from `./skeleton`):

```ts
/**
 * One plan's dishes, keyed the way `planSkeleton` fills slots.
 *
 * Clinic-scoped in the same query rather than after it: the plan id arrives from a
 * form, and a copy that read another clinic's plan would leak its menu one dish at
 * a time. An unfilled slot contributes no entry — copying a gap forward as a gap is
 * what leaving it out already achieves.
 */
export async function planDishesBySlot(
  clinicId: string,
  planId: string,
): Promise<Map<string, SlotFill>> {
  const parsed = planIdSchema.safeParse(planId);
  if (!parsed.success) return new Map();

  const rows = await db
    .select({
      dayOfWeek: weeklyPlanMeals.dayOfWeek,
      slotKey: weeklyPlanMeals.slotKey,
      dishId: weeklyPlanMeals.dishId,
      servings: weeklyPlanMeals.servings,
    })
    .from(weeklyPlanMeals)
    .innerJoin(weeklyPlans, eq(weeklyPlans.id, weeklyPlanMeals.planId))
    .where(and(eq(weeklyPlans.id, parsed.data), eq(weeklyPlans.clinicId, clinicId)));

  const fill = new Map<string, SlotFill>();

  for (const row of rows) {
    if (!row.dishId) continue;
    fill.set(slotFillKey(row.dayOfWeek, row.slotKey), {
      dishId: row.dishId,
      servings: row.servings,
    });
  }

  return fill;
}
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
bun test src/features/weekly-plans/queries.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/weekly-plans/queries.ts src/features/weekly-plans/queries.test.ts
git commit -m "feat: read an earlier plan's dishes keyed by slot"
```

---

### Task 4: Persist a plan built from a skeleton

**Files:**
- Create: `src/features/weekly-plans/editor-mutations.ts`
- Test: `src/features/weekly-plans/editor-mutations.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/weekly-plans/editor-mutations.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { weeklyPlanMeals, weeklyPlans } from '@/db/schema';
import { createTestClient, createTestClinic, resetDatabase } from '../../../tests/helpers';

import { createPlanFromSkeleton } from './editor-mutations';
import { planSkeleton } from './skeleton';
import type { MealScheduleInput } from './schema';

let clinicId: string;
let clientId: string;

const schedule: MealScheduleInput = [
  { slotKey: 'breakfast', label: 'فطور', timeOfDay: '07:30', kcalShare: 0.3 },
  { slotKey: 'lunch', label: 'غداء', timeOfDay: '14:00', kcalShare: 0.7 },
];

beforeEach(async () => {
  await resetDatabase();
  clinicId = await createTestClinic();
  clientId = await createTestClient(clinicId, 'Test Client');
});

function skeleton() {
  return planSkeleton({ schedule, dailyKcal: 1000 });
}

describe('createPlanFromSkeleton', () => {
  test('writes a draft plan and one meal per slot per day', async () => {
    const planId = await createPlanFromSkeleton({
      clinicId,
      clientId,
      weekStartDate: '2026-08-02',
      kcalTarget: 1000,
      meals: skeleton(),
    });

    expect(planId).not.toBeNull();

    const [plan] = await db.select().from(weeklyPlans).where(eq(weeklyPlans.id, planId!));
    expect(plan?.status).toBe('draft');
    expect(plan?.generatedBy).toBe('manual');
    expect(plan?.model).toBeNull();
    expect(plan?.kcalTargetSnapshot).toBe(1000);

    const meals = await db.select().from(weeklyPlanMeals).where(eq(weeklyPlanMeals.planId, planId!));
    expect(meals).toHaveLength(14);
  });

  test('refuses a client belonging to another clinic', async () => {
    const otherClinicId = await createTestClinic('Other Clinic');
    const otherClientId = await createTestClient(otherClinicId, 'Other Client');

    const planId = await createPlanFromSkeleton({
      clinicId,
      clientId: otherClientId,
      weekStartDate: '2026-08-02',
      kcalTarget: 1000,
      meals: skeleton(),
    });

    expect(planId).toBeNull();
    expect(await db.select().from(weeklyPlans)).toHaveLength(0);
  });

  test('replaces an existing draft for the same week', async () => {
    const first = await createPlanFromSkeleton({
      clinicId,
      clientId,
      weekStartDate: '2026-08-02',
      kcalTarget: 1000,
      meals: skeleton(),
    });

    const second = await createPlanFromSkeleton({
      clinicId,
      clientId,
      weekStartDate: '2026-08-02',
      kcalTarget: 1200,
      meals: skeleton(),
    });

    expect(second).not.toBe(first);

    const plans = await db.select().from(weeklyPlans).where(eq(weeklyPlans.clientId, clientId));
    expect(plans).toHaveLength(1);
    expect(plans[0]?.kcalTargetSnapshot).toBe(1200);
  });

  test('leaves a published plan for the same week alone', async () => {
    await db.insert(weeklyPlans).values({
      clinicId,
      clientId,
      weekStartDate: '2026-08-02',
      status: 'published',
      kcalTargetSnapshot: 1800,
    });

    await createPlanFromSkeleton({
      clinicId,
      clientId,
      weekStartDate: '2026-08-02',
      kcalTarget: 1000,
      meals: skeleton(),
    });

    const published = await db
      .select()
      .from(weeklyPlans)
      .where(and(eq(weeklyPlans.clientId, clientId), eq(weeklyPlans.status, 'published')));

    expect(published).toHaveLength(1);
    expect(published[0]?.kcalTargetSnapshot).toBe(1800);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
bun test src/features/weekly-plans/editor-mutations.test.ts
```

Expected: FAIL — `Cannot find module './editor-mutations'`.

- [ ] **Step 3: Write the implementation**

Create `src/features/weekly-plans/editor-mutations.ts`:

```ts
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { clients, weeklyPlanMeals, weeklyPlans } from '@/db/schema';

import type { SkeletonMeal } from './skeleton';

/**
 * Writes for the manual side of weekly plans — the plans nobody generated.
 *
 * Same rules as `mutations.ts`: `clinicId` first, every id resolved back to a row
 * inside that clinic before anything is written, and `null`/`false` rather than a
 * throw when the scope check fails, so a forged id is indistinguishable from a
 * stale one.
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
 * an audit trail that implied otherwise would be worse than none.
 */
export async function createPlanFromSkeleton(input: {
  clinicId: string;
  clientId: string;
  weekStartDate: string;
  kcalTarget: number;
  meals: readonly SkeletonMeal[];
}): Promise<string | null> {
  if (!(await ownedClient(input.clinicId, input.clientId))) return null;
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
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
bun test src/features/weekly-plans/editor-mutations.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/weekly-plans/editor-mutations.ts src/features/weekly-plans/editor-mutations.test.ts
git commit -m "feat: persist a plan built by hand rather than generated"
```

---

### Task 5: The two actions behind the new doors

**Files:**
- Modify: `src/features/weekly-plans/schema.ts`
- Modify: `src/features/weekly-plans/form-state.ts`
- Create: `src/features/weekly-plans/editor-actions.ts`

- [ ] **Step 1: Add the input schemas**

In `src/features/weekly-plans/schema.ts`, below `swapMealSchema`, add:

```ts
export const startEmptyWeekSchema = z.object({
  clientId: clientIdSchema,
  weekStartDate: weekStartDateSchema,
});

export const startWeekFromPlanSchema = z.object({
  clientId: clientIdSchema,
  weekStartDate: weekStartDateSchema,
  sourcePlanId: planIdSchema,
});
```

- [ ] **Step 2: Add the action state**

In `src/features/weekly-plans/form-state.ts`, below `initialPlanActionState`, add:

```ts
/**
 * Starting a week without generating one.
 *
 * `profileIncomplete` is the same refusal the generate button gives: all three
 * doors build their slots from the client's schedule and target, so none of them
 * can run without a profile.
 */
export type NewWeekState =
  | { status: 'idle' }
  | { status: 'error'; messageKey: 'errors.invalid' | 'errors.profileIncomplete' | 'errors.planNotFound' | 'errors.unexpected' };

export const initialNewWeekState: NewWeekState = { status: 'idle' };
```

- [ ] **Step 3: Write the actions**

Create `src/features/weekly-plans/editor-actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { localeSchema } from '@/features/clients/schema';
import { type Locale } from '@/i18n/routing';
import { requireStaffClinic } from '@/lib/session';

import { createPlanFromSkeleton } from './editor-mutations';
import type { NewWeekState } from './form-state';
import { getClientContext, planDishesBySlot } from './queries';
import { startEmptyWeekSchema, startWeekFromPlanSchema } from './schema';
import { planSkeleton, type SlotFill } from './skeleton';

/**
 * The doors into a plan that do not call a model.
 *
 * Both actions do the same three things — resolve the client's current schedule
 * and target, lay out the week, write it — and differ only in whether an earlier
 * plan's dishes are dropped into the slots. That shared middle is `startWeek`.
 *
 * Split from `actions.ts` because that file is already the generation pipeline and
 * has no business growing a second one.
 */

function readLocale(formData: FormData): Locale {
  return localeSchema.parse(formData.get('locale'));
}

/**
 * Lays out and writes a week.
 *
 * The skeleton always comes from the client's profile as it stands now, never from
 * the plan being copied — see the design note in `skeleton.ts`. `fill` is the only
 * difference between the two doors.
 */
async function startWeek(input: {
  clinicId: string;
  clientId: string;
  weekStartDate: string;
  fill?: ReadonlyMap<string, SlotFill>;
}): Promise<{ planId: string } | NewWeekState> {
  const context = await getClientContext(input.clinicId, input.clientId);

  // No profile, or not enough of one to compute a target: the same wall the
  // generate button puts up, for the same reason — a week whose slots have no
  // budgets cannot be checked against anything.
  if (!context?.profile || context.effectiveKcal === null) {
    return { status: 'error', messageKey: 'errors.profileIncomplete' };
  }

  const planId = await createPlanFromSkeleton({
    clinicId: input.clinicId,
    clientId: input.clientId,
    weekStartDate: input.weekStartDate,
    kcalTarget: context.effectiveKcal,
    meals: planSkeleton({
      schedule: context.profile.mealSchedule,
      dailyKcal: context.effectiveKcal,
      fill: input.fill,
    }),
  });

  if (!planId) return { status: 'error', messageKey: 'errors.planNotFound' };

  return { planId };
}

/** Both the board and the client's portal change together, so both are revalidated. */
function revalidateBoard(locale: Locale, clientId: string): void {
  revalidatePath(`/${locale}/app/weekly-plans`);
  revalidatePath(`/${locale}/app/weekly-plans/${clientId}`);
  revalidatePath(`/${locale}/portal/plan`);
}

export async function startEmptyWeekAction(
  _previousState: NewWeekState,
  formData: FormData,
): Promise<NewWeekState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const parsed = startEmptyWeekSchema.safeParse({
    clientId: formData.get('clientId'),
    weekStartDate: formData.get('weekStartDate'),
  });

  if (!parsed.success) return { status: 'error', messageKey: 'errors.invalid' };

  let planId: string;

  try {
    const result = await startWeek({ clinicId, ...parsed.data });
    if ('status' in result) return result;
    planId = result.planId;
  } catch (error) {
    console.error('[weekly-plans] empty week failed', error);
    return { status: 'error', messageKey: 'errors.unexpected' };
  }

  revalidateBoard(locale, parsed.data.clientId);
  // Outside the try: `redirect` works by throwing, and catching it here would turn
  // a successful navigation into an "unexpected error".
  redirect(`/${locale}/app/weekly-plans/${parsed.data.clientId}?planId=${planId}`);
}

export async function startWeekFromPlanAction(
  _previousState: NewWeekState,
  formData: FormData,
): Promise<NewWeekState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const parsed = startWeekFromPlanSchema.safeParse({
    clientId: formData.get('clientId'),
    weekStartDate: formData.get('weekStartDate'),
    sourcePlanId: formData.get('sourcePlanId'),
  });

  if (!parsed.success) return { status: 'error', messageKey: 'errors.invalid' };

  let planId: string;

  try {
    // Clinic-scoped inside the query, so a forged source id yields an empty map
    // rather than another clinic's menu.
    const fill = await planDishesBySlot(clinicId, parsed.data.sourcePlanId);

    const result = await startWeek({
      clinicId,
      clientId: parsed.data.clientId,
      weekStartDate: parsed.data.weekStartDate,
      fill,
    });

    if ('status' in result) return result;
    planId = result.planId;
  } catch (error) {
    console.error('[weekly-plans] copy week failed', error);
    return { status: 'error', messageKey: 'errors.unexpected' };
  }

  revalidateBoard(locale, parsed.data.clientId);
  redirect(`/${locale}/app/weekly-plans/${parsed.data.clientId}?planId=${planId}`);
}
```

- [ ] **Step 4: Verify it compiles**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/weekly-plans/editor-actions.ts src/features/weekly-plans/schema.ts src/features/weekly-plans/form-state.ts
git commit -m "feat: add the copy-a-week and empty-week actions"
```

---

### Task 6: Per-week calorie, protein and goal overrides

`prompt.ts` reads the goal (`:117`) and protein target (`:120`) from the client's profile. A week generated against different figures has to record them, and must not write them back to the profile.

**Files:**
- Modify: `src/db/schema/weekly-plans.ts`
- Modify: `src/features/weekly-plans/schema.ts`
- Modify: `src/features/weekly-plans/queries.ts`
- Modify: `src/features/weekly-plans/actions.ts`
- Modify: `src/features/weekly-plans/mutations.ts`

- [ ] **Step 1: Add the columns**

In `src/db/schema/weekly-plans.ts`, immediately after `kcalTargetSnapshot`, add:

```ts
    /**
     * The protein target and goal this plan was generated against, when they differ
     * from the client's profile.
     *
     * Null means "whatever the profile says". Nullable rather than defaulted from
     * the profile at write time so that a plan generated without touching these
     * fields keeps deferring to the profile, exactly as every plan did before the
     * columns existed.
     *
     * Never written back to `client_nutrition_profiles`. A one-week experiment must
     * not silently become the client's standing target.
     */
    proteinTargetSnapshot: integer('protein_target_snapshot'),

    /** One of `CLIENT_GOALS`. Constrained in Zod, as `clients.goal` is. */
    goalSnapshot: text('goal_snapshot'),
```

- [ ] **Step 2: Generate the migration**

```bash
bun run db:generate
```

Expected: a new file in `drizzle/` adding two nullable columns. Do not hand-edit it or the snapshot in `drizzle/meta/`.

- [ ] **Step 3: Apply it**

```bash
bun run db:migrate
bun run db:migrate:test
```

- [ ] **Step 4: Extend the generation input schema**

In `src/features/weekly-plans/schema.ts`, add the import `import { CLIENT_GOALS } from '@/features/clients/schema';` at the top, then replace `generateWeekSchema` with:

```ts
export const generateWeekSchema = z.object({
  clientId: clientIdSchema,
  weekStartDate: weekStartDateSchema,
  instruction: instructionSchema,
  /**
   * This week's figures, when the dietitian overrode them.
   *
   * The same bounds the nutrition profile uses, because they are the same
   * quantities — a target that would be a typo on the profile is a typo here too.
   * Blank means "use the profile", which is why these are optional rather than
   * defaulted.
   */
  kcalTarget: z.preprocess(blankToUndefined, z.coerce.number().int().min(800).max(6000).optional()),
  proteinTarget: z.preprocess(blankToUndefined, z.coerce.number().int().min(20).max(400).optional()),
  goal: z.preprocess(blankToUndefined, z.enum(CLIENT_GOALS).optional()),
});
```

- [ ] **Step 5: Store them on the plan**

In `src/features/weekly-plans/mutations.ts`, extend `createPlanFromGeneration`'s input type with:

```ts
  proteinTarget: number | null;
  goal: string | null;
```

and add to the `.values({...})` for `weeklyPlans`:

```ts
        proteinTargetSnapshot: input.proteinTarget,
        goalSnapshot: input.goal,
```

- [ ] **Step 6: Read them back on the board**

In `src/features/weekly-plans/queries.ts`, add to the `Board` type:

```ts
  proteinTargetSnapshot: number | null;
  goalSnapshot: string | null;
```

and add `proteinTargetSnapshot: weeklyPlans.proteinTargetSnapshot,` and `goalSnapshot: weeklyPlans.goalSnapshot,` to the `.select({...})` in all three plan readers: `getBoard`, `getPublishedBoard`, and the one inside `getLatestBoard`'s call path (`getBoard` covers it — only `getBoard` and `getPublishedBoard` select plan columns).

- [ ] **Step 7: Make the prompt prefer the plan's figures**

In `src/features/weekly-plans/actions.ts`, find where `generateWeekAction` builds its `PromptInput` from the client context, and apply the overrides. The client block passed to the prompt gets:

```ts
      goal: parsed.data.goal ?? context.goal,
      proteinTargetGrams: parsed.data.proteinTarget ?? context.effectiveProteinGrams,
```

and the calorie target used for `slotBudgets` and `kcalTargetSnapshot` becomes `parsed.data.kcalTarget ?? context.effectiveKcal`.

Pass the overrides through to `createPlanFromGeneration`:

```ts
      proteinTarget: parsed.data.proteinTarget ?? null,
      goal: parsed.data.goal ?? null,
```

- [ ] **Step 8: Verify**

```bash
bun run typecheck
bun test
bun run lint
```

- [ ] **Step 9: Commit**

```bash
git add -A src/db src/features/weekly-plans drizzle
git commit -m "feat: let a week be generated against its own targets"
```

---

### Task 7: The rail gains tabs, and a Past tab

The rail currently shows the client context or the open meal. It needs a third panel, and the tab bar the dish catalog will join in the next plan.

**Files:**
- Create: `src/features/weekly-plans/components/rail-tabs.tsx`
- Create: `src/features/weekly-plans/components/plan-history.tsx`
- Modify: `src/features/weekly-plans/components/plan-board.tsx`
- Modify: `src/i18n/messages/ar.json`, `src/i18n/messages/en.json`

- [ ] **Step 1: Add the strings**

Add to the `weeklyPlans` object in `src/i18n/messages/en.json`:

```json
"tabs": { "client": "Client", "meal": "Meal", "past": "Past" },
"newWeek": "New week",
"newWeekGenerate": "Generate with AI",
"newWeekFrom": "Start from {date}",
"newWeekEmpty": "Empty week",
"newWeekFromHint": "Copies that week's dishes into this client's current meal schedule.",
"newWeekEmptyHint": "One empty slot per meal in the client's schedule.",
"noEarlierPlans": "No earlier plans",
"planMeals": "{count} meals",
"copyIntoWeek": "Copy into {date}",
"weekTargets": "This week's targets",
"kcalTargetLabel": "Daily calories",
"proteinTargetLabel": "Daily protein (g)",
"goalLabel": "Goal for this week",
"targetsHint": "Applies to this plan only. The client's nutrition profile is not changed."
```

and the Arabic equivalents in `src/i18n/messages/ar.json`:

```json
"tabs": { "client": "العميل", "meal": "الوجبة", "past": "السابق" },
"newWeek": "أسبوع جديد",
"newWeekGenerate": "توليد بالذكاء الاصطناعي",
"newWeekFrom": "ابدأ من خطة {date}",
"newWeekEmpty": "أسبوع فارغ",
"newWeekFromHint": "ينسخ أطباق ذلك الأسبوع إلى جدول وجبات العميل الحالي.",
"newWeekEmptyHint": "خانة فارغة لكل وجبة في جدول العميل.",
"noEarlierPlans": "لا توجد خطط سابقة",
"planMeals": "{count} وجبة",
"copyIntoWeek": "انسخ إلى {date}",
"weekTargets": "أهداف هذا الأسبوع",
"kcalTargetLabel": "السعرات اليومية",
"proteinTargetLabel": "البروتين اليومي (غ)",
"goalLabel": "هدف هذا الأسبوع",
"targetsHint": "تنطبق على هذه الخطة فقط. الملف الغذائي للعميل لا يتغير."
```

- [ ] **Step 2: Write the tab bar**

Create `src/features/weekly-plans/components/rail-tabs.tsx`:

```tsx
'use client';

import { cn } from '@/lib/utils';

/**
 * The rail's tab bar.
 *
 * A `tablist` with real roles rather than styled buttons: the rail is the only
 * place the board's secondary content lives, and a screen reader has to be able to
 * tell that switching tabs replaces a panel rather than navigating away.
 *
 * Presentational — the board owns which tab is open, because opening a meal card
 * selects the meal tab from outside this component.
 */
export function RailTabs<T extends string>({
  tabs,
  active,
  onSelect,
  label,
}: {
  tabs: readonly { id: T; label: string }[];
  active: T;
  onSelect: (id: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 pb-3">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`rail-tab-${tab.id}`}
          aria-selected={tab.id === active}
          aria-controls={`rail-panel-${tab.id}`}
          onClick={() => onSelect(tab.id)}
          className={cn(
            'flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
            tab.id === active
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-accent',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Write the Past panel**

Create `src/features/weekly-plans/components/plan-history.tsx`:

```tsx
'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { isMember } from '@/lib/enum';

import { startWeekFromPlanAction } from '../editor-actions';
import { initialNewWeekState } from '../form-state';
import { PLAN_STATUSES } from '../schema';

export type PlanSummary = {
  id: string;
  weekStartDate: string;
  status: string;
  kcalTargetSnapshot: number;
  mealCount: number;
};

/**
 * The client's earlier weeks.
 *
 * Every plan, not only the ones the header pills fit — the pills are for switching
 * between recent weeks, this is the record. Each row carries the target it was
 * built for, because "what were last week's numbers" is one of the two questions
 * that sends a dietitian looking backwards.
 */
export function PlanHistory({
  plans,
  clientId,
  currentPlanId,
  nextWeekStartDate,
  locale,
}: {
  plans: readonly PlanSummary[];
  clientId: string;
  currentPlanId: string | null;
  nextWeekStartDate: string;
  locale: string;
}) {
  const t = useTranslations('weeklyPlans');

  if (!plans.length) {
    return <p className="text-xs text-muted-foreground">{t('noEarlierPlans')}</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {plans.map((plan) => (
        <li
          key={plan.id}
          className="rounded-md border border-border p-2.5 text-xs"
        >
          <div className="flex items-baseline justify-between gap-2">
            <Link
              href={`/app/weekly-plans/${clientId}?planId=${plan.id}`}
              className="font-semibold text-primary underline-offset-2 hover:underline"
            >
              {plan.weekStartDate}
            </Link>

            {isMember(PLAN_STATUSES, plan.status) && (
              <Badge variant={plan.status === 'published' ? 'default' : 'muted'}>
                {t(`status.${plan.status}`)}
              </Badge>
            )}
          </div>

          <p className="mt-1 text-muted-foreground">
            {t('kcalValue', { value: plan.kcalTargetSnapshot })} · {t('planMeals', { count: plan.mealCount })}
          </p>

          {/* No copy button on the plan already open: copying a week into itself is
              not a thing anyone means to do. */}
          {plan.id !== currentPlanId && (
            <CopyForm
              clientId={clientId}
              sourcePlanId={plan.id}
              weekStartDate={nextWeekStartDate}
              locale={locale}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

function CopyForm({
  clientId,
  sourcePlanId,
  weekStartDate,
  locale,
}: {
  clientId: string;
  sourcePlanId: string;
  weekStartDate: string;
  locale: string;
}) {
  const t = useTranslations('weeklyPlans');
  const [state, formAction] = useActionState(startWeekFromPlanAction, initialNewWeekState);

  return (
    <form action={formAction} className="mt-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="sourcePlanId" value={sourcePlanId} />
      <input type="hidden" name="weekStartDate" value={weekStartDate} />

      <CopySubmit label={t('copyIntoWeek', { date: weekStartDate })} />

      {state.status === 'error' && (
        <p className="mt-1 text-xs text-destructive">{t(state.messageKey)}</p>
      )}
    </form>
  );
}

function CopySubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="sm" variant="outline" className="w-full" disabled={pending}>
      {label}
    </Button>
  );
}
```

- [ ] **Step 4: Host the tabs in the board**

In `src/features/weekly-plans/components/plan-board.tsx`:

Add the imports:

```tsx
import { RailTabs } from './rail-tabs';
```

Add a `history` prop to the component signature (`history: React.ReactNode`), add the tab state next to `selectedMealId`:

```tsx
  const [tab, setTab] = useState<'client' | 'meal' | 'past'>('client');
```

Change the meal-selection handler passed to `DayColumn` so that opening a card also opens the meal tab:

```tsx
              onSelectMeal={(mealId) => {
                setSelectedMealId((current) => (current === mealId ? null : mealId));
                setTab('meal');
              }}
```

Replace the `<aside>` body with:

```tsx
        <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-s border-border ps-3">
          <RailTabs
            label={t('title')}
            active={tab}
            onSelect={setTab}
            tabs={[
              { id: 'client', label: t('tabs.client') },
              { id: 'meal', label: t('tabs.meal') },
              { id: 'past', label: t('tabs.past') },
            ]}
          />

          <div
            role="tabpanel"
            id={`rail-panel-${tab}`}
            aria-labelledby={`rail-tab-${tab}`}
            className="min-h-0 flex-1"
          >
            {tab === 'meal' && selectedMeal ? (
              <MealDetailPanel
                meal={selectedMeal}
                candidates={candidates[selectedMeal.id] ?? []}
                planId={board.id}
                locale={locale}
                editable={editable}
                onClose={() => setTab('client')}
              />
            ) : tab === 'past' ? (
              history
            ) : (
              children
            )}
          </div>
        </aside>
```

- [ ] **Step 5: Verify**

```bash
bun run typecheck
bun run lint
```

- [ ] **Step 6: Commit**

```bash
git add src/features/weekly-plans/components src/i18n/messages
git commit -m "feat: give the plan rail tabs and a history panel"
```

---

### Task 8: The New week menu, wired into the page

**Files:**
- Create: `src/features/weekly-plans/components/new-week-menu.tsx`
- Modify: `src/features/weekly-plans/queries.ts` (`listPlans` returns the target and meal count)
- Modify: `src/app/[locale]/app/weekly-plans/[clientId]/page.tsx`

- [ ] **Step 1: Extend `listPlans`**

In `src/features/weekly-plans/queries.ts`, replace `listPlans` with:

```ts
/** One client's plans, newest week first, for the history panel and the header. */
export async function listPlans(
  clinicId: string,
  clientId: string,
): Promise<
  { id: string; weekStartDate: string; status: string; updatedAt: Date; kcalTargetSnapshot: number; mealCount: number }[]
> {
  return db
    .select({
      id: weeklyPlans.id,
      weekStartDate: weeklyPlans.weekStartDate,
      status: weeklyPlans.status,
      updatedAt: weeklyPlans.updatedAt,
      kcalTargetSnapshot: weeklyPlans.kcalTargetSnapshot,
      // Counted in SQL rather than by loading the meals: the panel shows a number,
      // and fetching 35 rows per plan to length them would be the page's largest
      // read by far.
      mealCount: sql<number>`cast(count(${weeklyPlanMeals.id}) as int)`,
    })
    .from(weeklyPlans)
    .leftJoin(weeklyPlanMeals, eq(weeklyPlanMeals.planId, weeklyPlans.id))
    .where(and(eq(weeklyPlans.clinicId, clinicId), eq(weeklyPlans.clientId, clientId)))
    .groupBy(weeklyPlans.id)
    .orderBy(desc(weeklyPlans.weekStartDate), desc(weeklyPlans.updatedAt));
}
```

- [ ] **Step 2: Write the menu**

Create `src/features/weekly-plans/components/new-week-menu.tsx`:

```tsx
'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

import { startEmptyWeekAction, startWeekFromPlanAction } from '../editor-actions';
import { initialNewWeekState } from '../form-state';

/**
 * The three doors into a plan.
 *
 * Generation is one entry among three rather than the page's primary action:
 * a returning client's next week is usually last week with a few meals changed,
 * and making that path go through a model was the whole problem.
 *
 * The generate door scrolls to the panel in the rail rather than duplicating its
 * form here — the instruction box and the per-week targets are too much content
 * for a menu, and two copies of them would drift.
 */
export function NewWeekMenu({
  clientId,
  weekStartDate,
  previousPlan,
  locale,
  blocked,
  onGenerate,
}: {
  clientId: string;
  weekStartDate: string;
  previousPlan: { id: string; weekStartDate: string } | null;
  locale: string;
  blocked: boolean;
  onGenerate: () => void;
}) {
  const t = useTranslations('weeklyPlans');
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button type="button" size="sm" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        {t('newWeek')}
      </Button>

      {open && (
        <div className="absolute z-20 mt-1 w-72 rounded-md border border-border bg-background p-2 shadow-md">
          {blocked ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">{t('errors.profileIncomplete')}</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onGenerate();
                }}
                className="rounded-md p-2 text-start text-xs hover:bg-accent"
              >
                <span className="block font-medium">{t('newWeekGenerate')}</span>
              </button>

              {previousPlan && (
                <CopyEntry
                  clientId={clientId}
                  sourcePlanId={previousPlan.id}
                  sourceWeek={previousPlan.weekStartDate}
                  weekStartDate={weekStartDate}
                  locale={locale}
                />
              )}

              <EmptyEntry clientId={clientId} weekStartDate={weekStartDate} locale={locale} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CopyEntry({
  clientId,
  sourcePlanId,
  sourceWeek,
  weekStartDate,
  locale,
}: {
  clientId: string;
  sourcePlanId: string;
  sourceWeek: string;
  weekStartDate: string;
  locale: string;
}) {
  const t = useTranslations('weeklyPlans');
  const [state, formAction] = useActionState(startWeekFromPlanAction, initialNewWeekState);

  return (
    <form action={formAction}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="sourcePlanId" value={sourcePlanId} />
      <input type="hidden" name="weekStartDate" value={weekStartDate} />

      <Entry title={t('newWeekFrom', { date: sourceWeek })} hint={t('newWeekFromHint')} />

      {state.status === 'error' && <p className="px-2 text-xs text-destructive">{t(state.messageKey)}</p>}
    </form>
  );
}

function EmptyEntry({
  clientId,
  weekStartDate,
  locale,
}: {
  clientId: string;
  weekStartDate: string;
  locale: string;
}) {
  const t = useTranslations('weeklyPlans');
  const [state, formAction] = useActionState(startEmptyWeekAction, initialNewWeekState);

  return (
    <form action={formAction}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="weekStartDate" value={weekStartDate} />

      <Entry title={t('newWeekEmpty')} hint={t('newWeekEmptyHint')} />

      {state.status === 'error' && <p className="px-2 text-xs text-destructive">{t(state.messageKey)}</p>}
    </form>
  );
}

function Entry({ title, hint }: { title: string; hint: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md p-2 text-start text-xs hover:bg-accent disabled:opacity-50"
    >
      <span className="block font-medium">{title}</span>
      <span className="mt-0.5 block text-muted-foreground">{hint}</span>
    </button>
  );
}
```

- [ ] **Step 3: Compose it on the page**

In `src/app/[locale]/app/weekly-plans/[clientId]/page.tsx`, import `NewWeekMenu` and `PlanHistory`, and pass `history` into `PlanBoard`:

```tsx
            history={
              <PlanHistory
                plans={plans}
                clientId={clientId}
                currentPlanId={board?.id ?? null}
                nextWeekStartDate={nextSunday()}
                locale={locale}
              />
            }
```

The `NewWeekMenu` needs `onGenerate`, a client callback, so it is rendered inside `PlanBoard`'s header rather than on the server page. Pass the data it needs down as props: `previousPlan` is the first entry of `plans` whose id is not `board?.id`.

- [ ] **Step 4: Verify in the browser**

```bash
bun run dev
```

Open a client's board, confirm: the New week menu lists three entries, "Start from …" creates a draft for next Sunday carrying the earlier week's dishes, and the Past tab lists every plan.

- [ ] **Step 5: Run every check**

```bash
bun run lint
bun run typecheck
bun test
```

- [ ] **Step 6: Commit**

```bash
git add -A src/features/weekly-plans src/app/\[locale\]/app/weekly-plans
git commit -m "feat: offer three ways to start a client's week"
```

---

## Self-review notes

- **Spec coverage.** Stage 1 → Task 1. Stage 2 → Tasks 2–5, 7, 8. Stage 3 → Task 6. Stages 4–6 (drag-and-drop, published-plan editing, compare view and recent-use badges) are explicitly a second plan.
- **The per-week override form fields** are added to `GenerateForm` as part of Task 6 step 7's caller changes; the strings for them land in Task 7 step 1 (`weekTargets`, `kcalTargetLabel`, `proteinTargetLabel`, `goalLabel`, `targetsHint`).
- **Naming consistency:** `planSkeleton`/`SkeletonMeal`/`slotFillKey`/`SlotFill` (Task 2) are used unchanged in Tasks 3, 4 and 5. `createPlanFromSkeleton` (Task 4) is called only from `startWeek` (Task 5). `NewWeekState`/`initialNewWeekState` (Task 5) are used in Tasks 7 and 8.
