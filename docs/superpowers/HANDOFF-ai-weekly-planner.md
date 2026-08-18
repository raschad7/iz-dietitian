# Handoff — AI weekly planner: food catalog redesign

Date: 2026-08-16
Branch: `study/ai-weekly-planner`
**Nothing is committed.** All work below is in the working tree only. Commit when
you (and the user) are ready — the user has not asked to commit yet.

## TL;DR

Seven slices are **done and verified by tests/typecheck/lint**. The UI pieces are
**not browser-verified** — staff login blocks the assistant (password entry is
prohibited), and a dev server is already running as the user's own process (PID
20380 on :3000; do not kill it). Two things are still pending for the user: run
the DB seed, and verify the redesigned catalog + editor UI in a browser. One larger
design (plan nutrition snapshots) is **spec'd but not built** and needs a product
decision. Catalog expansion is **stopped** — the user considers it good enough.

## Repo checks (last run, all green)

```bash
bun run typecheck   # exit 0
bun run lint        # exit 0
bun test src/features/weekly-plans/   # 381 pass / 0 fail (single serial run)
```

⚠ The test DB is **not safe for concurrent `bun test` runs** — two runs against the
same DB throw FK errors on shared clinic teardown (`clinic_working_hours_..._fk`).
Symptom looks like a real failure but is just collision; run suites serially.

The catalog expansion (slice 5) changed only `data/dishes.json`; the project's
own `validateDishRecords` reports **0 problems across all 113 dishes**.

Known-unrelated pre-existing failure: `src/features/whatsapp/templates.test.ts`
(a bidi/ICU date assertion) — not touched by this work.

---

## What is DONE (in order)

### Slice 1 — Arabic normalization + duplicate prevention ✅

The catalog used exact-match everywhere, so `أرز`/`ارز`/`أَرزّ` fragmented into
separate foods/aliases. Fixed with a conservative normalizer.

- **`src/features/weekly-plans/arabic-normalize.ts`** — `normalizeArabic()`: folds
  أ/إ/آ/ٱ → ا, strips tashkeel + tatweel, collapses whitespace, lowercases Latin.
  Leaves ة/ى alone on purpose (a false merge hides a real food). Deferred note in
  the module doc: **DB-level normalized uniqueness / race protection is not built**
  (app-level check-then-insert; fine for one dietitian).
- Wired into: `food-matching.ts` (alias lookup normalized), `catalog-mutations.ts`
  (`createCustomFood` dedup — checks aliases → clinic foods → **shared/USDA foods by
  exact description**, so it reuses a global food instead of duplicating;
  `rememberFoodAlias` normalized dedup), `queries.ts` `searchClinicFoods`.
- Tests: `arabic-normalize.test.ts`, `arabic-catalog-search.test.ts` (incl. clinic
  isolation + global-food reuse).

### Slice 2 — Catalog search bug fixes ✅

- **`queries.ts` `listDishes` rewritten** to filter/sort/paginate over
  `loadCatalog(clinicId)` (the correct visible set) instead of an unscoped SQL
  query. Fixes: wrong `total`/`pageCount` (they counted other clinics' + hidden
  dishes) and short/empty pages; adds Arabic-normalized dish search.
- Test: `list-dishes.test.ts`.

### Slice 3 — Catalog row actions UI ✅ (backend tested; UI unverified in browser)

Clinic dishes get Edit/Delete; system dishes are read-only with Hide/Unhide;
ownership is shown; all in one unified catalog. Reuses existing tested backend
actions — no new permission logic.

- Data: `DishDetail.clinicId` (`nutrition.ts`) selected in `loadCatalog` +
  `loadDishesByIds`; `getClinicDishForEdit` (owner-scoped edit payload);
  `listDishes` gains `includeHidden` + per-item `hidden`; `loadDishForEditAction`
  in `catalog-actions.ts`.
