# Editable Dish Catalog — Phase 2A (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the backend foundation for an editable dish catalog: the data model for clinic-owned dishes and custom foods, an ownership-aware `loadCatalog`, and the auto-computed nutrition category — all testable without a browser.

**Architecture:** Additive Drizzle schema changes (new nullable columns + two small tables), a pure `nutritionCategory` function that reuses the existing `energySplit`, and a change to `loadCatalog` so it returns shared-not-hidden dishes plus the clinic's own. Write mutations and the editor UI are Phase 2B and are out of scope here.

**Tech Stack:** TypeScript, Drizzle ORM (drizzle-kit migrations, output in `./drizzle`), PostgreSQL, `bun:test` (backed by the test DB via `.env.test.local`).

**Spec:** `docs/superpowers/specs/2026-08-15-editable-dish-catalog-design.md`

---

## Scope

**In scope (Phase 2A):**
- Task 1 — `nutritionCategory` pure function (spec part C).
- Task 2 — schema changes + migration (spec part A data model + part B ingredient/custom-food columns).
- Task 3 — ownership-aware `loadCatalog` (spec part A read path).

**Out of scope (Phase 2B):** the add/edit-dish editor UI, the write mutations (create/edit/hide dish, custom food, alias), and the AI Arabic food matching. Phase 2A only builds and tests the data model, the read path, and the category function that 2B will consume.

---

## Task 1: The `nutritionCategory` pure function

**Files:**
- Modify: `src/features/weekly-plans/nutrition.ts` (append the function + its types)
- Test: `src/features/weekly-plans/nutrition.test.ts` (append a `describe` block)

TDD. This is pure — no DB — so it is verified directly.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/weekly-plans/nutrition.test.ts` (keep existing imports; add `nutritionCategory` and `emptyTotals` to the import from `./nutrition` if not already imported, and add `NutrientTotals` as a type import):

```ts
describe('nutritionCategory', () => {
  // Builds a totals object with only the three energy macros set — the only
  // fields energySplit reads. Grams in, category out.
  function totalsOf(protein: number, carbs: number, fat: number): NutrientTotals {
    const totals = emptyTotals();
    totals.protein.value = protein;
    totals.carbs.value = carbs;
    totals.fat.value = fat;
    return totals;
  }

  test('labels a protein-dominant dish high_protein', () => {
    // 40g protein / 40g carbs / 5g fat → protein is ~44% of macro energy.
    expect(nutritionCategory(totalsOf(40, 40, 5))).toBe('high_protein');
  });

  test('labels a carb-dominant dish high_carb', () => {
    // 10 / 80 / 5 → carbs ~79% of macro energy.
    expect(nutritionCategory(totalsOf(10, 80, 5))).toBe('high_carb');
  });

  test('labels a fat-dominant dish high_fat', () => {
    // 5 / 5 / 30 → fat ~87% of macro energy.
    expect(nutritionCategory(totalsOf(5, 5, 30))).toBe('high_fat');
  });

  test('labels a spread-out dish balanced when nothing crosses a threshold', () => {
    // 20 / 45 / 15 → protein 20%, carbs 46%, fat 34% — none reaches its cutoff.
    expect(nutritionCategory(totalsOf(20, 45, 15))).toBe('balanced');
  });

  test('when two thresholds are crossed, picks the one crossed by the largest margin', () => {
    // 30 / 5 / 25 → protein ~33% (margin +0.03), fat ~62% (margin +0.22) → fat wins.
    expect(nutritionCategory(totalsOf(30, 5, 25))).toBe('high_fat');
  });

  test('an empty dish is balanced rather than dividing by zero', () => {
    expect(nutritionCategory(emptyTotals())).toBe('balanced');
  });
});
```

- [ ] **Step 2: Run the tests, verify they FAIL**

Run: `bun test src/features/weekly-plans/nutrition.test.ts`
Expected: FAIL — `nutritionCategory` is not exported.

- [ ] **Step 3: Implement**

Append to `src/features/weekly-plans/nutrition.ts`:

```ts
/**
 * The single nutrition label a dish carries, worked out from its own macros.
 *
 * Computed, never stored: change the recipe and the label follows, so it cannot
 * go stale the way a hand-typed "high protein" tag does. Uses `energySplit`, so
 * the percentages are shares of the energy the macros account for — the same
 * basis the meal panel uses, which sidesteps the divide-by-`kcal` rounding
 * problem noted on `energySplit`.
 *
 * Exactly one label. When a dish crosses more than one cutoff, the one it beats
 * by the widest margin wins, so there is never a tie to resolve in the UI.
 */
