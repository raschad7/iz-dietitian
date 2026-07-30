# Weekly Plans (Meal Planning V2) — Design

Date: 2026-07-30
Branch: `feat/meal-planning-v2`

## Purpose

A second meal-planning surface, built around AI generation rather than manual
entry. The dietitian picks a client, sees that client's clinical context, adds
instructions for the coming week, and generates a complete seven-day plan that
they can adjust and publish to the client portal.

The existing manual editor (`src/features/meal-plans/`) is unchanged and stays in
the product. V2 lives beside it.

## Scope

In:

- A curated dish catalog (`dishes`), seeded, read-only in the app.
- A per-client nutrition profile: weight, calorie target, preferences, dislikes,
  permanent instructions, meal schedule.
- A weekly plan board: seven day columns, five meals a day, per-meal and per-day
  calorie totals.
- One-call AI generation of the whole week, plus targeted regeneration of one day
  or one meal.
- Manual swapping of any meal, from the AI's alternatives or from a deterministic
  "nutritionally similar" search over the catalog.
- Publishing a draft to the client portal as a read-only week with alternatives.

Out (deliberately deferred):

- Comparing a draft against the previous plan. The previous plan is still loaded
  and fed to the prompt for variety; there is no diff UI.
- Dietitian CRUD over the dish catalog. Seed script plus a read-only browser only.
- Weight history and trend charts. One current weight per client.
- Client-side swapping in the portal. The published plan is read-only.

## Naming

Tables and the feature directory are named `weekly_plans` / `weekly-plans`, not
`v2`. A version number in a table name stops meaning anything the moment there is
a V3. "Weekly" is the honest distinction from the existing per-plan editor. The
navigation label reads **Meal Plans V2**, because that is what the user calls it.

## Data model

Nutrition is never stored. Totals are derived on read from `dish_ingredients` and
`foods`, reusing `src/features/meal-plans/nutrition.ts` verbatim — it is pure,
already tested, and duplicating it would let two answers disagree.

### `dishes` — the approved catalog

Un-scoped reference data, following the `foods` precedent: a curated dish is
closer to a physical fact than to a tenant's record, and one seeded catalog beats
each clinic seeding an identical copy. When clinic-owned dishes are needed, that
is a `clinic_id` column added then, with a migration that can see the real
requirement.

| Column | Notes |
| --- | --- |
| `id` | uuid pk |
| `slug` | unique. The stable natural key, so a re-seed updates in place instead of orphaning plan rows that reference a dish. Same role as `foods.fdc_id`. |
| `name_ar`, `name_en` | Arabic is what the dietitian and the client read. |
| `meal_types` | `text[]` — which slots it suits: `breakfast` \| `snack` \| `lunch` \| `dinner`. |
| `tags` | `text[]` — `cheap`, `portable`, `quick`, `vegetarian`, `high_protein`, `diabetic_friendly`. These are what the dietitian's weekly instructions ("lower cost", "portable meals") actually resolve against. |
| `allergen_tags` | `text[]` — `nuts`, `lactose`, `gluten`, `egg`, `fish`, `sesame`. |
| `base_serving_label` | e.g. "حصة واحدة". |
| `is_active` | boolean, default true. |

### `dish_ingredients` — the recipe

| Column | Notes |
| --- | --- |
| `dish_id` | → `dishes`, cascade. |
| `food_id` | → `foods`, **restrict**. Same reasoning as `meal_plan_items`: a re-seed that silently emptied a recipe would be a catastrophe. |
| `quantity_grams` | real. Grams for one base serving. |
| `sort_order` | integer. |

### `client_nutrition_profiles` — one row per client

| Column | Notes |
| --- | --- |
| `clinic_id` | The tenant boundary, denormalised on purpose — same reasoning as `meal_plans.clinic_id`. |
| `client_id` | → `clients`, cascade, **unique**. |
| `weight_kg` | real, nullable. |
| `daily_kcal_target` | integer, nullable. Null means "use the computed suggestion"; a value is the dietitian's override. |
| `protein_target_grams` | integer, nullable. |
| `preferences`, `dislikes`, `permanent_instructions` | text, nullable. |
| `meal_schedule` | jsonb — `[{ slotKey, label, timeOfDay, kcalShare }]`. |

`meal_schedule` is jsonb and not a table: five rows per client with no lifecycle
of their own, which is the same argument `meal-plans.ts` already makes for having
no `meal_plan_days` table. Zod validates it on write **and** on read, so a
hand-edited row cannot reach a component.

`kcalShare` turns the daily target into a per-meal budget (breakfast 0.25, snack
0.10, lunch 0.35, snack 0.10, dinner 0.20 by default, editable per client). Without
it the model has to guess how to spread 1,850 kcal across five meals, and the
board has nothing to show a meal's total against.

### `weekly_plans`

