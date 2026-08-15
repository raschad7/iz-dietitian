# Editable Dish Catalog — Phase 2B (Editor + AI Matching) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a dietitian add, edit, and hide dishes: write mutations, an AI Arabic→food matching service (translator + alias memory + custom-food estimate), and the add/edit-dish editor UI with live calorie calculation.

**Architecture:** Three layers built strongest-foundation-first. **2B-1 mutations** and **2B-2 AI matching** are backend and fully verifiable against the test database (the AI call sits behind an `llm.ts`-style seam with a deterministic stub for tests). **2B-3 editor UI** is React behind staff login and must be verified in the browser by the user.

**Tech Stack:** TypeScript, Drizzle ORM, PostgreSQL, `bun:test` (test DB), next-intl, Next.js server actions, OpenAI via `fetch` (mirroring `src/features/weekly-plans/llm.ts`).

**Spec:** `docs/superpowers/specs/2026-08-15-editable-dish-catalog-design.md`
**Builds on:** Phase 2A (`docs/superpowers/plans/2026-08-16-editable-dish-catalog-phase-2a.md`) — schema, `nutritionCategory`, ownership-aware `loadCatalog`.

---

## Layering and verification

| Sub-phase | Tasks | Verifiable by me (test DB)? |
|---|---|---|
| 2B-1 Mutations | 1–3 | Yes — DB tests |
| 2B-2 AI matching | 4–6 | Yes — DB tests + stub translator; live OpenAI call exercised only via the console stub |
| 2B-3 Editor UI | 7–9 | **No — needs the user's browser/login.** Built to existing patterns; runtime behaviour confirmed by the user. |

New files live in `src/features/weekly-plans/` (the catalog already lives there — reads in `queries.ts`, the dishes route reuses its components), following the existing structure rather than introducing a new feature folder.

---

## 2B-1 — Write mutations

### Task 1: Catalog validation schema

**Files:**
- Create: `src/features/weekly-plans/catalog-schema.ts`
- Test: `src/features/weekly-plans/catalog-schema.test.ts`

**Context:** Zod is used across the codebase for input validation (see `src/features/weekly-plans/schema.ts`). Meal types, dish tags, and allergens are closed sets already defined in `schema.ts` (`MEAL_TYPES`) and `src/features/clients/nutrition.ts` (`ALLERGENS`). `MIN_SERVINGS`/`SERVING_STEP` conventions live in `similar.ts`.

- [ ] **Step 1: Write failing tests**

Create `src/features/weekly-plans/catalog-schema.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';

import { clinicDishInputSchema, customFoodInputSchema } from './catalog-schema';

const validDish = {
  nameAr: 'دجاج مشوي',
  nameEn: 'Grilled chicken',
  mealTypes: ['lunch'],
  tags: ['high_protein_manual_placeholder'],
  allergenTags: [],
  baseServingLabel: 'حصة',
  ingredients: [
    { foodId: '11111111-1111-1111-1111-111111111111', quantityGrams: 200 },
  ],
};

describe('clinicDishInputSchema', () => {
  test('accepts a valid dish with one ingredient', () => {
    const parsed = clinicDishInputSchema.parse(validDish);
    expect(parsed.ingredients).toHaveLength(1);
  });

  test('requires at least one ingredient', () => {
    expect(() => clinicDishInputSchema.parse({ ...validDish, ingredients: [] })).toThrow();
  });

  test('requires at least one meal type', () => {
    expect(() => clinicDishInputSchema.parse({ ...validDish, mealTypes: [] })).toThrow();
  });

  test('rejects a non-positive ingredient quantity', () => {
    expect(() =>
      clinicDishInputSchema.parse({
        ...validDish,
        ingredients: [{ foodId: validDish.ingredients[0].foodId, quantityGrams: 0 }],
      }),
    ).toThrow();
  });

  test('carries optional per-ingredient Arabic name and household measure', () => {
    const parsed = clinicDishInputSchema.parse({
      ...validDish,
      ingredients: [
        {
          foodId: validDish.ingredients[0].foodId,
          quantityGrams: 45,
          displayNameAr: 'أرز',
          householdLabel: 'ملعقة كبيرة',
          householdGrams: 15,
        },
      ],
    });
    expect(parsed.ingredients[0].householdGrams).toBe(15);
  });
});

describe('customFoodInputSchema', () => {
  test('accepts a custom food with the required macros', () => {
    const parsed = customFoodInputSchema.parse({
      description: 'Village white cheese',
      nameAr: 'جبنة بلدية',
      kcal: 260,
      protein: 18,
      carbs: 2,
      fat: 20,
    });
    expect(parsed.kcal).toBe(260);
  });

  test('rejects negative energy', () => {
    expect(() =>
      customFoodInputSchema.parse({ description: 'x', nameAr: 'x', kcal: -1, protein: 0, carbs: 0, fat: 0 }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `bun test src/features/weekly-plans/catalog-schema.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