- UI: `DishEditor` edit mode (preloads, submits `updateDishAction`);
  **`components/dish-row-actions.tsx`** (new — Edit dialog, Delete via ConfirmDialog,
  Hide/Unhide dropdown, all calling existing actions); `dish-table.tsx` (ownership
  badge grey=system / olive=my dish, actions column, dimmed hidden rows);
  `dish-filters.tsx` ("Show hidden" toggle); `dish-pagination.tsx` (threads `hidden`).
- Test: `catalog-read.test.ts`. i18n: `dishes.rowActions`, `dishes.ownership`,
  `dishEditor.editor.editTitle/saveChanges`.
- **Not done here:** there is no "Add to plan" button on `/app/dishes` — deliberate
  (no plan context on that page; add-to-plan lives in the plan board's catalog).

### Slice 4 — Tag taxonomy cleanup ✅

One source of truth for nutrition; only practical tags are manual.

- **Kept (manual/practical):** `economical`, `quick`, `easy_prep`, `no_cook`,
  `portable`, `filling`, `local`, `vegetarian`.
- **Removed:** `high_protein` (now **computed only** via `nutritionCategory()`),
  `diabetic_friendly` (medical), `cheap` (→ `economical`).
- Enforced everywhere: `schema.ts` `DISH_TAGS`; `catalog-schema.ts`
  (`tags: z.enum(DISH_TAGS)` rejects removed/unknown); `scripts/seed-dishes.ts`
  (`validateDishRecords`, now exported, rejects deprecated/unknown tags);
  `dish-editor.tsx`; `meal-tag-tone.ts` + `globals.css` (accent tokens);
  `catalog-filter.ts` (computed `nutrition` filter) + `CatalogEntry.nutritionCategory`
  (`queries.ts` `listCatalogForBoard`); `dish-catalog.tsx` (computed "High protein"
  filter chip); `prompt.ts` (practical `tags` and a separate computed `nutrition`
  column); i18n en+ar; `data/dishes.json` migrated.
- Tests: `catalog-schema.test.ts`, `catalog-filter.test.ts` (computed high-protein),
  `seed-dishes-validation.test.ts`, `prompt.test.ts` (tags vs nutrition separation).

### Slice 5 — Curated catalog expansion ✅ (data only)

- **`data/dishes.json`: 76 → 113 dishes (+37).** Palestinian/Levantine 20, common
  dietitian meals 14, simple combinations 3.
- All reuse existing USDA ingredients (0 invented); every `fdcId`/`note` resolves
  against `data/usda-sr-legacy.ndjson`; `validateDishRecords` → 0 problems.
- **Missing local ingredients (flagged, not faked):** freekeh (فريكة), sumac
  (سماق), jameed (جميد) — dishes needing them were skipped (mansaf, freekeh dishes;
  musakhan is modeled without sumac, whose macros are negligible).
- **Suggested aliases** (for the existing `food_aliases` runtime mechanism — no
  seed exists for aliases): أرز/رز, دجاج/جاج, لبن/زبادي, بندورة/طماطم, بطاطا/بطاطس,
  كوسا/كوسى.

### Slice 6 — Ingredient measurement units + Add/Edit Dish UX ✅ (logic tested; UI unverified in browser)

The dietitian now works in human units — `[2] [pieces ▼]`, `[1] [cup ▼]`,
`[1] [tbsp ▼]`, `[150] [g ▼]` — and the system converts to grams internally.
**Nutrition still runs on grams via `dishTotals` — one calculation path, unchanged.**

- **`ingredient-units.ts`** (new, pure, no DB/React) — `deriveUnitOptions(food)`
  turns a food's single USDA `portionGrams`/`portionLabel` into a short sensible
  menu, each unit carrying grams-per-unit; always ends in grams. `rowGrams`,
  `defaultUnitKey`, `findUnit`, `resolveSavedRow` (exact-grams reload). Rules: never
  invents a conversion (fractions = arithmetic on the real cup weight; tsp = tbsp/3);
  **meat/poultry/fish/seafood = grams-only** by product decision even when USDA has a
  cup; weight-only portions ("1 oz") and no-portion foods fall back to grams.
  `ingredient-units.test.ts` — 15 tests (piece/cup/tbsp→g, grams fallback, meat
  suppression, wrong-unit-not-offered, quantity/unit change grams, saved round-trip).
- **No schema change.** Reused the previously **write-only** `dish_ingredients.
  householdLabel` (now the unit key) + `householdGrams` (grams-per-unit) to remember
  the chosen unit for exact round-trip. Added `category`/`portionGrams`/`portionLabel`
  to `foodColumns` + `FoodSearchResult` (`queries.ts`) so the picker carries them.
- **`dish-editor.tsx`** — ingredient row collapsed to `[qty] [unit ▼]` + live per-row
  kcal + remove. **Removed** the client-facing-name (`displayNameAr`) and manual
  household-grams inputs — nothing rendered them to a client; they only bloated the row.
  DB columns kept. i18n: `dishEditor.editor.units.*` + `amount`/`unitAria`/`rowKcal`
  (en + ar); removed the now-unused grams/household/displayName editor keys.
- **Smart default** = the food's natural unit (egg→piece, rice→cup, oil→tbsp,
  bread→slice, chicken→g); fresh pick starts household units at qty 1, grams blank.