| Column | Notes |
| --- | --- |
| `clinic_id`, `client_id` | Both cascade. |
| `week_start_date` | `date`, mode string. The Sunday the week begins. A date, not a timestamp — a week does not shift with a time zone. |
| `status` | `draft` \| `published` \| `archived`. |
| `published_at` | timestamptz, nullable. |
| `week_instructions` | text — what the dietitian typed for this week. |
| `kcal_target_snapshot` | integer. The target this plan was generated against, snapshotted because the profile can change afterwards and the plan must still explain itself. |
| `generated_by` | `ai` \| `manual`. |
| `model` | text, nullable. Which model produced it. |

Unique partial index on `(client_id, week_start_date) where status = 'published'`.
Two live plans for one week is then impossible in the database rather than by
convention.

### `weekly_plan_meals`

| Column | Notes |
| --- | --- |
| `plan_id` | → `weekly_plans`, cascade. |
| `day_of_week` | integer 0-6, Sunday = 0. Same convention as V1 and `Date.prototype.getDay()`. |
| `slot_key` | text — matches a `meal_schedule` entry. |
| `label`, `time_of_day`, `sort_order` | Snapshotted from the schedule at generation time. |
| `dish_id` | → `dishes`, restrict. Nullable: an unfillable slot is an empty meal, not a missing row. |
| `servings` | real. The portion multiplier. |
| `rationale_ar` | text, nullable. The model's short Arabic explanation. |

Unique on `(plan_id, day_of_week, slot_key)`.

`servings` is a multiplier over the dish's base recipe rather than per-ingredient
grams. This is what makes "the AI cannot invent nutrition values" a guarantee of
the data model instead of an instruction in a prompt: the only numbers it emits
are a dish reference and a scalar.

### `weekly_plan_meal_options` — the alternatives

`meal_id` (cascade), `dish_id` (restrict), `servings`, `sort_order`. Zero to
three per meal.

### `weekly_plan_generations` — audit

One row per call: `plan_id`, `scope` (`week` \| `day` \| `meal`), `instruction`,
`model`, `prompt_tokens`, `completion_tokens`, `duration_ms`, `status`,
`error`. This is how "why did Tuesday come out like that" is answerable in three
weeks, and the only way to see what the feature costs.

## Modules

Six of the nine feature modules are pure — no database, no network, no React —
which is what makes the risky part of this feature testable without mocks.

```
src/features/weekly-plans/
  targets.ts          # pure: bmi, bmiCategory, mifflinStJeor, tdee, goalKcal, slotBudgets
  dish-nutrition.ts   # pure: dish totals from ingredients × servings
  similar.ts          # pure: rank candidate dishes by kcal proximity to a budget
  prompt.ts           # pure: build the request payload
  schema.ts           # Zod: profile, meal schedule, instructions, the response schema
  llm.ts              # transport seam — console fixture | openai, mirrors src/lib/mail/
  generate.ts         # orchestrate: prompt → llm → validate → persist
  queries.ts          # getBoard, listClients, getPublishedPlan, findSimilarDishes, listDishes
  mutations.ts        # transactional writes
  actions.ts          # 'use server' — generate, regenerate, swapMeal, publish, saveProfile
  form-state.ts
  components/
    client-rail.tsx  plan-board.tsx  day-column.tsx  meal-card.tsx
    meal-detail-panel.tsx  context-panel.tsx  week-instructions-form.tsx
    generate-button.tsx  publish-button.tsx  nutrition-profile-form.tsx  dish-table.tsx
```

### Targets

`targets.ts` computes what the profile does not store:

- BMI = `weightKg / (heightCm / 100)²`, with the standard categories.
- BMR by Mifflin-St Jeor: `10·kg + 6.25·cm − 5·age + (5 | −161)`.
- TDEE = BMR × an activity factor keyed to the existing `clients.activity_level`
  values (`sedentary` 1.2 … `very_active` 1.9).
- Goal adjustment keyed to the existing `clients.goal` values: `weight_loss`
  −500, `weight_gain` +400, everything else 0, floored at 1,200 kcal.

The result is a *suggestion*. `daily_kcal_target` overrides it when set.

## AI contract

### What is sent

`prompt.ts` is a pure function, so what leaves the building is directly
assertable in a test.

- **No identity.** No name, email, phone, or client id. Age in years, sex,
  height, weight, BMI, activity level, goal, kcal target, protein target.
- Allergies, preferences, dislikes, permanent instructions, this week's
  instructions — free text as the dietitian wrote it.
- The meal schedule: slots with labels, times, and kcal budgets.
- The **allergen-filtered** catalog, compact: slug, Arabic name, `meal_types`,
  `tags`, kcal per base serving.
- The previous plan's dish slugs, so the model can deliberately vary.

Filtering by allergen happens in SQL before the payload is built. Allergy safety
must not depend on the model reading its instructions.

### What comes back