Create `src/features/weekly-plans/catalog-schema.ts`:

```ts
import { z } from 'zod';

import { ALLERGENS } from '@/features/clients/nutrition';

import { MEAL_TYPES } from './schema';

/**
 * Validation for dishes and foods a clinic creates in its own catalog.
 *
 * Kept out of `schema.ts` only to keep that file about generation; the same Zod
 * discipline applies. Ids are validated as uuids but their ownership is checked
 * in the mutation, not here — a schema cannot know which clinic is calling.
 */
const uuid = z.string().uuid();

export const ingredientInputSchema = z.object({
  foodId: uuid,
  quantityGrams: z.coerce.number().positive(),
  displayNameAr: z.string().trim().max(120).optional(),
  householdLabel: z.string().trim().max(60).optional(),
  householdGrams: z.coerce.number().positive().optional(),
});

export const clinicDishInputSchema = z.object({
  nameAr: z.string().trim().min(1).max(120),
  nameEn: z.string().trim().min(1).max(120),
  mealTypes: z.array(z.enum(MEAL_TYPES)).min(1),
  tags: z.array(z.string().trim().min(1).max(40)),
  allergenTags: z.array(z.enum(ALLERGENS)),
  baseServingLabel: z.string().trim().min(1).max(60),
  ingredients: z.array(ingredientInputSchema).min(1),
});

export type ClinicDishInput = z.infer<typeof clinicDishInputSchema>;

export const customFoodInputSchema = z.object({
  description: z.string().trim().min(1).max(200),
  nameAr: z.string().trim().min(1).max(120),
  kcal: z.coerce.number().nonnegative(),
  protein: z.coerce.number().nonnegative(),
  carbs: z.coerce.number().nonnegative(),
  fat: z.coerce.number().nonnegative(),
});

export type CustomFoodInput = z.infer<typeof customFoodInputSchema>;
```

Note: confirm `MEAL_TYPES` is exported from `schema.ts` and `ALLERGENS` from `clients/nutrition.ts` as `readonly` tuples usable in `z.enum`. If `z.enum` rejects a `readonly string[]`, use `z.enum(MEAL_TYPES as unknown as [string, ...string[]])` — but prefer the direct form if the tuples are `as const`.

- [ ] **Step 4: Run, verify PASS.** `bun test src/features/weekly-plans/catalog-schema.test.ts`
- [ ] **Step 5: Commit.** `git add src/features/weekly-plans/catalog-schema.ts src/features/weekly-plans/catalog-schema.test.ts && git commit -m "Add validation schema for clinic dishes and custom foods"`

### Task 2: Dish mutations (create / update / delete / hide / unhide)

**Files:**
- Create: `src/features/weekly-plans/catalog-mutations.ts`
- Test: `src/features/weekly-plans/catalog-mutations.test.ts`

**Context:** Mirror `mutations.ts`: every function takes `clinicId` first, resolves attacker-supplied ids against that clinic, and returns `false` (or null) rather than throwing on a scope miss. Use `db.transaction(async (tx) => { … })` for dish + ingredients. Only clinic-OWNED dishes (`clinic_id = clinicId`) may be edited or deleted; shared dishes may only be hidden. Test helpers: `createTestClinic`, `resetDatabase` in `tests/helpers`; seed a food row directly for ingredient FKs.

- [ ] **Step 1: Write failing tests**