### Slice 7 — Catalog + Add/Edit UX redesign ✅ (logic tested; UI unverified in browser)

A frontend/UX restructuring of `/app/dishes` and the dish editor. **Backend is
additive-only** — same dishes/foods/ingredients/units/nutrition/actions.

- **Catalog page** is a card grid, not a wide table. `dish-table.tsx` **deleted**,
  replaced by **`dish-list.tsx`**: each card is Arabic name → English (secondary) →
  meal category → kcal + protein → a few tags → ownership → `⋮`. **No ingredient
  column** — raw USDA names never appear in browsing. The whole card is a stretched
  button that opens the detail drawer; the `⋮` menu (`dish-row-actions.tsx`, now
  menu-only) re-enables pointer events above it.
- **`dish-details.tsx`** (new) — a `Sheet` drawer: macros, meal/tags/allergens, and
  the recipe with each line in its saved unit ("1 كوب", "150 غرام") via
  `resolveSavedRow`. Clinic dishes show **Edit** (delegated up so one editor dialog
  serves both the card menu and the drawer).
- **`dish-filters.tsx`** — search + a meal-category pill row + a tag/high-protein pill
  row (all URL params; high-protein is the computed category, never a tag).
- **Editor** (`dish-editor.tsx`) reordered per spec: name → **ingredients (hero)** →
  compact `NutritionSummary` → meal type → practical tags → collapsible **Additional
  details** (English name, allergens, base serving). **App validation** replaces native
  `required` (no browser bubble). Choice groups + collapsed fields post from state via
  **hidden inputs**, so a collapsed section still submits.
- **`food-picker.tsx`** — ONE unified search (`searchIngredientsAction`). No
  library/USDA toggle, one loading state, empty/no-result states, single "add new"
  escape hatch. **`custom-food-dialog.tsx`** minimal, English optional/secondary.
- **Backend (additive):** `nameEn` + custom-food `description` now **optional**
  (default `''`, stored to the NOT NULL columns; mutation falls custom `description`
  back to the Arabic name). `listDishes` gains `tags` + `highProtein` filtering
  (in-memory over the already-loaded catalog). New `getDishDetailForClinic` (any
  clinic-visible dish, with household units) and `searchIngredients` (merge
  clinic→shared→translated, dedup by food id) + actions `loadDishDetailAction` /
  `searchIngredientsAction`. **No schema/migration change.**
- **Tests:** `ingredient-search.test.ts` (merge dedup/priority), optional-name cases
  in `catalog-schema.test.ts`. No React render harness in the repo, so component
  rendering is browser-verify only.

---

## PENDING — for the user / next session

1. **Run the DB seed** to apply slices 4 + 5 to the database (the DB still holds
   the old tags and 76 dishes until this runs):
   ```bash
   bun run db:seed:dishes    # idempotent upsert-by-slug; needs foods seeded first
   ```
   Not run here — the user asked not to run the production write step.