export const NUTRITION_CATEGORIES = ['high_protein', 'high_carb', 'high_fat', 'balanced'] as const;

export type NutritionCategory = (typeof NUTRITION_CATEGORIES)[number];

export function nutritionCategory(totals: NutrientTotals): NutritionCategory {
  const split = energySplit(totals);

  // Each macro's share minus its cutoff. A positive margin means the dish
  // qualifies for that label; the widest positive margin is the label it gets.
  const candidates = [
    { label: 'high_protein' as const, margin: split.protein.percent - 0.3 },
    { label: 'high_carb' as const, margin: split.carbs.percent - 0.55 },
    { label: 'high_fat' as const, margin: split.fat.percent - 0.4 },
  ];

  const crossed = candidates.filter((candidate) => candidate.margin >= 0);
  if (crossed.length === 0) return 'balanced';

  return crossed.reduce((best, candidate) => (candidate.margin > best.margin ? candidate : best)).label;
}
```

- [ ] **Step 4: Run the tests, verify they PASS**

Run: `bun test src/features/weekly-plans/nutrition.test.ts`
Expected: PASS — the whole file, including the six new tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/weekly-plans/nutrition.ts src/features/weekly-plans/nutrition.test.ts
git commit -m "Add computed nutritionCategory for dishes"
```

---

## Task 2: Schema changes and migration

**Files:**
- Modify: `src/db/schema/dishes.ts` (add `clinicId` to `dishes`; add ingredient columns; add `clinicHiddenDishes` table)
- Modify: `src/db/schema/foods.ts` (add `clinicId`; add `foodAliases` table)
- Modify: `src/db/schema/index.ts` (export any new tables — `export *` already re-exports new members of edited files, so only add lines if a NEW file is created; here no new file is created, so index.ts needs no change — verify)
- Generated: a new file under `./drizzle` (created by drizzle-kit; do NOT hand-edit it)

**Context:** All domain tables use `uuid` PKs with `defaultRandom()`, `text`/`real` columns, and `created_at`/`updated_at` timestamps. `clinics` is exported from `src/db/schema/clinics.ts`. `dishes.ts` already anticipates this exact change: "When clinic-owned dishes are actually needed that is a `clinic_id` column added then." Migrations live in `./drizzle`; generated snapshots are never hand-edited (`CLAUDE.md`).

- [ ] **Step 1: Add `clinic_id` and the hide table to `dishes.ts`**

At the top of `src/db/schema/dishes.ts`, add an import for `clinics` alongside the `foods` import:

```ts
import { clinics } from './clinics';
```

Add this column inside the `dishes` table definition, right after `id`:

```ts
    /**
     * The owning clinic, or null for a shared built-in dish. Null dishes are
     * visible to every clinic; a set value scopes the dish to one clinic.
     */
    clinicId: uuid('clinic_id').references(() => clinics.id, { onDelete: 'cascade' }),
```

Add an index for it inside the `dishes` table's index array (next to the existing `dishes_is_active_idx`):

```ts
    index('dishes_clinic_id_idx').on(table.clinicId),
```

At the end of `src/db/schema/dishes.ts` (after the `dishIngredients` table, before the type exports), add the hide table:

```ts
/**
 * A clinic's decision to hide a shared dish it does not use.
 *
 * Only ever references shared dishes; a clinic's own dishes are removed by
 * deleting them, not hidden. One row per (clinic, dish) — hiding twice is the
 * same as hiding once.
 */
export const clinicHiddenDishes = pgTable(
  'clinic_hidden_dishes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),
    dishId: uuid('dish_id')
      .notNull()
      .references(() => dishes.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('clinic_hidden_dishes_clinic_dish_idx').on(table.clinicId, table.dishId)],
);
```

Add its type exports next to the others at the bottom of the file:

```ts
export type ClinicHiddenDish = typeof clinicHiddenDishes.$inferSelect;
export type NewClinicHiddenDish = typeof clinicHiddenDishes.$inferInsert;
```

- [ ] **Step 2: Add the three presentation columns to `dishIngredients` in `dishes.ts`**

Inside the `dishIngredients` table definition, after `quantityGrams`, add:

```ts
    /** The Arabic food name shown to the client. Null on shared/seed rows until curated. */
    displayNameAr: text('display_name_ar'),

    /** An optional household measure, e.g. "tablespoon", with the grams it weighs. */
    householdLabel: text('household_label'),
    householdGrams: real('household_grams'),
```