Create `src/features/weekly-plans/catalog-mutations.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { clinicHiddenDishes, dishes, dishIngredients, foods } from '@/db/schema';
import { createTestClinic, resetDatabase } from '../../../tests/helpers';

import {
  createClinicDish,
  deleteClinicDish,
  hideSharedDish,
  unhideSharedDish,
  updateClinicDish,
} from './catalog-mutations';

let clinicId: string;
let foodId: string;

beforeEach(async () => {
  await resetDatabase();
  clinicId = await createTestClinic();
  const [food] = await db
    .insert(foods)
    .values({ description: 'Chicken breast', category: 'Poultry', kcal: 165, protein: 31, carbs: 0, fat: 3.6 })
    .returning({ id: foods.id });
  foodId = food!.id;
});

const dishInput = () => ({
  nameAr: 'دجاج',
  nameEn: 'Chicken',
  mealTypes: ['lunch'] as const,
  tags: [] as string[],
  allergenTags: [] as never[],
  baseServingLabel: 'حصة',
  ingredients: [{ foodId, quantityGrams: 200, displayNameAr: 'دجاج', householdLabel: undefined, householdGrams: undefined }],
});

describe('createClinicDish', () => {
  test('creates a clinic-owned dish with its ingredients', async () => {
    const dishId = await createClinicDish(clinicId, dishInput());
    expect(dishId).toBeString();

    const [dish] = await db.select().from(dishes).where(eq(dishes.id, dishId!));
    expect(dish!.clinicId).toBe(clinicId);

    const rows = await db.select().from(dishIngredients).where(eq(dishIngredients.dishId, dishId!));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.displayNameAr).toBe('دجاج');
  });
});

describe('updateClinicDish', () => {
  test('replaces the ingredients of an owned dish', async () => {
    const dishId = await createClinicDish(clinicId, dishInput());
    const ok = await updateClinicDish(clinicId, dishId!, {
      ...dishInput(),
      nameEn: 'Chicken plate',
      ingredients: [{ foodId, quantityGrams: 150 }],
    });
    expect(ok).toBe(true);
    const [dish] = await db.select().from(dishes).where(eq(dishes.id, dishId!));
    expect(dish!.nameEn).toBe('Chicken plate');
    const rows = await db.select().from(dishIngredients).where(eq(dishIngredients.dishId, dishId!));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.quantityGrams).toBe(150);
  });

  test('refuses to edit another clinic dish', async () => {
    const other = await createTestClinic();
    const dishId = await createClinicDish(other, dishInput());
    expect(await updateClinicDish(clinicId, dishId!, dishInput())).toBe(false);
  });
});

describe('deleteClinicDish', () => {
  test('deletes an owned dish but not a shared one', async () => {
    const dishId = await createClinicDish(clinicId, dishInput());
    expect(await deleteClinicDish(clinicId, dishId!)).toBe(true);

    const [shared] = await db
      .insert(dishes)
      .values({ slug: 's', nameAr: 's', nameEn: 's', mealTypes: ['lunch'], tags: [], allergenTags: [], baseServingLabel: 'x' })
      .returning({ id: dishes.id });
    expect(await deleteClinicDish(clinicId, shared!.id)).toBe(false);
  });
});

describe('hide / unhide shared dishes', () => {
  test('hides a shared dish for this clinic and un-hides it', async () => {
    const [shared] = await db
      .insert(dishes)
      .values({ slug: 's', nameAr: 's', nameEn: 's', mealTypes: ['lunch'], tags: [], allergenTags: [], baseServingLabel: 'x' })
      .returning({ id: dishes.id });

    expect(await hideSharedDish(clinicId, shared!.id)).toBe(true);
    expect(
      await db.select().from(clinicHiddenDishes).where(and(eq(clinicHiddenDishes.clinicId, clinicId), eq(clinicHiddenDishes.dishId, shared!.id))),
    ).toHaveLength(1);

    // Hiding twice is idempotent.
    expect(await hideSharedDish(clinicId, shared!.id)).toBe(true);
    expect(await db.select().from(clinicHiddenDishes)).toHaveLength(1);

    expect(await unhideSharedDish(clinicId, shared!.id)).toBe(true);
    expect(await db.select().from(clinicHiddenDishes)).toHaveLength(0);
  });

  test('refuses to hide a clinic-owned dish (own dishes are deleted, not hidden)', async () => {
    const dishId = await createClinicDish(clinicId, dishInput());
    expect(await hideSharedDish(clinicId, dishId!)).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** `bun test src/features/weekly-plans/catalog-mutations.test.ts`

- [ ] **Step 3: Implement**

Create `src/features/weekly-plans/catalog-mutations.ts`:

```ts
import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { clinicHiddenDishes, dishes, dishIngredients } from '@/db/schema';

import type { ClinicDishInput } from './catalog-schema';

/**
 * Writes for a clinic's own catalog.
 *
 * Same rules as `mutations.ts`: `clinicId` first, every id resolved against the
 * clinic before writing, `false` rather than a throw on a scope miss so a forged
 * id is indistinguishable from a stale one. Only clinic-owned dishes
 * (`clinic_id = clinicId`) may be edited or deleted; a shared dish may only be
 * hidden.
 */

function makeSlug(clinicId: string, nameEn: string): string {
  const base = nameEn.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'dish';
  // Suffixed with a short clinic-scoped random tail so two clinics naming a dish
  // the same do not collide on the global unique slug index.
  return `${base}-${clinicId.slice(0, 8)}-${Math.random().toString(36).slice(2, 7)}`;
}

function ingredientRows(dishId: string, input: ClinicDishInput) {
  return input.ingredients.map((ingredient, index) => ({
    dishId,
    foodId: ingredient.foodId,
    quantityGrams: ingredient.quantityGrams,
    displayNameAr: ingredient.displayNameAr ?? null,
    householdLabel: ingredient.householdLabel ?? null,
    householdGrams: ingredient.householdGrams ?? null,
    sortOrder: index,
  }));
}