One call per generation, `response_format: json_schema` with `strict: true`. The
`dish` field is an **enum of the slugs actually sent**, so a dish outside the
catalog is not merely discouraged, it is unrepresentable.

```jsonc
{ "days": [ { "dayOfWeek": 0, "meals": [ {
      "slotKey": "breakfast",
      "dish": "labaneh-zeit-bread",
      "servings": 1.25,
      "rationaleAr": "…",
      "alternatives": [ { "dish": "…", "servings": 1 } ]
} ] } ] }
```

### What happens to it

`generate.ts`, in order:

1. Zod-parse. Structural failure → one retry with the validation error appended,
   then a clean error.
2. Re-check every slug against the filtered catalog **server-side**. Unknown or
   allergen-violating slugs are dropped, never stored.
3. Reconcile against the client's real slots. Missing meals become empty slots.
4. Compute all nutrition locally from `dish_ingredients`. Nothing the model says
   about calories is ever read; volunteered numbers are ignored.
5. Insert plan, meals, and options in one transaction, plus the audit row.

The model is treated as an untrusted source of *references*, not of facts.

## UI

Layout: a client rail, seven day columns of stacked meal cards, and an end-side
panel that shows client context and becomes the meal detail panel when a card is
opened.

Each meal card shows the slot, the Arabic dish name, and its calories against its
budget. Each day header shows the day's total against the daily target. Opening a
card shows `servings × base serving`, the ingredient list with grams, the twelve
nutrients, the model's Arabic rationale (visually distinct — a suggestion, not a
clinical claim), the AI's alternatives, and a similar-dish search.

**Similar dishes** is deterministic and free: same meal type, allergen-safe,
base kcal × achievable servings within ±15% of the slot budget, ranked by
proximity. It also flags an AI alternative that drifts outside that band.

**Regeneration** has three scopes — week, day, meal — each taking an optional
one-line instruction. Day and meal calls use the same validated contract and
replace only their own rows, so a bad meal regeneration cannot corrupt the week.

### Routes

| Route | Renders |
| --- | --- |
| `app/weekly-plans` | Client rail, "select a client" empty state |
| `app/weekly-plans/[clientId]` | The board. `?planId=` opens an older plan; default is newest |
| `app/dishes` | Read-only catalog browser, reusing the `/foods` table pattern |
| `portal/(secured)/plan` | The client's published week, read-only, with alternatives |

### Publishing

One transaction: archive any currently-published plan for that client and week,
then flip the draft to `published` with `published_at`. Nothing is destroyed, so
history is free. The portal reads the published plan with the greatest
`week_start_date`.

## Failure modes

| Failure | Behaviour |
| --- | --- |
| `OPENAI_API_KEY` unset | Generate disabled with a config message. Not a crash. |
| Profile incomplete | Generate disabled, linked to the profile form, naming the missing fields. BMI and the target are unanswerable without height, weight, sex, and date of birth. |
| Catalog empty after allergen filtering | Blocked with a clear message. Never "generate anyway". |
| Network error or timeout | Error state, retry, **nothing written**. |
| Response fails the schema | One retry, then clean failure. |
| Unknown or allergen-violating slug | That meal dropped; banner counts the unfilled slots. |
| Missing days or slots | Empty slots, same banner. A partial plan beats a failed one. |

## Testing

- **Pure unit tests, no database** — `targets.ts` against worked BMI/Mifflin
  examples, `dish-nutrition.ts`, `similar.ts`, and `prompt.ts` asserting the
  payload carries no name, email, phone, or id: a privacy regression must be a
  red test. The response schema is exercised against committed fixtures
  including a hallucinated slug, an allergen violation, and a missing day.
- **Integration tests** against `TEST_DATABASE_URL`, following
  `mutations.test.ts` — persistence, tenant scoping (another clinic's plan is
  invisible, not forbidden), the publish transaction and its unique index, and
  that regenerating one meal replaces only that meal's rows.
- The `console` LLM transport replays a committed fixture, so `generate.ts` is
  testable end to end with no network and no key.

## Known risk

A 30-90s generation as a server action exceeds the default function timeout on
most serverless hosts. Locally it is fine. On Vercel this needs
`export const maxDuration = 120` on the route segment; if that is not enough, the
upgrade path is a route handler writing progress with the client polling — a
meaningfully bigger build, deliberately not built now.

## Implementation order

1. Schema files, barrel export, migration.
2. `data/dishes.json` + `scripts/seed-dishes.ts`, resolving ingredients against
   seeded `foods` and failing loudly on an unresolved one.
3. Pure modules: `targets.ts`, `dish-nutrition.ts`, `similar.ts`, `schema.ts`,
   `prompt.ts`, with their tests.
4. `llm.ts` + fixture, `generate.ts`, with tests.
5. `queries.ts`, `mutations.ts`, `actions.ts`, with integration tests.
6. Components and the three staff routes.
7. The portal plan page.
8. `ar.json` then `en.json`; navigation entry.
