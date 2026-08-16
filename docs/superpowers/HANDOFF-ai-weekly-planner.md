# Handoff — AI weekly planner improvements

Date: 2026-08-16
Branch: `study/ai-weekly-planner` (branched from `main` at `b797c5b0`)
Nothing merged yet. Working tree is clean except a pre-existing unrelated
`.claude/settings.json` modification (leave it alone; never stage it).

## What this is

Three related improvements to the AI weekly-planner feature
(`src/features/weekly-plans/`), driven by dietitian feedback. Each has a spec in
`docs/superpowers/specs/` and a plan in `docs/superpowers/plans/`.

The user prefers **simple, plain-language explanations** (English is not their first
language). Keep questions concrete and give examples.

## The mental model (agreed with the user)

Two layers: **foods → dishes → catalog → AI plan.**
- **Foods** = ingredients with calories. Two sources: the built-in **USDA library**
  (shared, English, read-only) and the clinic's **own food library** (the dietitian
  adds these: Arabic name + calories per 100g).
- **A dish** = a name + a list of foods with grams (chicken 200g + rice 150g). The
  dish stores **no calories** — they are summed from its foods at read time.
- **Dish catalog** = all dishes (built-in + the clinic's own).
- **AI weekly plan** = picks dishes from the catalog.

### Design decisions the user cares about (do not violate)
- **The AI never invents nutrition numbers.** They always come from real food rows.
  The AI is only a *translator/matcher*. The single exception: a custom food's
  AI-estimated numbers, which the dietitian must confirm (this estimate button is
  NOT built yet — currently she types the numbers).
- **Show real grams, never "portions."** (Project #1, spec only, not built.)
- Custom food entry is **per 100g**; **grams only** for now (spoon/household
  measures deferred); keep the USDA + AI search as a **secondary** option, the
  clinic's own library is primary.
- **Add Dish is a dialog**, not a full page.

## Status of the three projects

### Project #3 — dynamic calorie split — DONE ✅
The client intake meal-schedule editor now shows a live shares total and a
"balance to 100%" button. Fully built and tested.
- Spec: `docs/superpowers/specs/2026-08-15-dynamic-calorie-split-design.md`
- Plan: `docs/superpowers/plans/2026-08-15-dynamic-calorie-split.md`
- Code: `src/features/clients/meal-split.ts` (+ test), `intake-form.tsx`
  (`MealScheduleField`), i18n key `clients.intake.balanceShares`.
- Commits: `144493d`, `abccd04`, `851f811`.

### Project #2 — editable dish catalog — backend DONE ✅, UI IN PROGRESS ⚠️
- Spec: `docs/superpowers/specs/2026-08-15-editable-dish-catalog-design.md`
- Plans: `.../plans/2026-08-16-editable-dish-catalog-phase-2a.md` and
  `.../2026-08-16-editable-dish-catalog-phase-2b.md`

**Phase 2A (foundation) — DONE, test-DB verified.** Commits `cb01581`, `8963f6d`,
`91e8246`.
- `nutritionCategory(totals)` in `nutrition.ts` — auto computes one label
  (high_protein / high_carb / high_fat / balanced) from the recipe.
- Schema (migration `0025`): `dishes.clinicId`, `clinic_hidden_dishes`,
  `dish_ingredients.{display_name_ar, household_label, household_grams}`,
  `foods.clinicId`, nullable `foods.fdcId`, `food_aliases`.
- `loadCatalog(clinicId, allergens?)` now returns shared-not-hidden + clinic-own.

**Phase 2B backend — DONE, test-DB verified.** Commits `6ceb91e`, `ea03dd5`,
`931168a`, `7a5bed8`, `bfc325c`, `5ed6988`, `ca55a6e`, `90ef4f8`, plus food-library
extension `db07ab2`, `27f1e2b`, `48b3dde`.
- `catalog-schema.ts` — zod input schemas (`clinicDishInputSchema`,
  `customFoodInputSchema`).
- `catalog-mutations.ts` — `createClinicDish`, `updateClinicDish`,
  `deleteClinicDish` (returns `'deleted' | 'not_found' | 'in_use'`),
  `hideSharedDish`, `unhideSharedDish`, `createCustomFood` (stores `nameAr`),
  `rememberFoodAlias`.
- `queries.ts` — `searchFoods`, `searchFoodsById`, `listClinicFoods`,
  `searchClinicFoods` (clinic's own foods, Arabic search, no AI). `foodColumns`/
  `FoodSearchResult` now include `nameAr`.
- `food-translate.ts` — the AI translator seam (stub + OpenAI, degrades to raw name
  on failure). `food-matching.ts` — `findFoodMatches` (alias memory first, then
  translate+search).
- Migration `0026`: `foods.name_ar`.

**Phase 2B UI — IN PROGRESS, NOT VERIFIED IN A BROWSER.** Commits `2ef4b51`,
`404a716`, `4c70812`, `2171590`, `917f1d8`.
- `catalog-actions.ts` — server actions: form actions
  `createDishAction`/`updateDishAction`/`deleteDishAction`/`hideDishAction`/
  `unhideDishAction`; imperative data actions `searchFoodMatchesAction`,
  `searchClinicFoodsAction`, `createCustomFoodAction`. State in
  `catalog-form-state.ts`.
- `components/food-picker.tsx` — searches the clinic library first (plain Arabic,
  debounced), USDA behind a collapsible, inline "add a new food".
- `components/custom-food-dialog.tsx` — create a custom food (per-100g numbers).
- `components/dish-editor.tsx` — the dish form: name, meal types/labels/allergens,
  dynamic ingredient rows (each uses `FoodPicker`), **live** kcal/macros via
  `dishTotals` + the auto `nutritionCategory` badge. Submits `createDishAction`.
- `components/dish-dialog.tsx` — hosts the editor in a Dialog; "Add dish" trigger on
  `app/[locale]/app/dishes/page.tsx`. The old `/dishes/new` route was deleted.
- Last fix (`917f1d8`): removed **nested `<form>` elements** inside `FoodPicker`
  (it renders inside the dish `<form>`; nested forms are invalid HTML and broke the
  search / could submit the dish on Enter). This likely fixes the "search not
  working" the user reported — NEEDS BROWSER RE-TEST.

### Project #1 — grams instead of "portions" — SPEC ONLY, not built
- Spec: `docs/superpowers/specs/2026-08-15-weekly-plan-serving-grams-design.md`
- Plan exists only implicitly; write a plan when starting. Its full client-facing
  per-food Arabic list depends on Project #2 capturing Arabic names (which the
  backend now does).

## The core blocker (read this)

The dish-editor screens live behind staff login. This assistant **cannot type a
password** (safety rule) and so **cannot run/see the authenticated UI**. Every UI
piece above is typecheck- and lint-clean but **not confirmed working in a browser**.
The user was mid-testing and reported: "search not working", "adding ingredients not
working", UX is bad. The nested-form bug (`917f1d8`) is the most recent concrete fix.

**To continue effectively, the next session should get the app testable.** Options:
- Ask the user to log in (seeded dev staff account exists — see `scripts/seed.ts`,
  `STAFF_EMAIL` / password `clinic-dev-password`) and report exactly what happens /
  paste any browser error overlay text or dev-server terminal errors.
- Or verify each screen by reading + reasoning, as done for the nested-form bug.

## Immediate next steps (recommended order)

1. **Confirm the search/add works now** after `917f1d8` (needs the user's browser).
   Get concrete feedback: does the food box show library results? does clicking a
   result add it to the row? does "add a new food" work?
2. **Build the Food Library screen** (Phase 2B, still missing): a page/section under
   Dishes to list/add/edit/delete the clinic's own foods, so the dietitian populates
   her library directly instead of only through a dish. Backend ready
   (`listClinicFoods`, `createCustomFood`; add update/delete-food mutations).
3. **Catalog edit/hide** (Phase 2B plan task 9b): row actions on `dish-table.tsx` —
   Edit own dishes (reopen editor in edit mode via `updateDishAction`), Hide/Unhide
   shared dishes (`hideDishAction`/`unhideDishAction`). Edit mode needs the editor to
   accept an existing dish's values.
4. **Project #1 (grams display)** once the above lands.
5. Deferred niceties: household/spoon measures; the AI "estimate" button in the
   custom-food dialog.

## How to run / verify

- Dev server: use the browser preview tool with launch config `dev` (Next.js on
  :3000), or `bun run dev`. Auth redirects to sign-in.
- Checks: `bun run typecheck`, `bun run lint`, `bun run test`. The test DB is
  configured via `.env.test.local` and DB tests run (backend work IS covered).
- **Known unrelated failing test:** `src/features/whatsapp/templates.test.ts` (a
  bidi/ICU date-format assertion) fails independently of this work — last edited
  2026-08-11, before this branch. Full suite is otherwise green (1150 pass / 1 fail).
- Migrations: `bun run db:generate` then `bun run db:migrate` (dev) and
  `bun run db:migrate:test` (test DB). Never hand-edit generated snapshots.

## Conventions to follow (from the repo)

- Business logic in `src/features/<feature>/`; route files only compose.
- Staff reads/writes scoped to `requireStaffClinic()`'s clinic; mutations take
  `clinicId` first, resolve ids against it, return `false`/null on a scope miss.
- UI: reuse `src/components/ui/*` (see `docs/design-system.md`), semantic tokens (no
  raw hex — lint-enforced), logical direction props (ms/me/ps/pe), `<Icon>` from the
  registry, `Field`/`FieldError`, RTL + LTR, mobile + desktop.
- TDD with `bun:test`; frequent small commits; end commit messages with the
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.
- Execution style used so far: subagent-driven (implementer + spec review + quality
  review per task) for backend; UI was built via briefed subagents but is the part
  that needs browser verification.