export async function createClinicDish(clinicId: string, input: ClinicDishInput): Promise<string | null> {
  return db.transaction(async (tx) => {
    const [dish] = await tx
      .insert(dishes)
      .values({
        clinicId,
        slug: makeSlug(clinicId, input.nameEn),
        nameAr: input.nameAr,
        nameEn: input.nameEn,
        mealTypes: input.mealTypes,
        tags: input.tags,
        allergenTags: input.allergenTags,
        baseServingLabel: input.baseServingLabel,
      })
      .returning({ id: dishes.id });

    if (!dish) return null;
    await tx.insert(dishIngredients).values(ingredientRows(dish.id, input));
    return dish.id;
  });
}

/** True only if the dish exists AND is owned by this clinic (not shared, not another clinic's). */
async function ownsDish(clinicId: string, dishId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: dishes.id })
    .from(dishes)
    .where(and(eq(dishes.id, dishId), eq(dishes.clinicId, clinicId)))
    .limit(1);
  return row !== undefined;
}

export async function updateClinicDish(
  clinicId: string,
  dishId: string,
  input: ClinicDishInput,
): Promise<boolean> {
  if (!(await ownsDish(clinicId, dishId))) return false;

  await db.transaction(async (tx) => {
    await tx
      .update(dishes)
      .set({
        nameAr: input.nameAr,
        nameEn: input.nameEn,
        mealTypes: input.mealTypes,
        tags: input.tags,
        allergenTags: input.allergenTags,
        baseServingLabel: input.baseServingLabel,
        updatedAt: new Date(),
      })
      .where(eq(dishes.id, dishId));

    // Replace the recipe wholesale — simpler and less error-prone than diffing,
    // and a dish has a handful of rows.
    await tx.delete(dishIngredients).where(eq(dishIngredients.dishId, dishId));
    await tx.insert(dishIngredients).values(ingredientRows(dishId, input));
  });

  return true;
}

export async function deleteClinicDish(clinicId: string, dishId: string): Promise<boolean> {
  if (!(await ownsDish(clinicId, dishId))) return false;
  // dish_ingredients cascade on dish delete (see schema).
  await db.delete(dishes).where(eq(dishes.id, dishId));
  return true;
}

/** Confirms a dish is a SHARED dish (clinic_id null) — the only kind that may be hidden. */
async function isSharedDish(dishId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: dishes.id })
    .from(dishes)
    .where(and(eq(dishes.id, dishId), isNull(dishes.clinicId)))
    .limit(1);
  return row !== undefined;
}

export async function hideSharedDish(clinicId: string, dishId: string): Promise<boolean> {
  if (!(await isSharedDish(dishId))) return false;
  await db
    .insert(clinicHiddenDishes)
    .values({ clinicId, dishId })
    .onConflictDoNothing({ target: [clinicHiddenDishes.clinicId, clinicHiddenDishes.dishId] });
  return true;
}

export async function unhideSharedDish(clinicId: string, dishId: string): Promise<boolean> {
  await db
    .delete(clinicHiddenDishes)
    .where(and(eq(clinicHiddenDishes.clinicId, clinicId), eq(clinicHiddenDishes.dishId, dishId)));
  return true;
}
```

- [ ] **Step 4: Run, verify PASS.** `bun test src/features/weekly-plans/catalog-mutations.test.ts`
- [ ] **Step 5: typecheck + lint**, then **commit**: `git add src/features/weekly-plans/catalog-mutations.ts src/features/weekly-plans/catalog-mutations.test.ts && git commit -m "Add clinic dish mutations (create/update/delete/hide/unhide)"`

### Task 3: Custom food + alias mutations

**Files:**
- Modify: `src/features/weekly-plans/catalog-mutations.ts` (append)
- Modify: `src/features/weekly-plans/catalog-mutations.test.ts` (append)

- [ ] **Step 1: Failing tests** — append:

```ts
import { foodAliases } from '@/db/schema';
import { createCustomFood, rememberFoodAlias } from './catalog-mutations';

describe('createCustomFood', () => {
  test('stores a clinic-owned food with null fdc_id and an Arabic alias', async () => {
    const id = await createCustomFood(clinicId, {
      description: 'Village white cheese',
      nameAr: 'جبنة بلدية',
      kcal: 260,
      protein: 18,
      carbs: 2,
      fat: 20,
    });
    expect(id).toBeString();
    const [food] = await db.select().from(foods).where(eq(foods.id, id!));
    expect(food!.clinicId).toBe(clinicId);
    expect(food!.fdcId).toBeNull();
    // The Arabic name it was created under is remembered as an alias.
    const aliases = await db.select().from(foodAliases).where(eq(foodAliases.foodId, id!));
    expect(aliases).toHaveLength(1);
    expect(aliases[0]!.nameAr).toBe('جبنة بلدية');
  });
});

