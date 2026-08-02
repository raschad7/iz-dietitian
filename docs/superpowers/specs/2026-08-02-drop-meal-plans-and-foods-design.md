# Retiring meal plans V1 and the foods browser

**Date:** 2026-08-02
**Status:** Approved
**Branch:** `drop-meal-plans-and-foods`

## Why

Two planning systems have been running side by side since weekly plans landed:

- **Meal plans (V1)** — a hand-built repeating template. The dietitian picks
  individual foods and types gram amounts. No dates, no publish lifecycle.
- **Weekly plans (V2)** — AI-assisted, built from the approved dish catalog for a
  named week, with a draft/published lifecycle and a client-facing portal view.

V2 has fully replaced V1 in practice. The portal already reads V2 only. Keeping
V1 costs a second set of screens, a second set of mutations, a second set of
translations, and a permanent question of which planner a dietitian should open.

This spec retires V1 and the foods browser that served it.

## Scope

**Removed:**

- The `meal_plans`, `meal_plan_meals`, `meal_plan_items` tables and their data.
- The entire `src/features/meal-plans/` folder, except the nutrition module (see
  below).
- The `/app/meal-plans/*` routes.
- The `/app/foods/*` routes and the food browser components.
- The `foods` and `mealPlans` sidebar entries.

**Kept:**

- The `foods` table and `dish_ingredients`. See "The foods table is not the foods
  browser" below — this is the most important decision in the spec.
- `weekly_plans` and the dish catalog, unchanged.
- The nutrition arithmetic, relocated.

## The foods table is not the foods browser

`foods` serves two unrelated consumers:

1. **The foods browser** (`/app/foods`) — a searchable reference screen. Part of
   V1's workflow: you looked a food up, then added it to a meal by hand.
2. **Dish recipes** — `dish_ingredients.food_id → foods.id`. This is where all
   dish nutrition comes from.

The second one is load-bearing for the feature we are keeping. `dishes` stores no
nutrition of its own — not a single macro column. Every calorie the weekly-plan
board, the generation prompt, `similar.ts`, `targets.ts`, and the client portal
display is derived at read time by joining `dish_ingredients` to `foods`
(`weekly-plans/queries.ts:122`).

Dropping the table would leave every dish at zero calories and take the AI
planner down with it. It would also destroy the property that makes the feature
trustworthy: **the model never emits a number.** It returns a dish slug and a
serving multiplier, and the server derives the nutrition from USDA source data.
A model that cannot state a calorie count cannot state a wrong one.

So `foods` stays, as invisible reference data. After this change the word never
appears in the UI, but the table keeps doing its job.

`bun run db:seed:foods` and `data/usda-sr-legacy.ndjson` stay for the same reason.

## Relocating the nutrition module

`src/features/meal-plans/nutrition.ts` holds the shared arithmetic: the per-100 g
unwind, the null-is-not-zero summing rule, the Atwater energy split, and display
rounding. It lives in the V1 folder for historical reasons only.

Nine files outside V1 import it:

| File | Imports |
| --- | --- |
| `weekly-plans/dish-nutrition.ts` | `combineTotals`, `emptyTotals`, `sumNutrients`, types |
| `weekly-plans/queries.ts` | `NutrientTotals` |
| `weekly-plans/components/plan-board.tsx` | `roundForDisplay` |
| `weekly-plans/components/day-column.tsx` | `roundForDisplay` |
| `weekly-plans/components/meal-card.tsx` | `roundForDisplay` |
| `weekly-plans/components/dish-table.tsx` | `roundForDisplay` |
| `weekly-plans/components/meal-detail-panel.tsx` | several |
| `weekly-plans/components/portal-plan.tsx` | `roundForDisplay` |
| `portal/components/today-meals.tsx` | `roundForDisplay` |

**Decision:** the file moves to `src/features/weekly-plans/nutrition.ts` and
`dish-nutrition.ts` merges into it. Weekly plans becomes the sole owner, which
matches the repo rule that logic lives in the feature that uses it. The portal
imports across the boundary, which it already does today.

**The arithmetic itself does not change.** No behaviour is edited during the
move. `nutrition.test.ts` moves with it, unchanged, and must stay green — it is
the proof that the move was mechanical.

`dish-nutrition.test.ts` does not exist today; `dishTotals` and `baseServingKcal`
are exercised indirectly through `similar.test.ts` and `queries.test.ts`. Those
keep covering them after the merge.

## Repointing the surviving UI

Four surfaces link to routes that will not exist.

### Dashboard "needs attention" tile

Today: `countActiveClientsWithoutMealPlan` and `listClientsWithoutMealPlan` count
active clients with zero rows in `meal_plans` — "never had a plan, ever", because
a V1 plan has no end date to lapse.

After: **active clients with no published weekly plan for the current week.**

A weekly plan is dated, so the honest question is finally askable: does this
client have something to eat from *right now*? A client whose plan ended last
Saturday is exactly who a dietitian needs surfaced, and V1 could never express
that.

