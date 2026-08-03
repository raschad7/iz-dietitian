# Weekly Plan Editor — Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the plan board from a swap panel into an editor — drag dishes in from a catalog, move meals between days, add and remove slots, change portions — and show what the client had last week while you do it.

**Architecture:** A pure reducer (`editor-state.ts`) applies every edit to the board in memory; `useOptimistic` renders it while the matching server action persists it. Totals recompute through the same `nutrition.ts` the server uses, so optimistic numbers are exact rather than approximate. `@dnd-kit/core` supplies pointer, touch and keyboard sensors.

**Tech Stack:** Next.js App Router + server actions, `@dnd-kit/core@6.3.1`, Drizzle ORM on PostgreSQL, Zod, next-intl, Bun test.

**Covers spec stages 4–6 of** [`docs/superpowers/specs/2026-08-02-weekly-plan-editor-design.md`](../specs/2026-08-02-weekly-plan-editor-design.md). Stages 1–3 landed in [the foundations plan](2026-08-02-weekly-plan-editor-foundations.md).

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/features/weekly-plans/editor-state.ts` | *Create* — the pure reducer and `nextSlotKey`. The whole of "what does this edit do to the board". |
| `src/features/weekly-plans/editor-state.test.ts` | *Create* — every drag outcome, no browser. |
| `src/features/weekly-plans/editor-mutations.ts` | *Modify* — the six edit writes, all sharing one guard. |
| `src/features/weekly-plans/editor-actions.ts` | *Modify* — their actions. |
| `src/features/weekly-plans/schema.ts` | *Modify* — their input schemas. |
| `src/features/weekly-plans/usage.ts` | *Create* — recent dish use per client, with ordinal labels. |
| `src/features/weekly-plans/usage.test.ts` | *Create* — its window and labelling. |
| `src/features/weekly-plans/queries.ts` | *Modify* — `previousPlanSlots` for the compare view. |
| `src/features/weekly-plans/components/board-dnd.tsx` | *Create* — the DndContext, sensors, and optimistic dispatch. |
| `src/features/weekly-plans/components/dish-catalog.tsx` | *Create* — the Dishes rail tab. |
| `src/features/weekly-plans/components/meal-card.tsx` | *Modify* — droppable, draggable, ghost line, servings stepper. |
| `src/features/weekly-plans/components/day-column.tsx` | *Modify* — the add-meal control. |
| `src/features/weekly-plans/components/plan-board.tsx` | *Modify* — compare toggle, edit-published mode, status region. |
| `src/i18n/messages/{ar,en}.json` | *Modify* — new strings. |

---

## Ordering

Stage 4 is tasks 1–7, stage 5 is task 8, stage 6 is tasks 9–10. Each task leaves the suite green.

---

### Task 1: `nextSlotKey` — allocating a slot on one day

Adding a meal to a single day needs a `slot_key` unique within that day, because the unique index is `(plan_id, day_of_week, slot_key)`.

**Files:**
- Create: `src/features/weekly-plans/editor-state.ts`
- Test: `src/features/weekly-plans/editor-state.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/weekly-plans/editor-state.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';

import { nextSlotKey } from './editor-state';