describe('rememberFoodAlias', () => {
  test('is idempotent on (clinic, name)', async () => {
    await rememberFoodAlias(clinicId, foodId, 'دجاج');
    await rememberFoodAlias(clinicId, foodId, 'دجاج');
    expect(await db.select().from(foodAliases).where(eq(foodAliases.clinicId, clinicId))).toHaveLength(1);
  });
});
```

- [ ] **Step 2: FAIL.** `bun test src/features/weekly-plans/catalog-mutations.test.ts`

- [ ] **Step 3: Implement** — append to `catalog-mutations.ts` (add `foodAliases`, `foods` to the `@/db/schema` import):

```ts
import type { CustomFoodInput } from './catalog-schema';

/**
 * Remembers that an Arabic name maps to a library food, for this clinic.
 *
 * Idempotent on (clinic, name): confirming the same match twice is a no-op, so
 * callers can record freely.
 */
export async function rememberFoodAlias(clinicId: string, foodId: string, nameAr: string): Promise<void> {
  await db
    .insert(foodAliases)
    .values({ clinicId, foodId, nameAr })
    .onConflictDoNothing({ target: [foodAliases.clinicId, foodAliases.nameAr] });
}

/**
 * Creates a clinic's own custom food.
 *
 * Numbers are the dietitian's (or an AI estimate she confirmed) — the one place
 * nutrition is entered by hand rather than read from the USDA library. Records
 * the Arabic name it was created under as an alias, so it resolves instantly next
 * time.
 */
export async function createCustomFood(clinicId: string, input: CustomFoodInput): Promise<string | null> {
  return db.transaction(async (tx) => {
    const [food] = await tx
      .insert(foods)
      .values({
        clinicId,
        fdcId: null,
        description: input.description,
        category: 'Clinic custom',
        kcal: input.kcal,
        protein: input.protein,
        carbs: input.carbs,
        fat: input.fat,
      })
      .returning({ id: foods.id });

    if (!food) return null;
    await tx
      .insert(foodAliases)
      .values({ clinicId, foodId: food.id, nameAr: input.nameAr })
      .onConflictDoNothing({ target: [foodAliases.clinicId, foodAliases.nameAr] });
    return food.id;
  });
}
```

- [ ] **Step 4: PASS**, typecheck, lint, **commit**: `git add -u && git commit -m "Add custom food and food alias mutations"`

---

## 2B-2 — AI Arabic→food matching

### Task 4: Food search over the library

**Files:**
- Modify: `src/features/weekly-plans/queries.ts` (add `searchFoods`)
- Modify: `src/features/weekly-plans/queries.test.ts` (append)

**Context:** The food browser was retired, so there is no food search. Add one over `foods`, using `ilike` on `description` (the same escaping `listDishes` uses at `queries.ts:283`). Search the shared library plus this clinic's custom foods (`clinic_id IS NULL OR clinic_id = clinicId`). Reuse `foodColumns` (`queries.ts:69`).

- [ ] **Step 1: Failing test** — append to `queries.test.ts` (`searchFoods` to the `./queries` import, `foods` already imported):

```ts
describe('searchFoods', () => {
  test('finds shared library foods and this clinic own custom foods by description', async () => {
    await db.insert(foods).values([
      { description: 'Chicken breast, roasted', category: 'Poultry', kcal: 165, protein: 31, carbs: 0, fat: 3.6 },
      { description: 'Chicken thigh', category: 'Poultry', kcal: 209, protein: 26, carbs: 0, fat: 10 },
      { description: 'Apple, raw', category: 'Fruit', kcal: 52, protein: 0.3, carbs: 14, fat: 0.2 },
    ]);
    await db.insert(foods).values({
      clinicId,
      fdcId: null,
      description: 'Chicken village style',
      category: 'Clinic custom',
      kcal: 200, protein: 20, carbs: 0, fat: 12,
    });

    const results = await searchFoods(clinicId, 'chicken', 10);
    const descriptions = results.map((f) => f.description);
    expect(descriptions).toContain('Chicken breast, roasted');
    expect(descriptions).toContain('Chicken village style');
    expect(descriptions).not.toContain('Apple, raw');
  });

  test('does not return another clinic custom food', async () => {
    const other = await createTestClinic();
    await db.insert(foods).values({ clinicId: other, fdcId: null, description: 'Chicken secret', category: 'Clinic custom', kcal: 1, protein: 0, carbs: 0, fat: 0 });
    expect((await searchFoods(clinicId, 'chicken secret', 10)).length).toBe(0);
  });
});
```

- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement** — add to `queries.ts` (`ilike`, `or`, `isNull` already imported or add them):

```ts
export type FoodSearchResult = { id: string; description: string } & FoodNutrients;

