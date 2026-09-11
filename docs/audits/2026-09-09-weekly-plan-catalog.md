# Weekly-plan and catalog audit — 9 September 2026

Branch: `codex/weekly-plan-catalog-audit`, based on `dev`.

The catalog is numerically broad enough to pass its current coverage test, but
that test does not establish that a week is suitable for a particular client or
that its portions describe local food clearly. The most urgent problems are
constraint enforcement after AI selection, ingredient identity/preparation, and
the distinction between recipe weights and instructions a client can follow.

This is an initial audit and a focused set of fixes, not a completed catalog
revamp or validation of therapeutic diets. No catalog reseed, deployment, client
record changes, or publication was performed. AI tests used synthetic profiles.

## What was exercised

- Traced intake → clinic-scoped catalog → prompt → model response → reconciliation
  → portioning → daily balancing → variety repair → alternatives → board/export.
- Ran `plan:sweep`: **10 synthetic weeks, 315 meals, 187 of 274 main dishes used**.
  This uses deterministic dish selection; it tests the engine, not AI judgment.
- Ran **three real AI generations, each with a refinement pass**, using the
  configured `gpt-5.6-luna`: vegetarian, multiple allergies, and three meals only.
  These made six model calls and produced 91 final meal slots.
- Replayed the saved vegetarian first response to distinguish what the model
  selected from the alternatives the application supplied.
- Exercised the actual dish editor in the dev harness in Arabic/English and
  mobile/desktop. Tested ingredient search, role selection and unit conversion.
- Reproduced lost ingredient settings with a failing database integration test,
  then verified create → reopen → rename/save after the fix.

The existing service on port 3000 was a production build, which correctly refused
dev harnesses. UI checks used a separate development server on port 3001.

## Dataset measurements

| Measure | Result |
| --- | ---: |
| Canonical ingredients | 146 |
| Ingredients referenced by recipes | 127 |
| Main dishes | 274 |
| Side dishes | 21 |
| Recipe ingredient lines | 1,279 |
| Lines entered in grams despite available household portions | 759 |
| Of those, marked adjustable | 87 |
| Main dishes with 0 / 1 / 2 / 3 adjustable ingredients | 2 / 55 / 204 / 13 |

The 759 lines are a **review queue**, not 759 proven mistakes: weighing an
ingredient can be intentional. However, it explains why adding portions to the
food dataset alone did not repair the client-facing plans. Recipe lines must
choose the appropriate portion too. The two mains without adjustable lines are
`cucumber-radish-plate` and `manaqish-zaatar`; a whole dish legitimately may need
no independent ingredient controls.

`bun run plan:audit` now emits a repeatable JSON audit, including the full unit
review queue, missing primary marks, food states, and coverage after filtering.
The unrestricted catalog passes every existing coverage floor. The gluten-free
subset misses **7** calorie-band cells; the nuts/lactose/sesame-excluded subset
misses **8**. Thus “catalog complete” currently means complete before restrictions.

## Highest-priority open findings

### 1. Client restrictions do not govern every choice

**Observed:** the vegetarian model response contained no meat/fish main meals,
but reconciliation supplied **39 meat/fish alternative entries** across that
first-pass week. The final refined main meals also stayed vegetarian; the
confirmed contamination is in the alternatives, not those final mains.

For example, the generated vegetarian handout offers chicken bulgur and kofta as
alternatives to cauliflower with tahini and rice, and a turkey sandwich as an
alternative to watermelon.

**Cause:** allergies are filtered structurally, but vegetarian instructions and
dislikes are prose. `generate.ts` and `variety.ts` receive the catalog and allergy
tags, not an enforceable representation of those instructions. Alternative
selection and automatic repair therefore cannot reliably retain them. Clinical
conditions such as coeliac disease also need a check of their effective hard
exclusions; the SQL filter itself reads `profile.allergenTags`.

**Next change:** create one eligible-catalog decision from structured hard
constraints, and use it for mains, sides, alternatives, repair, manual swap
suggestions and final validation. Do not try to solve negation-sensitive dietary
instructions with a few string matches. Keep preferences separate from hard
exclusions. Clear or regenerate explanatory text when code changes a meal.

