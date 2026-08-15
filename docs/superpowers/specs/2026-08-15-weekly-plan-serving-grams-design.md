# Weekly plan serving sizes: show grams instead of "portions"

Date: 2026-08-15
Status: Approved, ready for planning
Branch: study/ai-weekly-planner

## The problem

A planned meal shows its size as a serving multiplier — "×1.5 حصة واحدة"
(`portal-meal-card.tsx:255`, `meal-detail-panel.tsx:310`). Nobody understands
what "1.5 portions" means. The dietitian works in real amounts: "200g chicken",
and for staples like rice she uses household measures ("3 tablespoons"). The
current display gives the client no amount they can act on.

## The goal

Replace the abstract "×N portions" wording with **real grams**, using numbers the
app already stores. No new data is typed in, and no database column changes.

## Scope

This is the first of three related projects. It is deliberately kept to what is
cleanly derivable from existing data.

### In scope (this project)

Show grams everywhere a serving size is displayed, on all three surfaces:

1. **Dietitian's meal detail panel** (`meal-detail-panel.tsx`)
   - Keep the +/− stepper — it is how she makes a meal bigger or smaller. It stays
     the edit control.
   - Replace the "×1.5 حصة واحدة" read-out with the real result: the dish's total
     grams at the chosen serving, e.g. "≈ 450g".
   - The per-food list already renders each food at the planned portion in grams
     (`meal-detail-panel.tsx:322`). Keep it. English USDA food names are acceptable
     here — the dietitian reads them.

2. **Week grid cards** (`meal-card.tsx`)
   - Replace the `portionShort` "×1.5" text with the dish's total grams, or remove
     it if the card is too tight. Minor.

3. **Client portal card** (`portal-meal-card.tsx`)
   - Replace the "×1.5 portions" line with the dish's total grams, e.g. "≈ 450g".
   - Do **not** add a per-food list here in this project (see "Out of scope").

### Out of scope (deferred to project #2, the dish catalog)

These need data that does not exist yet and is naturally typed by the dietitian on
the "add / edit a dish" screen:

- **Clean household measures** (tablespoon, cup, piece). The existing
  `foods.portionLabel` is raw USDA text ("1 serving", "1 serving 1 roll with
  icing"), not usable cooking measures. Real measures must be curated.
- **Arabic food names.** `foods.description` is English-only (`foods.ts:38`). The
  client-facing per-food list ("chicken 200g, rice 3 tbsp") needs Arabic names,
  which do not exist yet.
- **The per-food list on the client portal.** Blocked on Arabic names above.
  Earlier discussion landed on "main components only" for that list — that decision
  is recorded here for project #2, but not built now.

## Design

### The grams helper

A small pure helper next to `nutrition.ts` (the feature's arithmetic layer):

- `dishGrams(ingredients, servings)` → the dish's total grams at that serving:
  `sum(ingredient.quantityGrams × servings)`.
- Ingredient grams are already computed inline where needed
  (`quantityGrams × servings`); reuse or lift into a tiny helper for consistency.

Pure functions over plain objects, no database and no React — same discipline as
the rest of `nutrition.ts`, so it is unit-testable directly.

### Rounding (so numbers read cleanly)

- Per food: nearest **1 gram** (187.5 → 188).
- Dish total: nearest **5 grams** (447 → 445).

### Files touched

- `src/features/weekly-plans/nutrition.ts` (or a small sibling) — the grams helper.
- `src/features/weekly-plans/components/meal-detail-panel.tsx` — staff read-out.
- `src/features/weekly-plans/components/meal-card.tsx` — grid card text.
- `src/features/weekly-plans/components/portal-meal-card.tsx` — client card line.
- `messages/ar.json` and `messages/en.json` (next-intl) — new grams strings,
  remove/replace the `portion` / `portionShort` usages on these surfaces.

No migration. No change to `dishes`, `foods`, or `weekly_plan_meals`. The
`servings` multiplier remains the stored source of truth; grams are derived at read
time, consistent with how every other number in the feature is computed.

### The `baseServingLabel` column

Stays in the database (harmless). It simply stops being shown on these three
surfaces. No migration to remove it.

## Testing

- Unit-test the grams helper: a dish at ×1, ×1.5, and ×0.25 produces the correct
  total, and rounding lands on the specified boundaries (nearest 1g per food,
  nearest 5g for the total).
- Confirm the three surfaces render grams in both Arabic (RTL) and English (LTR).

## Success criteria

- No surface shows "×N portions" or "×N حصة واحدة" any more.
- Staff panel and client card show a real gram figure a person can act on.
- The dietitian can still resize a meal with the +/− stepper.
- `bun run lint`, `bun run typecheck`, and `bun run test` pass.

## Follow-on projects (not this spec)

2. **Dish catalog management** — make the catalog writable: add/edit dishes,
   redesign the food categories, "add a meal" with smart calorie calculation, and
   type in the curated Arabic names + household measures that unblock the full
   per-food client display.
3. **Dynamic calorie split** — make the meal-schedule percentages always resolve to
   100% live, instead of allowing 115% or 90%.