/**
 * Library food search for the dish editor.
 *
 * Shared USDA foods plus this clinic's own custom foods, matched on description.
 * `ilike '%…%'` with the same escaping `listDishes` uses; 7,793 rows is a few
 * milliseconds of sequential scan, so no index is needed (the table comment says
 * as much).
 */
export async function searchFoods(
  clinicId: string,
  query: string,
  limit = 20,
): Promise<FoodSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const term = `%${trimmed.replace(/[\\%_]/g, '\\$&')}%`;

  return db
    .select(foodColumns)
    .from(foods)
    .where(and(ilike(foods.description, term), or(isNull(foods.clinicId), eq(foods.clinicId, clinicId))))
    .orderBy(asc(foods.description))
    .limit(limit);
}
```

(`FoodNutrients` is imported from `./nutrition`; `foodColumns` already exists. Confirm the import of `FoodNutrients` type exists in `queries.ts` — it is used by `DishDetail`. Add `import { type FoodNutrients } from './nutrition';` if not already imported.)

- [ ] **Step 4: PASS**, then **commit**: `git add src/features/weekly-plans/queries.ts src/features/weekly-plans/queries.test.ts && git commit -m "Add searchFoods for the dish editor"`

### Task 5: The food-translation seam (AI, with a stub)

**Files:**
- Create: `src/features/weekly-plans/food-translate.ts`
- Test: `src/features/weekly-plans/food-translate.test.ts`

**Context:** Mirror `llm.ts` exactly: an interface, an OpenAI `fetch` transport, a deterministic `console` stub, and an env-driven factory. The translator's ONLY job is to turn an Arabic food name into English search keywords — it never returns nutrition. The stub lets everything downstream be tested with no key and no network (same reasoning as `createConsoleTransport` in `llm.ts`).

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, test } from 'bun:test';

import { createStubTranslator } from './food-translate';

describe('stub translator', () => {
  test('echoes the input as keywords, so downstream search is exercised without a network', async () => {
    const translator = createStubTranslator();
    expect(await translator.toKeywords('دجاج مشوي')).toBe('دجاج مشوي');
  });
});
```

- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement** `src/features/weekly-plans/food-translate.ts`:

```ts
/**
 * The seam between food matching and OpenAI — same shape as `llm.ts`.
 *
 * The model translates an Arabic food name into English search keywords and does
 * nothing else: it never emits a nutrition number, so matching stays grounded in
 * the real library. The stub echoes its input, which is enough to exercise the
 * search path in tests and for developers without a key.
 */
export interface FoodTranslator {
  toKeywords(arabicName: string): Promise<string>;
}

export function createStubTranslator(): FoodTranslator {
  return { async toKeywords(arabicName) { return arabicName; } };
}

function createOpenAiTranslator(apiKey: string, model: string): FoodTranslator {
  return {
    async toKeywords(arabicName) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          model,
          temperature: 0,
          messages: [
            {
              role: 'system',
              content:
                'Translate the Arabic food name into 1-4 English keywords for searching a USDA food database. Reply with only the keywords, no punctuation, no explanation.',
            },
            { role: 'user', content: arabicName },
          ],
        }),
      });
      if (!response.ok) throw new Error(`OpenAI translation failed: ${response.status}`);
      const json = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      return json.choices?.[0]?.message?.content?.trim() || arabicName;
    },
  };
}

let cached: FoodTranslator | undefined;

/** Env-driven, like `getLlmTransport`. `LLM_TRANSPORT=console` (or no key) uses the stub. */
export function getFoodTranslator(): FoodTranslator {
  if (cached) return cached;
  const transport = process.env.LLM_TRANSPORT ?? 'openai';
  const apiKey = process.env.OPENAI_API_KEY;
  cached =
    transport === 'console' || !apiKey
      ? createStubTranslator()
      : createOpenAiTranslator(apiKey, process.env.OPENAI_MODEL ?? 'gpt-4o-mini');
  return cached;
}
```

- [ ] **Step 4: PASS**, **commit**: `git add src/features/weekly-plans/food-translate.ts src/features/weekly-plans/food-translate.test.ts && git commit -m "Add food-translation seam with a stub transport"`

### Task 6: The matching orchestration

**Files:**
- Create: `src/features/weekly-plans/food-matching.ts`
- Test: `src/features/weekly-plans/food-matching.test.ts`

