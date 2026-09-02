# The food and dish catalog

What the catalog is made of, where its numbers come from, and how it is judged
finished. Read this before adding a food, adding a dish, or adding a category.

The catalog is the only thing weekly-plan generation may choose from, so its
gaps are the plan's gaps. A client was once prescribed a guava as a 218 kcal
snack; nothing was wrong with the code. The 200–300 kcal snack band was empty.

## Two laws

**1. Nothing invents a number.** A dish carries no nutrition of its own. It is a
recipe pointing at foods, and every figure the UI shows is summed from those at
read time. A food's nutrition is copied verbatim from a cited source and an
unmeasured nutrient is written as an explicit `null`.

**2. If the recipe knows it, the recipe decides it.** Any label computable from
the ingredients is computed, never typed. A hand-typed `vegetarian` can sit on a
dish with chicken in it; a computed one cannot. This is why `vegetarian` ended
up on 64 of 113 dishes and meant nothing.

## Three families of dish

A real plan mixes three kinds, and they behave differently.

| Family | Examples | Parts swappable | Serving |
| --- | --- | --- | --- |
| **Traditional** | مقلوبة، مسخّن، ملوخية، أوزي، مجدرة | No — change a part and it is a different dish | any multiplier |
| **Assembled plate** | صدر دجاج + أرز بسمتي + سلطة، مكرونة بولونيز، فاهيتا | Yes, that is the point | any multiplier |
| **Street / restaurant** | شاورما، فلافل سندويش، بيتزا، بروستد | No | **whole servings only** |

The assembled plate is the family a dietitian actually writes most often, and it
is a *pattern* — a protein, a starch, free vegetables — rather than a recipe
handed down. Writing every combination out by hand is 8 proteins × 7 starches =
56 rows, and every protein added later costs seven more.

**Decision:** write roughly twenty of the commonest combinations by hand for
now, and build a template that assembles them at generation time only if the
typing proves painful. Nothing is blocked on new code this way.

## Computed labels — never typed

Derived from the recipe, at read time, by the modules named:

| Label | Where |
| --- | --- |
| `high_protein` / `high_carb` / `high_fat` / `balanced` | `nutritionCategory()`, `nutrition.ts` |
| protein source — red_meat, poultry, fish, egg, dairy, legume, nuts, none | `proteinSource()`, `dish-composition.ts` |
| carb base — rice, bread, bulgur, pasta, couscous, oats, potato, none | `carbBase()`, `dish-composition.ts` |
| allergens — nuts, lactose, gluten, egg, fish, sesame | the foods' own allergen marks |
| vegetarian, vegan, gluten-free, lactose-free | the categories and allergens of the foods |
| kcal band | `mealTotals()` at base serving |

None of these may appear as a writable field on a dish. A pull request that adds
one is wrong by construction.

## Declared axes — four, required, one value each

What the recipe cannot know. These are **fields, not tags**: every dish has
exactly one value on each of the four, and none may be null. A tag bag lets a
dish carry no useful label at all, which is how `no_cook` ended up on two dishes
out of a hundred and thirteen. The `tags` column is gone.

They combine as facets: **OR within an axis, AND across axes.** `street` and
`restaurant` are two answers to one question, so asking for both means either;
`street` and `quick` are answers to two, so asking for both means both. The tag
bag ANDed everything, which is why pressing a second chip could only ever empty
the list.

### `source` — where you get it

`home` · `street` · `restaurant` · `shop`

> بيتي · من الشارع · مطعم · جاهز من الدكان

مسخّن is `home`, شاورما is `street`, بيتزا is `restaurant`, بسكويت is `shop`.

The most load-bearing of the four. Without it every plan silently assumes the
client goes home and cooks, and a client who buys lunch near work gets a plan he
cannot follow and does not say so. It narrows the catalog to what this client can
obtain, it makes the weekly instruction "he eats out most days" actionable by the
model, and it is what marks a dish as sold in whole units.

### `effort` — how much work

`no_cook` · `quick` (≤15 min) · `medium` (≤45 min) · `long` (over 45 min, or
needs planning ahead)

> بدون طبخ · سريع · متوسط · يحتاج وقت

تفاح مع لوز is `no_cook`, بيض مقلي is `quick`, شوربة عدس is `medium`, مقلوبة is
`long`. Replaces three overlapping half-scales — `quick` (52 dishes),
`easy_prep` (4), `no_cook` (2) — with one.

### `cost` — relative price

`cheap` · `normal` · `expensive` — اقتصادي · عادي · مكلف

عدس and بيض are `cheap`, دجاج is `normal`, سلمون and لحم غنم are `expensive`.
Judged relative to the local basket. Written by hand, and it will age; the
alternative — a price per kilo on each food, with a dish's cost computed from its
recipe — was considered and deferred. If a shopping list with a total on it is
ever wanted, that is the version to build.

### `occasion` — when it belongs

`everyday` · `family` · `ramadan` · `festive` — يومي · عائلي · رمضان · مناسبات