### 2. Pattern filtering silently restores excluded dishes

`clinical.ts:narrowToPattern()` restores dishes when fewer than three survive for
a meal type. With the shipped catalog, **66 offered dishes exceed the code's
own base-carbohydrate threshold** under keto, and 66 under low carb. For example,
`bamia-meat-rice-large` is offered with about 85.3 g carbohydrate at base serving.
These are software threshold comparisons, not proposed clinical targets.

The filter also checks a base serving, whereas a finished meal can have a larger
portion and sides. The final meal/day requires validation against the actual
amounts, not just a pre-selection label. The renal and low-sodium patterns rely
on prompt instructions; neither has a corresponding quantitative final gate.

**Next change:** report infeasible slots honestly and retain the restriction.
If approximation is supported, make it an explicit dietitian decision, visible
on the resulting draft. Do not silently present a restored dish as compliant.

### 3. The dataset sometimes substitutes another food for the named dish

| Dish/food | Stored representation | Why it needs review |
| --- | --- | --- |
| Maftoul with chicken | Cooked couscous | The dataset's own header explicitly says maftoul and couscous are different and that maftoul nutrition is absent, yet two recipes use couscous. |
| Mansaf | Ground lamb, ordinary yogurt, pita | No jameed or local bread representation; the recipe needs validation as a specific version of mansaf. |
| Broasted chicken | Roasted skinless breast, oven fries, added oil | This approximation does not describe the coating, skin, frying method or restaurant serving reliably. |
| Musakhan | Pita, chicken, onion, oil, pine nuts | Taboon bread and sumac are missing from these recipes. |
| White cheese | USDA feta | A generic Arabic name hides the particular cheese represented by the numbers. |
| Freekeh | Dry-grain nutrition and cup weights | Arabic name is just فريكة, and planned cooked meals do not state that the cup is measured dry. |

These are identity/preparation mismatches visible in the source, not a claim
that the exact nutrient error has been measured. The current arithmetic is only
as trustworthy as those ingredient matches.