This makes the count larger and turns it into a recurring weekly signal rather
than a one-time onboarding gap. That is the intended change, not a side effect.

Implementation:

- Add `currentSunday(today = new Date()): string` to `weekly-plans/week.ts` — the
  most recent Sunday on or before today. `nextSunday()` is not reusable here: on
  a Wednesday it returns the *coming* Sunday, which would ask about a week that
  has not started. Both share `formatDateParts` and the local-parts discipline,
  so a plan for the week of the 27th is not read as the 26th in another zone.
- Add `currentSunday` cases to `week.test.ts`: mid-week, on a Sunday (returns
  today), on a Saturday, and across a month boundary.
- Rewrite both dashboard queries against `weekly_plans` with
  `status = 'published'` and `week_start_date = currentSunday()`, scoped to the
  clinic as before.
- Rename the `AttentionReason` member `noMealPlan` → `noWeeklyPlan`, and the
  functions to `countActiveClientsWithoutWeeklyPlan` /
  `listClientsWithoutWeeklyPlan`. `page-data.ts` carries both renames through to
  the page.
- Rename the stat-tile key `clientsWithoutMealPlan` → `clientsWithoutWeeklyPlan`
  in `page-data.ts` and `stat-tiles.tsx`.
- Retranslate three keys, in both locales:
  - `dashboard.attention.reason.noMealPlan` → `noWeeklyPlan`:
    EN "No plan this week", AR "لا توجد خطة لهذا الأسبوع".
  - `dashboard.stats.clientsWithoutMealPlan` → `clientsWithoutWeeklyPlan`:
    EN "Without a plan this week", AR "بلا خطة لهذا الأسبوع".
  - `dashboard.quickActions.newMealPlan` → `weeklyPlans`:
    EN "Weekly plans", AR "الخطط الأسبوعية".

### Client detail page

`ClientPlansCard` (listing V1 plans, from `meal-plans/queries.listPlans`) is
replaced by a card owned by weekly plans that links to that client's board.

The V2 `listPlans(clinicId, clientId)` already returns a client's plans newest
week first, so the card can show the recent weeks rather than a bare link. It
reuses the existing `weeklyPlans.history` / `weeklyPlans.weekOf` /
`weeklyPlans.noPlanYet` keys.

New file: `src/features/weekly-plans/components/client-plans-card.tsx`.

### Dashboard quick action

`/app/meal-plans/new` → `/app/weekly-plans`, relabelled via
`dashboard.quickActions.weeklyPlans`. It stops being a "create" action: weekly
plans are generated per client from the board, so there is no standalone new-plan
form to jump to. It becomes a navigation shortcut, which is what the other quick
actions on that card already are for.

### Client list row action

`client-table.tsx` links to `/app/meal-plans/new?clientId=…` using
`mealPlans.new`. Repointed to `/app/weekly-plans/{clientId}`, labelled from
`nav.weeklyPlans`. The `useTranslations('mealPlans')` call goes with it.

## Translations

Delete the `mealPlans` and `foods` namespaces from `en.json` and `ar.json`, and
the `nav.mealPlans` / `nav.foods` keys.

Two keys are used by files that survive and must be relocated first, or the
delete breaks them:

- `mealPlans.new` — used by `client-table.tsx`. Dropped; that link now uses
  `nav.weeklyPlans`.
- `mealPlans.emptyDay` ("Nothing planned yet." / "لا يوجد شيء مخطّط بعد.") — used
  by the portal's `today-meals.tsx`. Moved to `portal.emptyToday`, keeping the
  wording. It is **not** merged into the existing `weeklyPlans.emptyDay`
  ("No meals" / "لا وجبات"): that is a terse label for a staff board column, and
  the portal is a client-facing surface that should keep the softer sentence.

Both locale files must stay structurally identical.

## Database migration

One generated Drizzle migration dropping, in FK-safe order:

1. `meal_plan_items`
2. `meal_plan_meals`
3. `meal_plans`

Data is discarded — confirmed acceptable; this has not shipped to a production
clinic.

No other table references them, so nothing cascades. `foods` loses its only
remaining referrer besides `dish_ingredients`, which is the intended end state.

Generated with `bun run db:generate`. The snapshot under `drizzle/meta/` is
regenerated by the tool and not hand-edited.

## Seed script

`scripts/seed.ts` currently builds a sample V1 plan via `createPlan`, `addItem`
and `copyDay` from `meal-plans/mutations` (lines 142-202). That block is removed
along with the imports.

It is **not** replaced with a seeded weekly plan. Generating one requires a
nutrition profile with a meal schedule and either a model call or a hand-built
fixture, which is a larger piece of work than this change should carry. Seeding
stops short of a plan; `db:seed:foods` and `db:seed:dishes` still run, so a fresh
database can generate one immediately.