Most dishes are `everyday`. مقلوبة and قدرة are `family`, قطايف is `ramadan`,
كنافة and معمول are `festive`.

## Fixed portions

A person cannot eat 0.7 of a shawarma sandwich. `isFixedPortion(source)` is true
for `street` and `restaurant`, and sends `chooseServings` and `nextServings` down
a whole-number grid — the same mechanism as `UNIT_STEPS` in `portioning.ts`,
applied to the serving multiplier rather than to a line.

`home` stays free to take any multiplier the budget wants, and so does `shop`: a
packet is opened, not portioned by the shop.

The consequence is deliberate. A whole-only dish often misses its slot budget,
because a منقوشة is 420 kcal whether the budget wanted 500 or not. Missing the
number honestly is correct; the alternative is `0.87 قرص`, which is a number
nobody can serve.

## Sides

A lunch is often more than one thing — `ملوخية · 6 معالق أرز · صحن سلطة`, or
`دجاج ورز وصحن سلطة وشوربة`. A meal carries **one main** and a short list of
**sides**: صحن سلطة، كوب شوربة، كوب لبن، خبز.

The main takes the budget multiplier. A side is fixed at one serving and never
scaled, which is what keeps the portion engine, the variety rules and
`proteinSource` all reading the main and nothing else. The alternative — a meal
holding a list of equal dishes — would have to change the schema, the prompt,
portioning, totals, the board, printing and completions all at once, and would
still leave "which dish is this meal's protein?" unanswerable.

Sides are marked `is_side` in the catalog and **excluded from the generation
catalog entirely**: a side may never be chosen as a meal, nor offered as an
alternative to one. `toPromptCatalog` is where that is enforced.

## How a food is counted

**A food declares its own unit, and every recipe obeys it.** An egg is always
`حبة`, bread is always `رغيف`, cooked rice is always `ملعقة`, oil is always
grams. Today the recipe author picks per line, which is why the same egg appears
as "1 حبة" in one dish and "50 غ" in another.

The rule lives on the food as a required counting unit — a portion for anything
people count, grams for anything they do not — and `db:check` fails a recipe
that contradicts it.

The reason this matters more than it looks: whole wheat pita is *fewer* calories
per 100 g than white, but the loaf weighs 100 g instead of 60–80, so the loaf
carries *more*. Only the unit tells that story. The gram hides it.

## Free items

شرائح خضار and صحن سلطة appear in nearly every meal of a real plan **with no
amount on them**. Vegetables are free, and the dietitian writes them that way
deliberately.

A dish line may therefore be marked **free**: it carries a fixed nominal amount
so the day's calories stay honest, and the portion engine **never scales it**.
The client reads `صحن سلطة` with no number, exactly as their dietitian writes it,
whatever multiplier the rest of the meal took.

This generalises the seasoning rule already in `portioning.ts`, which freezes any
line under 15 kcal. That rule becomes an explicit flag rather than a threshold
guess.

## Hand measures are a guide, not a unit

A real plan says `مقدار قبضة اليد` for a kofta ball and `كف اليد بدون أصابع` for
a tray portion. That is not sloppiness — it is how a client with no kitchen scale
eats. But it is **not** how the data is stored.

- **The catalog holds real units only**: grams, spoons, cups, loaves, pieces.
  Some clients own scales, and the dietitian always works in true measures.
- **The approximation is a display layer**: a printed reference the client keeps,
  translating a real amount into something they can picture — roughly, and with
  the honest caveat that hands differ.
- Not every hand measure earns a place. **علبة كبريت is not a measuring unit**
  and does not go in.

Nothing about nutrition, portioning or generation depends on this layer. It is a
guide sheet, and it is where the existing kitchen-weights reference grows into
something a client is handed.

## Where a food's numbers come from

`sourceType` and `sourceRef` are required on every food. The ladder, best rung
first:

| `sourceType` | `sourceRef` | Use for |
| --- | --- | --- |
| `usda_sr_legacy` | the FDC id | anything in `data/usda-sr-legacy.ndjson` — the default |
| `regional_table` | citation, URL, date retrieved | a published composition table |
| `label` | brand, product, date the panel was read | local products where a real label is the best truth |
| `derived` | the analogue and the transformation | e.g. labaneh from strained yogurt, with the water loss written down |

USDA SR Legacy has no row for labaneh, nabulsi or akkawi cheese, freekeh,
molokhia, jameed, kunafa, halva or baklava — this was checked directly against
the dataset.

**Nor does it have a dough.** There is no `عجينة`, no `كعك`, no pastry base, so a
صفيحة and a كعك were written as pita plus a filling — right on the calories,
wrong on the reading, because the client sees "خبز عربي أبيض" under a name that
promised pastry. The reviewer caught exactly that on its second sweep. Those
dishes are named after what they contain until there is a dough worth citing;
that is the next food to source.