(`text` and `real` are already imported in `dishes.ts`.)

- [ ] **Step 3: Add `clinic_id` and the alias table to `foods.ts`**

At the top of `src/db/schema/foods.ts`, add:

```ts
import { clinics } from './clinics';
```

Add this column inside the `foods` table, after `id`:

```ts
    /**
     * The owning clinic for a custom food, or null for the shared USDA library.
     * Custom foods carry dietitian-entered (or AI-estimated, confirmed) nutrition.
     */
    clinicId: uuid('clinic_id').references(() => clinics.id, { onDelete: 'cascade' }),
```

Change `fdcId` to be nullable, because a clinic custom food has no FoodData Central id. Find:

```ts
    fdcId: integer('fdc_id').notNull(),
```

Replace with:

```ts
    /** The upstream FoodData Central id. Null for a clinic's own custom food. */
    fdcId: integer('fdc_id'),
```

Note: the `foods_fdc_id_idx` unique index stays. PostgreSQL treats NULLs as distinct, so many custom foods with null `fdc_id` do not collide.

At the end of `src/db/schema/foods.ts` (before the type exports), add the alias table:

```ts
/**
 * A clinic's remembered mapping from an Arabic food name to a library food.
 *
 * Built up as the dietitian confirms matches, so the next time she types the
 * same Arabic name it resolves instantly with no AI call, and so the app grows
 * an Arabic food vocabulary the USDA library does not have.
 */
export const foodAliases = pgTable(
  'food_aliases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),
    foodId: uuid('food_id')
      .notNull()
      .references(() => foods.id, { onDelete: 'cascade' }),
    nameAr: text('name_ar').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('food_aliases_clinic_name_idx').on(table.clinicId, table.nameAr)],
);
```

Add its type exports at the bottom:

```ts
export type FoodAlias = typeof foodAliases.$inferSelect;
export type NewFoodAlias = typeof foodAliases.$inferInsert;
```

- [ ] **Step 4: Verify the barrel exports the new tables**