This is a deliberate, stated reduction in what the seed produces.

## Files

**Deleted**

```
src/features/meal-plans/                     (whole folder except nutrition.ts + nutrition.test.ts)
src/app/[locale]/app/meal-plans/             (whole folder)
src/app/[locale]/app/foods/                  (whole folder)
src/db/schema/meal-plans.ts
```

**Moved**

```
src/features/meal-plans/nutrition.ts       → src/features/weekly-plans/nutrition.ts
src/features/meal-plans/nutrition.test.ts  → src/features/weekly-plans/nutrition.test.ts
src/features/weekly-plans/dish-nutrition.ts → merged into the above (file deleted)
```

**Added**

```
src/features/weekly-plans/components/client-plans-card.tsx
drizzle/00XX_<generated>.sql
```

**Edited**

```
src/db/schema/index.ts                       drop the meal-plans export
src/db/schema/foods.ts                       comment points at the moved nutrition module
src/db/schema/dishes.ts                      same
src/db/schema/weekly-plans.ts                header comment no longer contrasts with meal_plans
src/features/weekly-plans/week.ts            + currentSunday
src/features/weekly-plans/week.test.ts       + currentSunday cases
src/features/weekly-plans/queries.ts         import path
src/features/weekly-plans/targets.ts         comment reference
src/features/weekly-plans/schema.ts          comment reference
src/features/weekly-plans/mutations.test.ts  comment reference
src/features/weekly-plans/actions.ts         import path (DishDetail, via dish-nutrition)
src/features/weekly-plans/components/*.tsx   import paths (6 files)
src/features/portal/components/today-meals.tsx  import path + portal.emptyToday
src/features/dashboard/queries.ts            rewrite both attention queries
src/features/dashboard/page-data.ts          renamed query imports, stat + attention keys
src/features/dashboard/components/stat-tiles.tsx   clientsWithoutMealPlan → clientsWithoutWeeklyPlan
src/features/dashboard/components/attention-card.tsx  reason key rename, if referenced
src/features/dashboard/components/quick-actions.tsx   repoint the plan button
src/features/clients/components/client-table.tsx  repoint link, drop mealPlans namespace
src/app/[locale]/app/clients/[clientId]/page.tsx  swap the plans card
src/components/layout/sidebar.tsx            drop two nav entries
src/i18n/messages/en.json                    namespaces + keys
src/i18n/messages/ar.json                    namespaces + keys
scripts/seed.ts                              drop the V1 sample plan
package.json                                 no change (db:seed:foods stays)
```

`dish-nutrition.ts` has exactly two importers — `weekly-plans/queries.ts` and
`weekly-plans/actions.ts` (the latter for the `DishDetail` type only). The merge
changes their import path, not their behaviour. `similar.ts`, `generate.ts` and
`prompt.ts` receive already-computed values and import neither module.

## Order of work

The move must precede the delete, or the tree is broken in between.

1. Move and merge the nutrition module; update all import sites. Tests green.
2. Add `currentSunday` and its tests.
3. Repoint the four UI surfaces onto weekly plans. Tests green.
4. Relocate the two surviving translation keys.
5. Delete the V1 feature folder, routes and schema file.
6. Delete the `mealPlans` / `foods` namespaces and nav keys.
7. Generate and apply the drop migration.
8. Trim the seed script.

Each step leaves the tree compiling. Steps 1-4 are additive or neutral; nothing is
deleted until step 5, by which point nothing points at it.

## Verification

- `bun run lint`
- `bun run typecheck` — the real check here. Every dangling import from a deleted
  module surfaces as a type error, so a clean typecheck is the evidence that the
  removal was complete.
- `bun run test` — `nutrition.test.ts` passing unchanged after the move proves the
  arithmetic was not touched. `week.test.ts` covers the new helper. The weekly-plan
  suites (`generate`, `similar`, `queries`, `mutations`, `prompt`, `targets`) prove
  the dish nutrition path still resolves through `foods`.
- `grep -ri "meal-plans\|mealPlans\|meal_plan" src scripts` returns nothing outside
  migration history and this document.
- Browser check: weekly-plan board renders real calorie numbers (not zeros), the
  meal detail panel still lists dish ingredients, the client portal plan renders,
  the dashboard attention tile counts, and the sidebar shows no Foods or Meal plans
  entry. Arabic and English, mobile and desktop.

The calorie check is the one that matters most: zeros there would mean the
`dish_ingredients → foods` join was collateral damage.

## Out of scope

- Denormalising nutrition onto `dishes`. Considered and rejected: it would make a
  dish opaque, remove the ingredient list from the meal detail panel, and give up
  deriving nutrition from source data.
- Any change to weekly-plan generation, the prompt, or the dish catalog.
- A read-only replacement for the foods browser. If looking a food up proves
  useful on its own, it comes back as its own feature against the table that is
  still there — not as a leftover of V1.
- Seeding a sample weekly plan.