2. **Browser-verify the redesigned catalog + editor** (assistant blocked by auth —
   the route redirects to sign-in; the module graph compiles clean, but the rendered
   UI is unverified). Log in with the seeded dev staff account (`scripts/seed.ts`,
   `STAFF_EMAIL` / password `clinic-dev-password`) and check on `/app/dishes`:
   - **Catalog cards:** scan/search; meal-category + tag + high-protein pill filters;
     ownership badges; a card click opens the **detail drawer** (macros + ingredients
     in saved units); the `⋮` menu does NOT open the drawer.
   - **Detail drawer:** clinic dish shows Edit → opens the editor; system dish is
     read-only. Ingredients read "1 كوب" / "150 غرام" (grams fallback for seeded system
     dishes, which store no units yet).
   - **Add/Edit editor:** order is name → ingredients → nutrition → meal type → tags →
     collapsible details. Empty name shows the app error (no browser bubble). One
     ingredient search (no USDA toggle). Unit dropdown per food (egg→piece/g,
     rice→cup/½/¼/g, oil→tbsp/tsp/g, chicken→g). Save with **no English name**. Reopen
     a clinic dish → units + quantities reload, grams unchanged. Custom ingredient →
     add → auto-selected → nutrition updates.
   - **Interaction risks to watch** (couldn't test): the stretched-button card vs `⋮`
     pointer-events; the collapsible chevron rotation (`data-panel-open`); allergens
     inside the collapsed "Additional details" still submitting (they post via hidden
     inputs, so should).
   - Check Arabic RTL + English LTR, desktop + mobile, long names / long ingredient
     lists.

## OPEN DECISION — plan nutrition snapshots (spec'd, NOT built)

Spec: **`docs/superpowers/specs/2026-08-16-plan-nutrition-snapshots-design.md`**.

Problem: plans store `dishId + servings` and recompute nutrition live, so editing a
clinic dish/custom food now silently changes already-published/archived patient
plans. The spec proposes a `nutrition_snapshot` jsonb on `weekly_plan_meals`
(+ options), frozen at publish. **One product decision blocks implementation:**
published plans **immutable** (edit via unpublish→republish; smallest) vs **keep
in-place published edits** (re-snapshot per touched meal). Nutrition-only snapshot;
recipe/ingredient-composition versioning is explicitly deferred.

## Deferred (do not build without asking)

- DB-level normalized-unique constraint for foods/aliases (race protection).
- Serving-unit architecture / named dish portions (small/medium/large).
- Recipe versioning; medical rule engine; system-dish forking; real-time pricing.
- Freekeh/sumac/jameed ingredients (source real nutrition first).

## How to run / verify

- Dev server: `bun run dev` (Next.js). **A dev server is already running (user's,
  PID 20380 on :3000) — Next enforces one instance; don't kill it.**
- Checks: `bun run typecheck`, `bun run lint`, `bun run test` (test DB via
  `.env.test.local`).
- USDA source for authoring: `data/usda-sr-legacy.ndjson` (7,793 SR-Legacy foods,
  `#` header line then one JSON food per line). The catalog's `foods` table is
  seeded from exactly this file, so an fdcId present here is present in the DB.

## Conventions (unchanged)

- Business logic in `src/features/<feature>/`; routes compose. Staff writes scoped
  via `requireStaffClinic()`; mutations take `clinicId` first, return false/null on
  a scope miss.
- Nutrition is always computed from `foods`, never stored on a dish or typed by the
  AI. The model emits only a dish slug + serving multiplier, resolved to a UUID
  server-side.
- UI: reuse `src/components/ui/*`, semantic tokens (no raw hex — lint-enforced),
  logical props (ms/me/ps/pe), RTL + LTR, mobile + desktop.
- TDD with `bun:test`; end commit messages with the
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.
- `data/dishes.json` is CRLF with a `$comment` header; keep formatting when editing.