describe('nextSlotKey', () => {
  test('starts at extra_1 on a day with no added slots', () => {
    expect(nextSlotKey(['breakfast', 'lunch'])).toBe('extra_1');
  });

  test('takes the next free index alongside an existing one', () => {
    expect(nextSlotKey(['breakfast', 'extra_1'])).toBe('extra_2');
  });

  test('reuses a freed index rather than counting', () => {
    // extra_1 was removed. Counting would give extra_2 and collide on nothing,
    // but the keys would drift upward forever across a session of edits.
    expect(nextSlotKey(['breakfast', 'extra_2'])).toBe('extra_1');
  });

  test('ignores keys that are not added slots', () => {
    expect(nextSlotKey(['extra_snack', 'extras', 'extra_'])).toBe('extra_1');
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
bun test src/features/weekly-plans/editor-state.test.ts
```

Expected: FAIL — `Cannot find module './editor-state'`.

- [ ] **Step 3: Write the implementation**

Create `src/features/weekly-plans/editor-state.ts`:

```ts
/**
 * What an edit does to the board, as a pure function.
 *
 * The board renders this through `useOptimistic` while the matching server action
 * persists the same change. Keeping it pure is what makes every drag outcome a unit
 * test with no browser, and it is why the optimistic numbers are exact: totals are
 * recomputed by the same `nutrition.ts` the server uses, over ingredient lists the
 * board already carries.
 */

/** The prefix for a slot added to one day rather than to the client's schedule. */
const ADDED_SLOT = /^extra_(\d+)$/;

/**
 * A free `extra_N` for one day.
 *
 * The lowest unused index, not a count: removing `extra_1` and adding another meal
 * should give `extra_1` back, and counting would walk the keys upward forever
 * across an afternoon of edits.
 */
export function nextSlotKey(existingSlotKeys: readonly string[]): string {
  const taken = new Set<number>();

  for (const key of existingSlotKeys) {
    const match = ADDED_SLOT.exec(key);
    if (match) taken.add(Number(match[1]));
  }

  let index = 1;
  while (taken.has(index)) index += 1;

  return `extra_${index}`;
}
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
bun test src/features/weekly-plans/editor-state.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/weekly-plans/editor-state.ts src/features/weekly-plans/editor-state.test.ts
git commit -m "feat: allocate a slot key for a meal added to one day"
```

---

### Task 2: The edit reducer

**Files:**
- Modify: `src/features/weekly-plans/editor-state.ts`
- Test: `src/features/weekly-plans/editor-state.test.ts`

The edits, as a discriminated union:

```ts
export type BoardEdit =
  | { kind: 'place'; mealId: string; dish: DishDetail; servings: number }
  | { kind: 'servings'; mealId: string; servings: number }
  | { kind: 'clear'; mealId: string }
  | { kind: 'remove'; mealId: string }
  | { kind: 'add'; dayOfWeek: number; label: string; timeOfDay: string; slotKey: string }
  | { kind: 'move'; fromMealId: string; toMealId: string; mode: 'move' | 'copy' };
```

- [ ] **Step 1: Write the failing tests**

Append to `src/features/weekly-plans/editor-state.test.ts` (imports: `applyEdit` from `./editor-state`, `emptyTotals`/`dishTotals` from `./nutrition`, and the `Board` type from `./queries`):

```ts
import { applyEdit } from './editor-state';
import type { Board, BoardMeal } from './queries';
import type { DishDetail } from './nutrition';

/** A dish whose recipe makes 300 kcal per serving, so totals are checkable by hand. */
function dish(id: string): DishDetail {
  return {
    id,
    slug: id,
    nameAr: id,
    nameEn: id,
    mealTypes: ['lunch'],
    tags: [],
    allergenTags: [],
    baseServingLabel: 'حصة',
    isActive: true,
    ingredients: [
      {
        quantityGrams: 100,
        food: {
          id: `food-${id}`,
          description: 'test',
          kcal: 300,
          protein: 10,
          carbs: 20,
          fat: 5,
          fiber: null,
          sugar: null,
          saturatedFat: null,
          sodium: null,
          cholesterol: null,
          calcium: null,
          iron: null,
          potassium: null,
        },
      },
    ],
  };
}

function meal(id: string, overrides: Partial<BoardMeal> = {}): BoardMeal {
  return {
    id,
    slotKey: 'lunch',
    label: 'غداء',
    timeOfDay: '14:00',
    dish: null,
    rationaleAr: null,
    totals: emptyTotals(),
    budgetKcal: 600,
    options: [],
    ...overrides,
  };
}

function board(meals: BoardMeal[]): Board {
  const days = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
    dayOfWeek,
    meals: dayOfWeek === 0 ? meals : [],
    totals: emptyTotals(),
    unfilled: 0,
  }));

  return {
    id: 'plan-1',
    clientId: 'client-1',
    clientName: 'Test',
    weekStartDate: '2026-08-02',
    status: 'draft',
    publishedAt: null,
    weekInstructions: null,
    kcalTargetSnapshot: 1800,
    proteinTargetSnapshot: null,
    goalSnapshot: null,
    generatedBy: 'manual',
    model: null,
    updatedAt: new Date(),
    days,
    totals: emptyTotals(),
    unfilled: 0,
  };
}

describe('applyEdit', () => {
  test('place fills an empty slot and recomputes the totals', () => {
    const next = applyEdit(board([meal('m1')]), {
      kind: 'place',
      mealId: 'm1',
      dish: dish('d1'),
      servings: 2,
    });

    const placed = next.days[0]!.meals[0]!;
    expect(placed.dish?.id).toBe('d1');
    expect(placed.servings ?? placed.dish?.servings).toBe(2);
    expect(placed.totals.kcal.value).toBeCloseTo(600, 6);
    expect(next.days[0]!.totals.kcal.value).toBeCloseTo(600, 6);
    expect(next.totals.kcal.value).toBeCloseTo(600, 6);
    expect(next.unfilled).toBe(0);
  });

  test('place onto a filled slot replaces the dish', () => {
    const start = applyEdit(board([meal('m1')]), {
      kind: 'place',
      mealId: 'm1',
      dish: dish('d1'),
      servings: 1,
    });

    const next = applyEdit(start, { kind: 'place', mealId: 'm1', dish: dish('d2'), servings: 1 });

    expect(next.days[0]!.meals[0]!.dish?.id).toBe('d2');
  });

  test('servings rescales the totals', () => {
    const start = applyEdit(board([meal('m1')]), {
      kind: 'place',
      mealId: 'm1',
      dish: dish('d1'),
      servings: 1,
    });

    const next = applyEdit(start, { kind: 'servings', mealId: 'm1', servings: 1.5 });

    expect(next.days[0]!.meals[0]!.totals.kcal.value).toBeCloseTo(450, 6);
  });

  test('clear empties the slot but keeps it', () => {
    const start = applyEdit(board([meal('m1')]), {
      kind: 'place',
      mealId: 'm1',
      dish: dish('d1'),
      servings: 1,
    });

    const next = applyEdit(start, { kind: 'clear', mealId: 'm1' });

    expect(next.days[0]!.meals).toHaveLength(1);
    expect(next.days[0]!.meals[0]!.dish).toBeNull();
    expect(next.unfilled).toBe(1);
    expect(next.totals.kcal.value).toBe(0);
  });

  test('remove deletes the slot entirely', () => {
    const next = applyEdit(board([meal('m1'), meal('m2', { slotKey: 'dinner' })]), {
      kind: 'remove',
      mealId: 'm1',
    });

    expect(next.days[0]!.meals.map((entry) => entry.id)).toEqual(['m2']);
    // The removed slot is gone, so it is no longer an unfilled gap.
    expect(next.unfilled).toBe(1);
  });

  test('add appends an unbudgeted slot to one day only', () => {
    const next = applyEdit(board([meal('m1')]), {
      kind: 'add',
      dayOfWeek: 0,
      label: 'سناك',
      timeOfDay: '17:00',
      slotKey: 'extra_1',
    });

    const added = next.days[0]!.meals.at(-1)!;
    expect(added.slotKey).toBe('extra_1');
    expect(added.budgetKcal).toBe(0);
    expect(added.dish).toBeNull();
    expect(next.days[1]!.meals).toHaveLength(0);
  });

  test('move copies the dish into the target and empties the source', () => {
    const start = applyEdit(board([meal('m1'), meal('m2', { slotKey: 'dinner' })]), {
      kind: 'place',
      mealId: 'm1',
      dish: dish('d1'),
      servings: 2,
    });

    const next = applyEdit(start, { kind: 'move', fromMealId: 'm1', toMealId: 'm2', mode: 'move' });

    expect(next.days[0]!.meals[0]!.dish).toBeNull();
    expect(next.days[0]!.meals[1]!.dish?.id).toBe('d1');
    // The target keeps its OWN budget — moving a lunch onto dinner must not carry
    // lunch's budget across.
    expect(next.days[0]!.meals[1]!.budgetKcal).toBe(600);
  });

  test('copy leaves the source in place', () => {
    const start = applyEdit(board([meal('m1'), meal('m2', { slotKey: 'dinner' })]), {
      kind: 'place',
      mealId: 'm1',
      dish: dish('d1'),
      servings: 1,
    });

    const next = applyEdit(start, { kind: 'move', fromMealId: 'm1', toMealId: 'm2', mode: 'copy' });

    expect(next.days[0]!.meals[0]!.dish?.id).toBe('d1');
    expect(next.days[0]!.meals[1]!.dish?.id).toBe('d1');
  });

  test('an edit naming a meal that is not on the board changes nothing', () => {
    const start = board([meal('m1')]);
    expect(applyEdit(start, { kind: 'clear', mealId: 'nope' })).toEqual(start);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

```bash
bun test src/features/weekly-plans/editor-state.test.ts
```

Expected: FAIL — `applyEdit is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `src/features/weekly-plans/editor-state.ts`:

```ts
import { combineTotals, dishTotals, emptyTotals, type DishDetail } from './nutrition';
import type { Board, BoardDay, BoardMeal } from './queries';

/** Every edit the board can make, as one closed set. */
export type BoardEdit =
  | { kind: 'place'; mealId: string; dish: DishDetail; servings: number }
  | { kind: 'servings'; mealId: string; servings: number }
  | { kind: 'clear'; mealId: string }
  | { kind: 'remove'; mealId: string }
  | { kind: 'add'; dayOfWeek: number; label: string; timeOfDay: string; slotKey: string }
  | { kind: 'move'; fromMealId: string; toMealId: string; mode: 'move' | 'copy' };

/** Finds a meal anywhere on the board. */
function findMeal(board: Board, mealId: string): BoardMeal | null {
  for (const day of board.days) {
    for (const meal of day.meals) if (meal.id === mealId) return meal;
  }
  return null;
}

/** A meal with a dish and portion, costed. Totals are never carried, always derived. */
function withDish(meal: BoardMeal, dish: DishDetail | null, servings: number): BoardMeal {
  return {
    ...meal,
    dish: dish ? { ...dish, servings } : null,
    // The rationale explained the previous dish. Leaving the model's words under a
    // dish the dietitian chose would misattribute both.
    rationaleAr: dish ? meal.rationaleAr : null,
    totals: dish ? dishTotals(dish.ingredients, servings) : emptyTotals(),
  };
}

/** Recomputes a day's totals and gap count from its meals. */
function recountDay(day: BoardDay): BoardDay {
  return {
    ...day,
    totals: combineTotals(day.meals.map((meal) => meal.totals)),
    unfilled: day.meals.filter((meal) => meal.dish === null).length,
  };
}

/** Recomputes the week from its days. */
function recountBoard(board: Board, days: BoardDay[]): Board {
  const counted = days.map(recountDay);

  return {
    ...board,
    days: counted,
    totals: combineTotals(counted.map((day) => day.totals)),
    unfilled: counted.reduce((sum, day) => sum + day.unfilled, 0),
  };
}

/** Applies `edit` to every meal it matches, leaving the rest untouched. */
function mapMeals(board: Board, map: (meal: BoardMeal) => BoardMeal | null): Board {
  return recountBoard(
    board,
    board.days.map((day) => ({
      ...day,
      meals: day.meals.flatMap((meal) => {
        const next = map(meal);
        return next ? [next] : [];
      }),
    })),
  );
}

/**
 * The board after one edit.
 *
 * Every branch returns a new board rather than mutating, because `useOptimistic`
 * compares by reference. An edit naming a meal the board does not have is a no-op:
 * it means the server state moved under the optimistic one, and the reconciliation
 * that follows is the correct answer.
 */
export function applyEdit(board: Board, edit: BoardEdit): Board {
  switch (edit.kind) {
    case 'place':
      return mapMeals(board, (meal) =>
        meal.id === edit.mealId ? withDish(meal, edit.dish, edit.servings) : meal,
      );

    case 'servings':
      return mapMeals(board, (meal) =>
        meal.id === edit.mealId && meal.dish
          ? withDish(meal, meal.dish, edit.servings)
          : meal,
      );

    case 'clear':
      return mapMeals(board, (meal) => (meal.id === edit.mealId ? withDish(meal, null, 1) : meal));

    case 'remove':
      return mapMeals(board, (meal) => (meal.id === edit.mealId ? null : meal));

    case 'add': {
      const added: BoardMeal = {
        id: `optimistic-${edit.slotKey}-${edit.dayOfWeek}`,
        slotKey: edit.slotKey,
        label: edit.label,
        timeOfDay: edit.timeOfDay,
        dish: null,
        rationaleAr: null,
        totals: emptyTotals(),
        // Unbudgeted. 0 already means "no budget" everywhere in this feature, and
        // recomputing the day's other budgets to make room would rewrite the
        // numbers the rest of the week was generated against.
        budgetKcal: 0,
        options: [],
      };

      return recountBoard(
        board,
        board.days.map((day) =>
          day.dayOfWeek === edit.dayOfWeek ? { ...day, meals: [...day.meals, added] } : day,
        ),
      );
    }

    case 'move': {
      const source = findMeal(board, edit.fromMealId);
      if (!source?.dish) return board;

      const { servings } = source.dish;

      return mapMeals(board, (meal) => {
        // The dish and its portion move; the target's own label, time and budget
        // stay. A lunch dropped on a breakfast slot becomes breakfast at
        // breakfast's budget, which is what the dietitian sees and expects.
        if (meal.id === edit.toMealId) return withDish(meal, source.dish, servings);
        if (meal.id === edit.fromMealId && edit.mode === 'move') return withDish(meal, null, 1);
        return meal;
      });
    }
  }
}
```

- [ ] **Step 4: Run the tests and verify they pass**

```bash
bun test src/features/weekly-plans/editor-state.test.ts
```

Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/weekly-plans/editor-state.ts src/features/weekly-plans/editor-state.test.ts
git commit -m "feat: apply a board edit as a pure function"
```

---

### Task 3: The six edit writes

**Files:**
- Modify: `src/features/weekly-plans/editor-mutations.ts`
- Test: `src/features/weekly-plans/editor-mutations.test.ts`

All six share one guard. `allowPublished` is the stage-5 hook, added now so the guard is written once.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/weekly-plans/editor-mutations.test.ts`. Reuse the file's existing `clinicId`/`clientId` fixtures; add a dish fixture and a plan fixture:

```ts
describe('edit writes', () => {
  test('setServings clamps to the legal range', async () => { /* see step 3 for the API */ });
  test('removeMeal deletes only that slot on that day', async () => {});
  test('addMeal writes an unbudgeted slot', async () => {});
  test('moveMeal copies the dish and clears the source', async () => {});
  test('every write refuses a plan of another clinic', async () => {});
  test('every write refuses an archived plan', async () => {});
  test('every write refuses a published plan unless allowPublished', async () => {});
});
```

Fill each body against the API in step 3 before running.

- [ ] **Step 2: Write the implementation**

Append to `src/features/weekly-plans/editor-mutations.ts`:

```ts
/**
 * The gate in front of every edit.
 *
 * `draft` always; `published` only when the caller says it meant to. `archived`
 * never — an archived plan is a record of what was, and editing it would rewrite
 * history the compare view depends on.
 *
 * In the mutation layer rather than the action layer so the rule cannot be
 * bypassed by a caller that forgets it.
 */
async function editablePlan(
  clinicId: string,
  planId: string,
  allowPublished: boolean,
): Promise<{ id: string; clientId: string } | null> {
  const [plan] = await db
    .select({ id: weeklyPlans.id, clientId: weeklyPlans.clientId, status: weeklyPlans.status })
    .from(weeklyPlans)
    .where(and(eq(weeklyPlans.id, planId), eq(weeklyPlans.clinicId, clinicId)))
    .limit(1);

  if (!plan) return null;
  if (plan.status === 'draft') return plan;
  if (plan.status === 'published' && allowPublished) return plan;

  return null;
}
```

Then `setMealServings`, `clearMeal`, `removeMeal`, `addMeal`, `moveMealDish` — each taking `(clinicId, planId, …, allowPublished)`, each returning `boolean`, each touching `weeklyPlans.updatedAt`.

- [ ] **Step 3: Run the tests, then commit**

```bash
bun test src/features/weekly-plans/editor-mutations.test.ts
git add src/features/weekly-plans/editor-mutations.ts src/features/weekly-plans/editor-mutations.test.ts
git commit -m "feat: add the board's edit writes behind one guard"
```

---

### Tasks 4–10

Detailed steps are written when each is reached — the UI tasks depend on how tasks 1–3 land, and writing their exact markup now would be guessing.

4. **Edit actions and schemas** — one action per write, each returning `PlanActionState`, each revalidating the board and the portal.
5. **`DishCatalog` rail tab** — search, meal-type and tag filters, allergen dishes shown disabled, draggable rows.
6. **`board-dnd.tsx`** — `DndContext` with pointer, touch and keyboard sensors; `useOptimistic` over the board; drop handlers dispatching an edit and firing its action in a transition.
7. **Card and column controls** — droppable cards, servings stepper, add-meal and remove-meal controls.
8. **Published-plan edit mode** — the header toggle, the warning strip, `allowPublished` threaded through the actions.
9. **`usage.ts`** — recent dish use per client, ordinal labels, badges in the catalog.
10. **Compare view** — `previousPlanSlots` query, the header toggle, ghost lines and repeat marking on the cards.