`src/db/schema/index.ts` uses `export *` per file, so the new tables in `dishes.ts`/`foods.ts` are already re-exported — no change needed. Confirm by opening `index.ts` and checking `./dishes` and `./foods` are present (they are). No edit expected.

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`
Expected: PASS. If `clinics` has a different export name, fix the import to match before proceeding.

- [ ] **Step 6: Generate the migration**

Run: `bun run db:generate`
Expected: drizzle-kit prints the diff and writes a new `NNNN_*.sql` file under `./drizzle` plus updates `./drizzle/meta`. Open the generated `.sql` and confirm it only ADDs columns/tables (nullable `clinic_id`, the three ingredient columns, `clinic_hidden_dishes`, `food_aliases`, and makes `fdc_id` nullable) and drops nothing. Do NOT hand-edit the generated file.

- [ ] **Step 7: Apply the migration to the dev and test databases**

Run: `bun run db:migrate`
Expected: applies cleanly to the dev DB.

Run: `bun run db:migrate:test`
Expected: applies cleanly to the test DB (needed for the DB-backed tests in later tasks).

- [ ] **Step 8: Confirm existing DB tests still pass**

Run: `bun test src/features/weekly-plans/queries.test.ts src/features/weekly-plans/mutations.test.ts`
Expected: PASS (mutations.test.ts calls `loadCatalog()` — it still compiles because Task 3 has not changed the signature yet).

- [ ] **Step 9: Commit**

```bash
git add src/db/schema/dishes.ts src/db/schema/foods.ts drizzle/
git commit -m "Add schema for clinic-owned dishes, custom foods, and ingredient display fields"
```

---

## Task 3: Ownership-aware `loadCatalog`

**Files:**
- Modify: `src/features/weekly-plans/queries.ts` (`loadCatalog` + the readers that call it: `listCatalogForBoard`, `listDishes`, `findSwapCandidates`, `swapCandidatesByMeal`)
- Modify: `src/features/weekly-plans/actions.ts:130` (pass `clinicId`)
- Modify: callers of the changed readers (page components) — driven by typecheck
- Modify: `src/features/weekly-plans/mutations.test.ts` (pass a `clinicId` to `loadCatalog`)
- Test: `src/features/weekly-plans/queries.test.ts` (new `loadCatalog` ownership tests)

**Context:** `loadCatalog(allergens?)` today returns every active dish, allergen-filtered. It must become clinic-aware: shared dishes (`clinic_id IS NULL`) that this clinic has not hidden, plus the clinic's own dishes (`clinic_id = clinicId`). The hide set is read from `clinic_hidden_dishes`. Test helpers `createTestClinic`, `createTestClient`, `resetDatabase` live in `tests/helpers`; DB tests use `beforeEach(resetDatabase)` (see `queries.test.ts:19`).

- [ ] **Step 1: Write the failing ownership tests**

Add to `src/features/weekly-plans/queries.test.ts`. Add `loadCatalog` to the import from `./queries`, add `clinicHiddenDishes` to the `@/db/schema` import, and add this block (a second clinic is created inline to prove isolation):

```ts
describe('loadCatalog ownership', () => {
  async function seedSharedDish(slug: string) {
    const [dish] = await db
      .insert(dishes)
      .values({
        slug,
        nameAr: slug,
        nameEn: slug,
        mealTypes: ['lunch'],
        tags: [],
        allergenTags: [],
        baseServingLabel: 'serving',
      })
      .returning({ id: dishes.id });
    return dish!.id;
  }

  test('returns shared dishes plus the clinic own, and hides what the clinic hid', async () => {
    const otherClinic = await createTestClinic();

    const sharedId = await seedSharedDish('shared-dish');
    const hiddenSharedId = await seedSharedDish('shared-hidden');

    // A dish owned by our clinic, and one owned by another clinic.
    const [ownDish] = await db
      .insert(dishes)
      .values({
        clinicId,
        slug: 'own-dish',
        nameAr: 'own',
        nameEn: 'own',
        mealTypes: ['lunch'],
        tags: [],
        allergenTags: [],
        baseServingLabel: 'serving',
      })
      .returning({ id: dishes.id });
    await db.insert(dishes).values({
      clinicId: otherClinic,
      slug: 'other-clinic-dish',
      nameAr: 'other',
      nameEn: 'other',
      mealTypes: ['lunch'],
      tags: [],
      allergenTags: [],
      baseServingLabel: 'serving',
    });

    // Our clinic hides one shared dish.
    await db.insert(clinicHiddenDishes).values({ clinicId, dishId: hiddenSharedId });

    const slugs = (await loadCatalog(clinicId)).map((dish) => dish.slug).sort();

    expect(slugs).toEqual(['own-dish', 'shared-dish']);
    expect(slugs).not.toContain('shared-hidden');
    expect(slugs).not.toContain('other-clinic-dish');
    // Sanity: the hidden dish exists and is only hidden for our clinic.
    expect(sharedId).toBeDefined();
    expect(ownDish).toBeDefined();
  });

  test('another clinic still sees a dish this clinic hid', async () => {
    const otherClinic = await createTestClinic();
    const sharedId = await seedSharedDish('shared-dish');
    await db.insert(clinicHiddenDishes).values({ clinicId, dishId: sharedId });

    expect((await loadCatalog(clinicId)).map((d) => d.slug)).not.toContain('shared-dish');
    expect((await loadCatalog(otherClinic)).map((d) => d.slug)).toContain('shared-dish');
  });
});
```

- [ ] **Step 2: Run the tests, verify they FAIL**

Run: `bun test src/features/weekly-plans/queries.test.ts`
Expected: FAIL — `loadCatalog(clinicId)` does not yet filter by ownership (the current signature ignores it / treats the arg as allergens).

- [ ] **Step 3: Change `loadCatalog`**

In `src/features/weekly-plans/queries.ts`, add `clinicHiddenDishes` to the `@/db/schema` import and `isNull`, `notInArray` to the `drizzle-orm` import. Replace the `loadCatalog` signature and its condition-building (currently around `queries.ts:101`):

```ts
export async function loadCatalog(
  clinicId: string,
  allergens: readonly string[] = [],
): Promise<DishDetail[]> {
  // Dishes hidden by this clinic — read first so the main query can exclude them.
  const hidden = await db
    .select({ dishId: clinicHiddenDishes.dishId })
    .from(clinicHiddenDishes)
    .where(eq(clinicHiddenDishes.clinicId, clinicId));
  const hiddenIds = hidden.map((row) => row.dishId);

  const conditions: SQL[] = [
    eq(dishes.isActive, true),
    // Shared (unowned) dishes, or this clinic's own — never another clinic's.
    or(isNull(dishes.clinicId), eq(dishes.clinicId, clinicId))!,
  ];

  if (hiddenIds.length) {
    conditions.push(notInArray(dishes.id, hiddenIds));
  }

  if (allergens.length) {
    conditions.push(sql`not (${dishes.allergenTags} && ${textArray(allergens)})`);
  }

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
    .where(and(...conditions))
    .orderBy(asc(dishes.slug));

  // ... the rest of the function (ingredient loading and mapping) is UNCHANGED.
```

Leave everything below the `dishRows` query exactly as it is.

- [ ] **Step 4: Thread `clinicId` through the readers that call `loadCatalog`**

Update each internal caller in `queries.ts`:

- `listCatalogForBoard(allergens)` → `listCatalogForBoard(clinicId: string, allergens: readonly string[])`, and change its `await loadCatalog()` to `await loadCatalog(clinicId)`.
- `listDishes(input)` → add `clinicId: string` to the `input` object type, and change its `await loadCatalog()` to `await loadCatalog(input.clinicId)`.
- `findSwapCandidates({ slotKey, budgetKcal, allergens, excludeSlugs })` → add `clinicId: string` to the argument object, and change `await loadCatalog(allergens)` to `await loadCatalog(clinicId, allergens)`.
- `swapCandidatesByMeal(board, allergens)` → `swapCandidatesByMeal(board, clinicId, allergens)`, and change `await loadCatalog(allergens)` to `await loadCatalog(clinicId, allergens)`.

In `src/features/weekly-plans/actions.ts:130`, change:

```ts
  const catalog = await loadCatalog(context.profile.allergenTags);
```

to:

```ts
  const catalog = await loadCatalog(clinicId, context.profile.allergenTags);
```

(`clinicId` is the first parameter of `prepare`.)

- [ ] **Step 5: Fix the remaining callers with the typechecker**

Run: `bun run typecheck`

For each error, thread the `clinicId` the caller already holds (page components under `src/app/[locale]/app/weekly-plans/**` and any feature code) into `listCatalogForBoard`, `listDishes`, `findSwapCandidates`, and `swapCandidatesByMeal`. These are staff-scoped screens, so a `clinicId` (via `requireStaffClinic`) is already in scope at each call site. Repeat until `bun run typecheck` is clean.

- [ ] **Step 6: Update `mutations.test.ts` calls**

In `src/features/weekly-plans/mutations.test.ts`, the three `loadCatalog(...)` calls (around lines 705–713) need a `clinicId`. That test file already creates a `clinicId`; pass it first:

- `await loadCatalog()` → `await loadCatalog(clinicId)`
- `await loadCatalog(['nuts'])` → `await loadCatalog(clinicId, ['nuts'])` (both occurrences)

- [ ] **Step 7: Run the full weekly-plans + clients tests**

Run: `bun test src/features/weekly-plans src/features/clients`
Expected: PASS, including the new ownership tests and the unchanged existing ones.

- [ ] **Step 8: Lint and typecheck**

Run: `bun run typecheck` → PASS.
Run: `bun run lint` → PASS.

- [ ] **Step 9: Commit**

```bash
git add src/features/weekly-plans/queries.ts src/features/weekly-plans/actions.ts src/features/weekly-plans/queries.test.ts src/features/weekly-plans/mutations.test.ts src/app
git commit -m "Make loadCatalog return shared-not-hidden plus clinic-owned dishes"
```

---

## Self-Review notes

- **Spec coverage:** part A data model → Task 2 (`clinic_id`, `clinic_hidden_dishes`); part A read path → Task 3 (`loadCatalog`); part B ingredient/custom-food columns → Task 2 (`display_name_ar`, `household_*`, `foods.clinic_id`, `food_aliases`); part C nutrition category → Task 1. Write mutations, editor UI, and AI matching are deliberately Phase 2B, not this plan.
- **Migrations** are generated by drizzle-kit and not hand-edited (`CLAUDE.md`). All changes are additive; nothing is dropped, so existing rows and plans are safe.
- **Type consistency:** `nutritionCategory(totals: NutrientTotals): NutritionCategory` (Task 1); `loadCatalog(clinicId: string, allergens?: readonly string[])` used consistently in Tasks 3's implementation, callers, and tests.
- **`fdc_id` nullable:** required so a clinic custom food (no FoodData Central id) can exist; the unique index tolerates it because Postgres treats NULLs as distinct.

## Follow-on (Phase 2B, separate plan)

Write mutations (`createClinicDish`, `updateClinicDish`, `deleteClinicDish`, `hideSharedDish`, `unhideSharedDish`, custom-food + alias writes), the add/edit-dish editor UI with live calorie calculation, the AI Arabic→food matching (translator + alias memory), and custom-food AI estimate. Needs browser/login verification.