**Context:** Ties the pieces together: alias memory first (instant, no AI), then translate + search. Pure orchestration with the translator injected, so tests use the stub. `findFoodMatches(clinicId, arabicName, deps?)` where `deps` defaults to `{ translator: getFoodTranslator() }`.

- [ ] **Step 1: Failing test**

```ts
import { beforeEach, describe, expect, test } from 'bun:test';

import { db } from '@/db';
import { foods } from '@/db/schema';
import { createTestClinic, resetDatabase } from '../../../tests/helpers';

import { rememberFoodAlias } from './catalog-mutations';
import { createStubTranslator } from './food-translate';
import { findFoodMatches } from './food-matching';

let clinicId: string;

beforeEach(async () => {
  await resetDatabase();
  clinicId = await createTestClinic();
});

describe('findFoodMatches', () => {
  test('a remembered alias resolves first, marked as remembered, with no translator call', async () => {
    const [food] = await db
      .insert(foods)
      .values({ description: 'Chicken breast', category: 'Poultry', kcal: 165, protein: 31, carbs: 0, fat: 3.6 })
      .returning({ id: foods.id });
    await rememberFoodAlias(clinicId, food!.id, 'دجاج');

    let called = false;
    const translator = { async toKeywords() { called = true; return 'unused'; } };

    const result = await findFoodMatches(clinicId, 'دجاج', { translator });
    expect(result.source).toBe('alias');
    expect(result.matches[0]!.id).toBe(food!.id);
    expect(called).toBe(false);
  });

  test('falls back to translate + search when no alias exists', async () => {
    await db
      .insert(foods)
      .values({ description: 'Chicken breast', category: 'Poultry', kcal: 165, protein: 31, carbs: 0, fat: 3.6 });

    // Stub translator echoes; use an English term the description contains.
    const result = await findFoodMatches(clinicId, 'chicken', { translator: createStubTranslator() });
    expect(result.source).toBe('search');
    expect(result.matches.map((m) => m.description)).toContain('Chicken breast');
  });

  test('returns no matches (not an error) when nothing is found', async () => {
    const result = await findFoodMatches(clinicId, 'zzzznothing', { translator: createStubTranslator() });
    expect(result.matches).toHaveLength(0);
  });
});
```

- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement** `src/features/weekly-plans/food-matching.ts`:

```ts
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { foodAliases } from '@/db/schema';

import { getFoodTranslator, type FoodTranslator } from './food-translate';
import { searchFoods, type FoodSearchResult } from './queries';

export type FoodMatchResult = {
  /** 'alias' when a remembered name resolved it; 'search' when translate+search did. */
  source: 'alias' | 'search';
  matches: FoodSearchResult[];
};

/**
 * Finds library foods for an Arabic name, cheapest path first.
 *
 * A confirmed alias resolves instantly with no AI call. Otherwise the translator
 * turns the Arabic into English keywords and the library is searched. The
 * translator is injected so tests run against the stub.
 */
export async function findFoodMatches(
  clinicId: string,
  arabicName: string,
  deps: { translator?: FoodTranslator } = {},
): Promise<FoodMatchResult> {
  const name = arabicName.trim();
  if (!name) return { source: 'search', matches: [] };

  const [alias] = await db
    .select({ foodId: foodAliases.foodId })
    .from(foodAliases)
    .where(and(eq(foodAliases.clinicId, clinicId), eq(foodAliases.nameAr, name)))
    .limit(1);

  if (alias) {
    // Resolve the aliased food by its exact description via searchFoods is wrong
    // (name != description); read the row directly instead.
    const matches = await searchFoodsById(clinicId, alias.foodId);
    if (matches.length) return { source: 'alias', matches };
  }

  const translator = deps.translator ?? getFoodTranslator();
  const keywords = await translator.toKeywords(name);
  return { source: 'search', matches: await searchFoods(clinicId, keywords) };
}
```

For the aliased-food lookup, add a tiny helper `searchFoodsById` to `queries.ts` (select `foodColumns` where `foods.id = id` and clinic-visible), returning `FoodSearchResult[]`. Write it in this task and add a one-line test in `queries.test.ts` (`returns the food row by id, or empty for another clinic's`). Keep it symmetric with `searchFoods`.

- [ ] **Step 4: PASS**, typecheck, lint, **commit**: `git add src/features/weekly-plans/food-matching.ts src/features/weekly-plans/food-matching.test.ts src/features/weekly-plans/queries.ts src/features/weekly-plans/queries.test.ts && git commit -m "Add Arabic food-matching orchestration with alias memory"`

---

## 2B-3 — Editor UI + server actions (BROWSER-VERIFIED WITH THE USER)