**Consumer calorie sites are not a source.** Searching them returns 10 kcal and
37 kcal for the same molokhia, and 5.6 g against 10.9 g of protein for the same
labaneh. Numbers like that break the first law. Published tables worth using:
the Lebanese University's *Food Composition Data: Traditional Dishes and Arabic
Sweets*, FAO's *Food Composition Tables for the Near East* (1982), and Bahrain's
table (2011) — all old and awkward to read, but real.

For dairy especially, **a local product label beats anything online**. A food
sourced below the top rung is marked provisional until a better rung is found.

## Food categories

Twelve today. The revised set splits `dairy_eggs`, whose two halves are told
apart in `dish-composition.ts` by looking for the word "egg" in an English name —
a hack that exists only because the category is wrong.

`grains` · `legumes` · `vegetables` · `fruits` · `dairy` · `eggs` · `poultry` ·
`meat` · `fish` · `nuts_seeds` · `fats_oils` · `sweets` · `sauces_condiments` ·
`herbs_spices` · `prepared`

`sauces_condiments` (tahini, garlic sauce, ketchup, mayonnaise, cooking cream,
pomegranate molasses, sumac) and `prepared` (falafel, hummus, pickles, olives,
canned tuna, canned corn, canned beans) are new. Both matter to the portion
engine, which reads the category to decide a sensible ceiling and what counts as
seasoning.

Known gaps to fill, named explicitly because they were missing entirely: cooking
cream, whole grain loaf (100 g), toast bread, basmati rice, canned foods, stevia
and other sweeteners, milk in its several fat levels.

Beverages are deliberately parked for now.

## The coverage grid

The catalog is finished when the grid is full, not when it feels big. Measured
at each dish's **base serving**, and enforced by `bun run db:check`.

| Slot | Bands | Minimum per cell |
| --- | --- | --- |
| breakfast | 250–400 · 400–550 · 550–700 | 12 |
| snack | 100–200 · 200–300 · 300–400 | 12 |
| lunch | 450–650 · 650–850 · 850–1050 | 12 |
| dinner | 300–450 · 450–650 · 650–850 | 12 |

Crossed with two further floors:

- at least **3 dishes per protein source** in every slot that takes one, so a
  week never has to repeat a protein to fill a day;
- at least **8 dishes whose `source` is not `home`** in breakfast, snack and
  lunch, so a client who eats out is plannable.

That lands at roughly **270–300 dishes** over roughly **220 foods**. Those
numbers are an estimate of where the grid fills, not a target to hit.

`db:check` also fails on:

- a declared axis whose value sits on more than 60% or fewer than 5% of dishes —
  the dead-tag detector that `local` (16 of 113) and `vegetarian` (64 of 113)
  would both have tripped;
- a food with no household portion, or a recipe line that contradicts its food's
  counting unit;
- a portion whose grams are USDA's *level measuring* spoon where a dietitian
  means a *heaped* one (see the note on `أرز أبيض مطبوخ`);
- a dish whose base serving falls outside every band of every slot it claims.

## Changing the catalog without breaking history

Weekly plans reference dishes by id, and a published plan must keep printing
exactly what the client was given.

- **Retire, never delete.** `dishes.is_active` already exists. An inactive dish
  disappears from search and from the model's catalog while old plans keep
  rendering.
- **Slugs are stable.** A re-seed updates rows in place; changing a slug orphans
  every plan that used it.
- Curated fields are written by a person; `note`, `nutrition`, `portions` and
  the file checksum are derived by `bun run db:build-catalog` and must never be
  hand-edited.

## Order of work

Each wave is shippable on its own.

0. **Machinery.** The four axis columns, the computed labels, the counting-unit
   rule, free items, whole servings for street and restaurant, **sides**, the
   grid and the new failures in `db:check`, and a backfill of the four axes onto
   the existing dishes. No new data beyond the handful of side dishes the
   mechanism cannot be exercised without — a صحن سلطة has to exist before a meal
   can carry one.
1. **Foods.** Fill the categories to roughly 220, including the local rows that
   need a table, a label or a documented derivation.
2. **Street and restaurant.** Shawarma, falafel sandwich, ka'ek with egg,
   manaqish, broasted, burger, pizza. The largest hole and the one nothing
   substitutes for.
3. **Assembled plates.** Around twenty by hand: grilled chicken breast with
   basmati and salad, fajita, pasta bolognese, tuna salad, grilled fish with
   sautéed vegetables, kabsa, oats with milk and fruit, vegetable omelette.
4. **Snacks, 150–400 kcal.** The measured gap.
5. **Breakfasts**, then **lunches and dinners**, until the grid is full.
6. **Retag and retire**, then rebuild the catalog page filters around the four
   axes. Done: the `tags` column is dropped, both filter panels and the clinic
   dish form ask the four questions, and the colour a meal card paints is its
   `source`.
7. **The client's measuring guide** — the hand-measure sheet, printable.
8. **Reviewer sweep.** Generate ten weeks across different client profiles and
   run `bun run plan:review` over each. It found three real data errors on its
   first ever run for under half a cent.