**Next change:** validate representative recipes with their preparation method,
edible serving, cooked yield, and actual ingredients. Store substitutions as
documented approximations with review status. FAO's food-matching guidance
supports documenting matches and considering preparation and local eating
habits; raw-to-cooked calculations need appropriate yield/retention treatment.
[FAO/INFOODS food-matching guidelines](https://www.fao.org/4/ap805e/ap805e.pdf).

### 4. Household units lose information that matters to the client

- Cooked white rice has a **25 g heaped eating spoon** documented as clinic
  practice in Hebron. The visible labels are merely `Tablespoon` / `ملعقة كبيرة`.
  The stored source explicitly says it is not a level measuring tablespoon.
- Apples have a measured piece, but its medium size disappears into `Piece` /
  `حبة`. Bread, cheese and melon units similarly need useful size descriptions.
- Grapes still default to cups. Cantaloupe, cheese, peanut butter and falafel
  frequently appear in recipe grams despite having portions in the food catalog.
- Oil is often left in grams; the vegetarian sample includes 23 g and 30 g oil
  instructions. Merely displaying friendly units cannot fix an unreasonable
  serving chosen to meet an energy target.
- Generation formerly stepped slices by one while manual editing stepped them
  by half; weighed oil formerly moved by 5 g during generation and 10 g manually.
  These increment inconsistencies are fixed on this branch.

**Next change:** distinguish the unit's stable identity, localized description,
food state, measured gram equivalent and evidence. An eating spoon and a level
tablespoon need distinct identities. Pick a preferred unit per ingredient/state,
then review the recipe amounts on that unit's serving grid. Do not invent a
single universal grams-per-spoon or grams-per-piece conversion.

### 5. Allergen metadata is less reliable than the documentation suggests

`docs/catalog.md` says allergens derive from ingredient marks. In the implementation
there is no canonical food-allergen field; dish tags are authored, and the
editor makes removable name-based suggestions. Peanut butter currently triggers
a dairy/lactose suggestion because its name contains “butter.” Seven ghee recipes
also disagree with the suggestion logic, requiring ingredient-level review.

The six-value allergy vocabulary combines peanuts and tree nuts and uses
`lactose` for dairy; it has no separate milk-protein, soy, or shellfish field.
These distinctions matter. FDA identifies milk as an allergen and notes that
milk-derived ingredients including ghee can contain residual milk protein.
[FDA allergen guidance, edition 5](https://www.fda.gov/media/117410/download).
This is a data-model observation, not a claim that US labeling rules govern this
clinic.

**Next change:** verified ingredient allergen facts, separate milk allergy from
lactose intolerance, appropriate allergen vocabulary, derived dish warnings,
and explicit treatment of unknown/custom ingredients and cross-contact. A
name-based suggestion is useful assistance, not the safety gate.

## Additional implementation findings

| Finding | Evidence / implication | Status |
| --- | --- | --- |
| Primary/free flags disappear on clinic dish edit | Input schema, edit query and replacement ingredient rows omitted both flags. New clinic dishes had no way to select primaries. | **Fixed** through schema, query, writer and UI. No arbitrary three-primary cap on clinic-authored recipes. |
| Changing units silently changes the food amount | The dropdown previously changed only the unit ID, retaining the numeric count. `2 pieces` became `2 g`. | **Fixed** by converting the amount between the food's own units. |
| Unfinished ingredients silently omitted on save | Only positive rows were serialized; one complete row allowed other blank rows to disappear. | **Fixed**: every added row must have a positive amount. |
| Reopening fractional portions rounds the stored amount | Editor rounded the recovered count to three decimals before save. | **Fixed**: preserve the numeric precision on reopen/conversion. |
| Duplicate ingredient rows can break meal editing | Dish input allows repeated food IDs; materialized meal ingredients require unique `(mealId, catalogFoodId)`. | Open; merge duplicate food entries or reject them before dish save. |
| Custom foods all become `other` / `prepared` | `createCustomFood()` does not collect category/state. Protein-source inference and category portion limits then miss custom meat, dairy, fruit, etc. | Open; add structured category/state and review status to custom-food editing. |
| No clinic adjustment of shared recipe primaries | Shared dishes can be hidden, but the edit path is owner-only and there is no clone-to-clinic flow. | Open; add an explicit clinic copy/override with provenance. |
| Free-serving display is lost after materializing a meal | `weekly_plan_meal_ingredients` and `ownAmountsByMeal()` carry `isPrimary` but not `isFree`. | Open; preserve this through materialization and snapshots before relying on the free-serving workflow. |
| Protein target does not reach production reconciliation | `runGeneration()` calls `reconcile()` without its `proteinTargetGrams` option. Lab refinement supplies it, so lab and production differ. | Open; first define target versus restriction behavior so repair does not favor protein preservation in a restricted profile. |
| Refinement and repair explanations can disagree with final meals | The allergy sample summary says Saturday dinner was replaced by lentil soup, but its final meal is sardine salad. | Open; explanations must describe final validated selections. |
| Lab output has misleading diagnostics | Alternatives show `0 kcal` in the lab adapter; with `--refine`, its “variety repair changed” list also includes model refinement changes. | Open; those two report fields were excluded from conclusions here. Do not read them as production nutrition values or isolated repair measurements. |

The free-serving limitation above predates this audit and also affects shared
recipes. The new editor persists that setting on the dish; it does not repair
the separate materialized-meal storage model.

## What the real sample weeks showed

These numbers are the application's output, not dietary recommendations.

| Synthetic profile | Slots | Target kcal/day | Final average | Unfilled | Existing arithmetic findings |
| --- | ---: | ---: | ---: | ---: | ---: |
| Vegetarian man | 35 | 2,538 | 2,556 | 0 | 28 |
| Nuts/egg/sesame allergies | 35 | 1,391 | 1,399 | 0 | 22 |
| Teacher, three meals only | 21 | 1,284 | 1,294 | 0 | 16 |

Close weekly averages hide individual-meal problems. In the vegetarian sample,
a watermelon snack provides **86 kcal against a 254 kcal slot**, while another
dinner provides **805 kcal against 508**. In the teacher's week, wholewheat pita
appears in **8 of 21 meals**. Repetition of a local staple is not automatically
wrong: the current reviewer needs to distinguish an ordinary bread/rice pattern
from repetitious complete meals. Its protein findings likewise should not all
be interpreted as clinical errors.

The teacher's three-slot schedule was respected, all three samples filled their
requested slots, and the multiple-allergy sample had no tagged-allergen
rejections. These are useful successes, but they do not validate missing or
incorrect allergen tags.

## Proposed catalog revamp, in order

1. **Fix constraint propagation and final validation first.** Cover alternatives,
   sides, repair, and publication review; make infeasibility explicit.
2. **Validate a core local ingredient set.** Prioritize cooked freekeh, maftoul,
   jameed, Nabulsi/Akkawi cheese, taboon bread, za'atar blend, sumac, and salt.
   Those identities are missing from the current canonical set. Molokhia,
   labneh and green olives already exist and should be reviewed, not duplicated.
3. **Write practical portions for each ingredient/state.** Fruit by a named size,
   bread by a specified loaf/half, cooked staples by a documented spoon or cup,
   spreads/oils by a measured small unit, and meat by weight or a validated piece.
   Preserve grams underneath every display choice.
4. **Rebuild representative dishes before adding more variants.** Start with
   everyday breakfasts, sandwiches, cooked lunches, assembled protein/starch
   plates, simple dinners and snacks. Validate maqluba, musakhan, mansaf,
   maftoul, freekeh, stuffed vegetables and restaurant meals as actual servings.
5. **Make primary selection intentional.** Identify what can be portioned
   independently in an assembled plate versus a mixed cooked dish. Offer
   suggestions the dietitian can inspect, with manual overrides; do not infer
   the answer solely from ingredient weight or a compulsory count of three.
6. **Measure suitability by profile.** Extend coverage to dietary exclusions,
   preparation time, eating away from home, portion feasibility, side variety,
   and repeatable multiweek plans. Add nutrient-aware alternative checks where
   the profile needs them, rather than treating calorie similarity as sufficient.

Use source-specific data and local product panels with recorded evidence; do not
expand the catalog by silently renaming approximate USDA foods. FAO maintains
a [regional source directory](https://www.fao.org/infoods/infoods/tables-and-databases/middle-east/en/)
that can help identify source tables. Its listings are not blanket permission to
reuse a dataset or assurance that a listed food matches a local recipe.

## Reproduction and local evidence

```sh
bun run plan:audit
bun run plan:sweep
bun run plan:lab --only vegetarian --refine --out .plan-lab/audit-vegetarian
bun run plan:lab --only multi_allergy --refine --out .plan-lab/audit-allergy
bun run plan:lab --only three_meals_teacher --refine --out .plan-lab/audit-teacher
```

The last three commands make paid calls using the configured provider; `plan:audit`
and the ordinary sweep do not. Raw first responses and readable generated weeks
are in the three `.plan-lab/audit-*` directories. The catalog JSON report is
`.plan-lab/audit-current.json`; the initial failing regression and check logs are
also in `.plan-lab/`. These are ignored local artifacts, not client data.

Verification completed:

- `bun run lint` — passed.
- `bun run typecheck` — passed.
- `bun run test` — **2,515 passed, 0 failed**, across 159 files.
- Arabic/English editor rendering checked at desktop and 390-pixel mobile width.
- Unit conversion checked in the browser: two eggs → 100 g, with unchanged calories.
- Incomplete ingredient checked in the browser: adding chicken without an amount
  disables Next even when another ingredient is complete; entering 100 g enables it.

The dev harness uses synthetic search data and cannot submit a real clinic dish;
save/reopen persistence was verified in the integration test database instead.
