# Weekly-plan nutrition snapshots: freeze what was prescribed

Date: 2026-08-16
Status: Design proposal, awaiting one product decision (see §Decision 2)
Branch: study/ai-weekly-planner

## The problem

A weekly plan stores `dishId + servings` per meal and **no nutrition**. Every
calorie and macro is recomputed live at read time
(`assembleBoard` → `loadDishesByIds` → `dishTotals`, `queries.ts`). This was
safe while the catalog was read-only seed data.

Phase 2B changed that. `updateClinicDish` and `createCustomFood`
(`catalog-mutations.ts`) now let a clinic edit dish recipes and custom-food
numbers. Because nutrition is live, **editing a food or recipe silently rewrites
every plan that references it — including published plans a patient is already
following and archived plans that are supposed to be the record of what was
prescribed.**

`weekly_plans` already snapshots the *targets* (`kcalTargetSnapshot`,
`proteinTargetSnapshot`, `goalSnapshot`) and `weekly_plan_meals` snapshots
`budgetKcal`, `label`, `timeOfDay`. The pattern exists; it was never extended to
the meal's actual nutrition.

## Lifecycle (as built)

| Stage | Code | What is stored |
|---|---|---|
| Draft created | `createPlanFromGeneration`, `createPlanFromSkeleton` | plan row (targets snapshot); meals = `dishId + servings + budgetKcal`; **no nutrition** |
| Draft edited | `placeDish`, `setMealServings`, `swapMealDish`, `clearMeal`, `moveMealDish`, `addMeal`, `replaceMeals` | only `dishId`/`servings` change |
| **Publish (= assign)** | `publishPlan` | archives prior published for client+week → `status='published'`. **Flips status only; freezes no nutrition.** |
| Published edited in place | same editor mutations, `allowPublished=true` | writes straight to the live plan |
| Patient view | `getPublishedBoard` → `assembleBoard` | reads meals, loads **current** recipe, computes `dishTotals` **live** |
| Unpublish / republish | `unpublishPlan` → draft; publish archives old | `archived` is never editable; archived plans always passed through publish |

The defect: **publish is the clinical "I prescribe this" moment and it freezes
nothing about the food.**

## Decision 1 — where the snapshot is created

**At publish, in `publishPlan`.** A draft is a working copy; computing it live is
correct (the dietitian wants current numbers while building). Every archived plan
was published first. So publish is the single moment worth freezing, and the
snapshot becomes single-site.

## Decision 2 — should published plans be immutable? (product decision)

**Recommended: yes, immutable in composition.** To change a published plan:
`unpublish → edit as draft → republish`. Rationale:

- Snapshot-writing stays in exactly one place (`publishPlan`).
- Matches existing philosophy: `archived` is never editable; editing published is
  already an opt-in "deliberate act" (`editablePlan`, `allowPublished`).
- `unpublishPlan` already removes patient access instantly, so "patient is
  mid-follow" is already handled.

Cost: a quick fix on a live plan takes two extra clicks and the patient briefly
has no plan for that week.

**Fallback if in-place published edits must stay:** each published-plan mutation
calls a single-meal helper `snapshotMeal(tx, mealId)` on the meal it touched
(`clearMeal`/`removeMeal` → snapshot null). Preserves current UX; costs a helper
call in ~6 functions.

## Decision 3 — editing a published plan

- Immutable (recommended): the `allowPublished=true` path is retired; the "Edit
  published" control becomes "Unpublish to edit". Republish re-runs the snapshot.
- Fallback: per-meal re-snapshot as above.

## Decision 4 — smallest schema / write / read changes

### Schema — one nullable jsonb column

```
weekly_plan_meals.nutrition_snapshot   jsonb   null
```

- `null` = not frozen, compute live (every draft).
- Non-null = the frozen `NutrientTotals` **plus total grams** — the exact shape
  `assembleBoard` already produces, so the reader needs no reshaping and the
  historical weight ("≈ 445 g", `dishGrams`) stays consistent with the frozen
  calories.
- One jsonb column beats 4–8 `real` columns: smaller migration, full fidelity
  (all 12 `NUTRIENT_KEYS` + their `unmeasured` counts, which the meal detail panel
  shows), nothing to extend later.
- Optional, same column on `weekly_plan_meal_options` for frozen alternatives —
  same helper, safe to defer.

### Write — one helper, one call site

- `snapshotPlanMeals(tx, planId)`: load each meal's dish + servings, `dishTotals`,
  write the blob. Reuses `loadDishesByIds` + `dishTotals` (both pure; no import
  cycle — `queries.ts` does not import `mutations.ts`).
- Call it inside `publishPlan`'s transaction, right after `status='published'`.
- Fallback option only: a single-meal variant at the end of published-edit
  mutations.

### Read — one branch in `assembleBoard`

```
totals = (plan.status !== 'draft' && meal.nutrition_snapshot)
           ? meal.nutrition_snapshot                       // frozen
           : dishTotals(dish.ingredients, meal.servings)   // live (drafts)
```

Day and plan totals roll up from meal totals, so they inherit this automatically.
The one branch serves `getBoard`, `getLatestBoard`, and `getPublishedBoard`
correctly (draft → live, published/archived → frozen).

### Backfill

A data migration snapshots existing `published` + `archived` plans from today's
recipes. Honest limit: for a plan whose recipe already drifted, this freezes the
current value, not the original (unrecoverable). It stops drift from that point.

## Nutrition-only snapshots vs historical ingredient display (versioning deferred)

We freeze **numbers, not the ingredient list.** `dish_ingredients` is still
rendered live. So on an old plan after a recipe change (rice 180 g → 160 g):

- Frozen total: 600 kcal ✅ (as prescribed)
- Live breakdown: rice 160 g + oil 10 g… now sums to 585 kcal ❌

Header total and itemization disagree. Since recipe versioning is **out of scope**,
the historical view must not present a live itemization as the prescription. Rule
for published/archived plans:

- Show frozen totals as authoritative.
- Do **not** show a live per-ingredient breakdown as "the prescription" — hide it
  on historical plans, or label it clearly "current recipe — may differ from when
  prescribed."

Consequence for **Project #1** (per-food Arabic breakdown the patient sees):
accurate on a draft/just-published plan; can drift on an older archived plan. A
faithful historical breakdown needs recipe-composition snapshots — the versioning
work, deliberately deferred. The nutrition-only snapshot is the correct MVP: the
**total** is trustworthy forever, the **itemization** is a known, bounded,
clearly-labelled gap.

Adherence is untouched: `weekly_plan_meal_completions` / `recomputeDayAdherence`
count completed meals, not calories.

## Files that change

- `src/db/schema/weekly-plans.ts` — add `nutrition_snapshot` (+ optional on options)
- new Drizzle migration (+ backfill)
- `src/features/weekly-plans/mutations.ts` — `snapshotPlanMeals`, call in `publishPlan`
  (immutable path); or per-meal helper wired into published edits (fallback path)
- `src/features/weekly-plans/queries.ts` — the read branch in `assembleBoard`
- `src/features/weekly-plans/nutrition.ts` — a serializer for the blob if the stored
  shape needs a type guard on read
- UI: historical plans stop showing (or relabel) the live ingredient breakdown

## Open question

Decision 2: immutable published plans (recommended, smallest) vs keep in-place
published edits (fallback, ~6 helper calls). This is the only branch that changes
the shape of the work.
```

