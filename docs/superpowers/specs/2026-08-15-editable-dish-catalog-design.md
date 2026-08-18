# Editable dish catalog: add dishes, smart food matching, smart categories

Date: 2026-08-15
Status: Approved, ready for planning
Branch: study/ai-weekly-planner

This is the second of three related projects. It covers parts A, B, and C of the
catalog work:

- **A — Make dishes editable per clinic** (ownership foundation).
- **B — The "add / edit a dish" screen** with live calorie calculation, Arabic food
  matching, and custom foods.
- **C — Smart, simple categories** (nutrition category computed automatically).

A follow-on part D (type a whole dish in one sentence and have the AI build the whole
recipe) is explicitly out of scope here.

## The problem

1. **The catalog is locked.** `dishes` is seeded from `data/dishes.json`, shared by all
   clinics, and read-only — "nothing in the UI writes here" (`dishes.ts:16`). A
   dietitian cannot add her own dishes, which is a major gap.
2. **Adding a dish must be smart about Arabic.** The dietitian works in Arabic, but the
   food library (`foods`, 7,793 USDA rows) is English-only (`foods.ts:38`). A plain name
   search cannot match her input, so calories cannot be calculated. Some Palestinian
   foods are not in the library at all.
3. **The categories are unclear.** Everything is jammed into one `tags` list —
   `cheap`, `portable`, `quick`, `vegetarian`, `high_protein`, `diabetic_friendly`
   (`dishes.ts:52`) — mixing nutrition, cost, and diet type together.

## Core principle (unchanged from the rest of the app)

**Accurate numbers come from real measured data, never from an AI guess.** The AI is
used as a *translator/matcher*, not a calculator. Every calorie still traces back to a
real `foods` row wherever possible. The one deliberate exception is a clinic's custom
food with no library match, where the AI may pre-fill an estimate that the dietitian
must review and confirm before it saves.

## A — Ownership and visibility

Shared built-in dishes stay shared and read-only. Each clinic can add its own dishes on
top, and hide shared dishes it does not use. A clinic cannot edit a shared dish's recipe.

### Data model changes

`dishes`:

| column | type | note |
|---|---|---|
| clinic_id | uuid, nullable | ★ new. Empty = shared built-in; set = this clinic's own dish. |

`clinic_hidden_dishes` (★ new table): `(clinic_id uuid, dish_id uuid)`, unique on the
pair. A row means "this clinic has hidden this dish." Used only to hide shared dishes.

### Read path

`loadCatalog` (`queries.ts:101`) gains a required `clinicId` argument and returns:

- shared dishes (`clinic_id IS NULL`) that this clinic has **not** hidden, plus
- this clinic's own dishes (`clinic_id = :clinicId`),
- still filtered by `is_active` and by the allergen SQL gate.

All callers (generation, board, swap) already hold `clinicId`, so this is a signature
change, not a new lookup. `loadDishesByIds` stays ownership-agnostic: a plan must still
render any dish it already references, including a shared dish later hidden.

## B — The "add / edit a dish" screen

A dish is a recipe: a list of foods with grams. The screen lets the dietitian build that
recipe while the app sums the nutrition live.

### The flow

1. **Dish header** — `name_ar`, `name_en`, meal types (breakfast/snack/lunch/dinner),
   manual labels (see part C), allergen tags, and a base-serving label.
2. **Add foods** — for each food: pick or create it, enter grams for one serving, and
   optionally add a household measure ("3 tablespoons"). The running **calories and
   macros update live** as foods are added or grams change. This is the "smart calorie
   calculation": the dietitian never does arithmetic.
3. **Save** — writes the clinic-owned dish and its ingredient rows.

### Finding a food (the Arabic matching)

Three steps, cheapest first:

1. **Alias memory** — check `food_aliases` for this clinic and the typed Arabic name. A
   previously confirmed name resolves instantly, with no AI call.
2. **AI translator** — on a miss, a small AI call translates the Arabic term into English
   food keywords. The AI only produces search terms; it never produces nutrition numbers.
3. **Library search** — search `foods` with those keywords (reusing the existing
   `ilike` search) and show the top candidates. The dietitian picks the right one.

When she confirms a pick, save the mapping to `food_aliases` (`name_ar → food_id`) so it
is instant next time. Over time this builds a clinic-specific Arabic food vocabulary —
**and those Arabic names are exactly what project #1 needs to show the client the
per-food breakdown in Arabic.**

### Custom foods (not in the library)

When nothing matches, she creates a custom food:

- Stored in `foods` with `clinic_id` set (empty = shared USDA, set = clinic custom).
- The AI **pre-fills** suggested calories/macros from the food's name, clearly marked as
  an **estimate**. She edits and confirms the numbers before it saves. This is the one
  place AI-suggested nutrition is allowed, and it is always human-confirmed.
- A custom food is an ordinary `dish_ingredients.food_id` target afterward, so the rest of
  the app treats it like any other food.

Most "Palestinian dish not in the library" cases are actually a *combination* of library
foods (rice + chicken + olive oil + onion), so they are built from real parts and stay
accurate. Genuine custom single foods are the rare case.

### Data model changes

`dish_ingredients` — the pieces that unblock project #1:

| column | type | note |
|---|---|---|
| display_name_ar | text, nullable | ★ new. The Arabic food name the client sees. |
| household_label | text, nullable | ★ new. e.g. "tablespoon", "cup". |
| household_grams | real, nullable | ★ new. Grams that one household measure weighs. |

`foods`:

| column | type | note |
|---|---|---|
| clinic_id | uuid, nullable | ★ new. Empty = shared USDA library; set = clinic custom food. |

`food_aliases` (★ new table): `(id, clinic_id uuid, food_id uuid, name_ar text)`, unique
on `(clinic_id, name_ar)`. The Arabic-name → library-food memory.

## C — Simple, smart categories

A dish carries three separate kinds of label instead of one mixed `tags` list.

1. **When to eat it** — `meal_types` (breakfast/snack/lunch/dinner). Unchanged.

2. **Nutrition category — computed, never stored.** Derived from the recipe at read time,
   so it is always correct and updates itself when the recipe changes. Exactly one label
   per dish:

   - Compute each macro's share of energy with the existing `energySplit()`
     (`nutrition.ts:169`) — the share of the energy the macros account for, the same
     basis the meal panel already uses, which avoids the divide-by-`kcal` rounding
     problem noted there.
   - Thresholds (adjustable): protein ≥ 30% → high protein; carb ≥ 55% → high carb;
     fat ≥ 40% → high fat.
   - If more than one threshold is crossed, pick the one crossed by the **largest margin**
     (share minus its threshold), so there is always exactly one label.
   - If none is crossed, the label is **balanced**.

   Lives as a pure function next to `nutrition.ts`, unit-testable, with no stored column.
   `high_protein` is removed from the manual `tags`.

3. **Manual labels** — `tags`, now holding only what the numbers cannot know:
   `vegetarian`, `cheap`, `quick`, `portable`, `diabetic_friendly`. Chosen by hand in the
   editor.

## Permissions

Any authenticated staff member of the clinic can add, edit, hide, and delete that
clinic's own dishes and custom foods, scoped through `requireStaffClinic()` like every
other staff write. Shared built-in dishes and the shared food library are never edited.

## Migrations

New Drizzle migrations add the columns and tables above. Generated migration snapshots are
not hand-edited (per `CLAUDE.md`). No data is destroyed: existing shared dishes keep
`clinic_id` empty, and existing `tags` values simply drop `high_protein` (now computed).

## Testing

- **Ownership**: `loadCatalog(clinicId)` returns shared + own − hidden; a hidden shared
  dish disappears for that clinic only; another clinic is unaffected.
- **Nutrition category**: the pure function returns the right single label at and around
  each threshold, picks the largest margin on ties, and returns "balanced" when nothing
  stands out.
- **Live calorie calculation**: adding foods and changing grams updates the totals using
  the same `nutrition.ts` arithmetic the rest of the feature uses.
- **Alias memory**: a confirmed Arabic name resolves without an AI call on the next use.
- **Custom food**: AI-estimated numbers are marked as estimates and are editable; a saved
  custom food behaves like any library food.
- Arabic (RTL) and English (LTR) rendering of the editor.
- `bun run lint`, `bun run typecheck`, `bun run test` pass.

## Success criteria

- A dietitian can add, edit, hide, and delete her clinic's own dishes.
- Adding a food by Arabic name finds the right library food and calculates calories.
- A dish shows one clear, automatically-correct nutrition category, plus clear manual
  labels.
- Arabic food names and household measures are captured, unblocking project #1's client
  display.

## Interactions and follow-ons

- **Project #1** (grams display) can be completed once this ships, because Arabic food
  names and household measures now exist per ingredient.
- **Part D** (type a whole dish in one sentence, AI builds the full recipe) is a possible
  later spec. This spec only does AI *food matching*, not whole-dish generation.