> These tasks build React screens behind staff login. They follow existing
> patterns (`intake-form.tsx` for a multi-section form with dynamic rows;
> `dishes/page.tsx` + `dish-table.tsx` for the catalog; `actions.ts` for
> `useActionState` server actions). Each task ends with the USER running the dev
> server and confirming behaviour — do not claim these work from typecheck alone.

### Task 7: Server actions for catalog editing

**Files:**
- Create: `src/features/weekly-plans/catalog-actions.ts` (`'use server'`)
- Create: `src/features/weekly-plans/catalog-form-state.ts` (action state types)

- [ ] Actions, each `requireStaffClinic(locale)` first, parse FormData with the Task 1 schemas, call the Task 2/3 mutations, `revalidatePath` the dishes route, and return a typed state (mirror `actions.ts` structure and its `readLocale`/`revalidateBoard` helpers):
  - `createDishAction`, `updateDishAction`, `deleteDishAction`, `hideDishAction`, `unhideDishAction`, `createCustomFoodAction`.
  - A `findFoodMatchesAction(clinicId-scoped)` that takes an Arabic name and returns matches for the picker (or expose a route handler — pick whichever the picker component consumes most simply).
- [ ] typecheck + lint. **Commit.**

### Task 8: The food picker + custom-food dialog (client components)

**Files:**
- Create: `src/features/weekly-plans/components/food-picker.tsx`
- Create: `src/features/weekly-plans/components/custom-food-dialog.tsx`

- [ ] Food picker: an Arabic search box → calls the matching action → shows candidate rows (description + per-100g kcal) → selecting one fills the ingredient's `foodId` and pre-fills `displayNameAr`. A "not found — create custom" affordance opens the custom-food dialog.
- [ ] Custom-food dialog: description + Arabic name + kcal/protein/carbs/fat. An "estimate with AI" button (optional, calls an estimate action) pre-fills the numbers clearly marked as an estimate; the dietitian edits and confirms. On save → `createCustomFoodAction` → returns the new food for selection.
- [ ] **USER browser check:** search in Arabic, confirm matches appear, create a custom food, confirm it becomes selectable. Both languages (RTL/LTR).

### Task 9: The dish editor form + catalog wiring

**Files:**
- Create: `src/features/weekly-plans/components/dish-editor.tsx`
- Modify: `src/app/[locale]/app/dishes/page.tsx` (add "Add dish"; pass edit/hide capability)
- Modify: `src/features/weekly-plans/components/dish-table.tsx` (row actions: edit own / hide-unhide shared)
- Add i18n keys to `src/i18n/messages/{en,ar}.json`.

- [ ] Dish editor: name (ar/en), meal types, manual labels (`tags`), allergens, base-serving label, and a dynamic ingredient list (food picker + grams + optional household measure + optional Arabic name per row). Show **live** nutrition totals and the computed `nutritionCategory` (Phase 2A) as rows change, using the same `dishTotals`/`nutritionCategory` functions. Save via `createDishAction`/`updateDishAction`.
- [ ] Catalog page: own dishes get Edit/Delete; shared dishes get Hide/Unhide; the computed nutrition category shows as a badge (replace any old hand-tagged nutrition display).
- [ ] **USER browser check:** add a dish from library foods, watch calories update live, see the auto category, save, reopen for edit, hide a shared dish and confirm it leaves the catalog and the generator's options; both languages, mobile + desktop.

---

## Self-Review notes

- **Spec coverage:** editable dishes (add/edit/delete/hide) → Tasks 2, 7, 9; custom foods with confirmed/AI-estimated numbers → Tasks 3, 8; Arabic food matching with alias memory → Tasks 4, 5, 6, 8; live calorie calculation + auto nutrition category → Task 9 (reusing 2A's `nutritionCategory` and `dishTotals`); Arabic names + household measures captured → Tasks 1–3, 9 (unblocks Project #1).
- **AI never invents nutrition in a plan:** the translator returns only keywords; the sole AI-suggested numbers are a custom food's estimate, always human-confirmed before save (Task 8).
- **Verification split:** Tasks 1–6 are DB/stub-tested (no browser). Tasks 7–9 require the user's browser/login and say so explicitly.
- **Type consistency:** `ClinicDishInput`/`CustomFoodInput` (Task 1) flow through the mutations (2–3) and actions (7); `FoodSearchResult` (Task 4) flows through matching (6) and the picker (8); `FoodMatchResult.source` is `'alias' | 'search'`.

## After Phase 2B

Return to **Project #1** (grams display): with Arabic ingredient names and household measures now captured, the client portal can show the full "chicken 200g, rice 3 tbsp" per-food list in Arabic, as its spec anticipated.
