# Serving controls: what a client can actually portion

Date: 10 September 2026. Branch: `codex/weekly-plan-catalog-audit`.
Milestone 3 of the [remediation plan](2026-09-09-weekly-plan-remediation-plan.md),
following the [portion contract](2026-09-10-portion-contract.md).

## The defect

`dish_ingredients.is_primary` marked a line as adjustable, at most three per
dish, and each marked line got its own `−/+`. On an assembled plate that is
right: chicken and rice arrive in separate spoonfuls and a dietitian moves them
independently.

On a cooked mixed dish it was a lie. مجدرة shipped with the rice marked and the
lentils marked, so the board offered to raise the rice by six spoons and leave
the lentils where they were — an instruction nobody can follow, because they were
boiled in the same pot. The client's own card read the same way: «أرز ٦ ملاعق،
عدس ١٩٨ غ، بصل ٥٠ غ», which describes cooking a مجدرة rather than eating one.

Two smaller faults travelled with it:

- **The cap was a display rule wearing a data rule's clothes.** Three marked
  lines kept the panel short, so a dish with four separately served parts had to
  pretend one of them was fixed.
- **The oil in a cooked dish was frozen.** `portioning.ts` holds any line under
  15 kcal where the recipe put it — correct for a teaspoon of oil beside a
  breakfast, wrong for the oil a مجدرة was cooked in, which is part of the thing
  being served.

## What a component is

A **component** is what the client is served: something they can take more or
less of without taking the dish apart. It may be one recipe line or several that
came out of one pot. What makes it a component is that it is *served* as one
thing, not that it is nutritionally important.

Stored as three nullable columns on `dish_ingredients` and again on
`weekly_plan_meal_ingredients` — `component_key`, `component_name_ar`,
`component_name_en` — beside the `is_primary` the group now shares. Null is the
ordinary case and the one every recipe written before this is in.

**Flattened onto the line rather than given a table.** A component is read on
every surface that renders a meal, and a join for two strings would cost more
than the rule that keeps them equal. `componentProblems()` is that rule, and it
runs in all three places a recipe can be written: the seed, the clinic dish
editor's schema, and the dataset build.

The meal table gets its own copy for the same reason it already copies the food
and the flag: re-authoring a dish must not regroup a meal that was already
prescribed.

## How a component moves

| | One line | A group |
| --- | --- | --- |
| Step | its own unit — half a loaf, one egg, 10 g of meat | a tenth of the recipe amount, rounded to 5 g |
| Ceiling | its own, per food and category | none of its own; the meal's 2000 g guard still binds |
| Shown as | the unit it was written in | grams |
| Lines inside | — | scale by one ratio, counts dropped |

A group has no unit of its own, so a share is the only honest step: a dietitian
adjusting a cooked plate is thinking "a bit more", not in the units of any one
thing inside it. Proportional keeps it sane across sizes — a 150 g bowl moves by
15 g and a 600 g platter by 60.

The **recipe amount is the origin of the grid**, not the current amount. That is
what lets 410 → 450 → 490 come back down to exactly 410. Feeding the control the
adjusted amount instead makes every press measure itself against the last one and
410 → 450 returns to 405; the `/dev/meals` harness did exactly that until it was
fixed, which is the case worth remembering.

Dropping the count inside a group is deliberate. «٦ ملاعق أرز» is true of the pot
and false of the plate. The grams stay visible so the dietitian can still inspect
what is in it, which is the part she needs.

Changing the ratio between lines is a **recipe edit**. This control only ever
does a serving adjustment, which is the separation Milestone 3 asked for.

## One press, one write

`setMealIngredient` took one food and now takes a list. A مجدرة is one control
over four lines, and four separate calls would each materialise the meal again
and leave three intermediate states holding proportions no recipe specified. The
action posts them as one JSON field rather than repeated form entries, so the
request is parsed whole or rejected whole. Every food is checked against the
plate before anything is written.

## What was grouped

**71 of 295 dishes**, by family:

| Family | Dishes | What is one thing, and what is beside it |
| --- | ---: | --- |
| Mujaddara | 3 | rice/bulgur, lentils, onion, oil — egg and salad beside |
| Stuffed vegetables and vine leaves | 7 | the filling is cooked inside |
| Baked trays (kibbeh, kofta) | 5 | one tray |
| Maqluba | 4 | rice and vegetables; **the meat is laid on top and stays separate** |
| One-pot rice (qidreh, maftoul, ouzi, fried rice) | 6 | the grain and what was cooked in it; meat separate |
| Stews | 12 | the stew; **the rice or bread beside it stays separate** |
| Soups | 3 | one bowl |
| Shakshuka | 3 | eggs cooked into the tomato; bread beside |
| Fatteh | 3 | assembled into one bowl and eaten with a spoon |
| Pasta | 9 | sauce and pasta are tossed |
| Baked and sweet pieces | 13 | one piece |

Nutrition is unchanged: at one serving `scaleRecipe` returns the recipe
untouched, so every dish holds the grams it held. What changes is how a scaled
meal divides, and how every meal reads.

Assembled plates were deliberately left alone — chicken and rice, egg and bread,
fruit and yoghurt. Each line on them really is served on its own.

## Left for the dietitian

- **Sandwiches and restaurant items.** The plan's own note is that a bought
  sandwich follows its actual portion options, and that preparation source alone
  should not ban sensible halves. Fifteen or so of these overlap the
  fixed-portion rules in `portioning.ts` and deserve one pass of their own rather
  than being folded into this one.
- **Clinic-side grouping.** The dish editor carries a dish's grouping through an
  edit untouched but offers no control to create one. The shipped catalog is
  grouped in `data/dishes.json`; a clinic writing its own مجدرة cannot yet say so.
- **The families above are a reading of ordinary Palestinian practice, not her
  ruling.** مقلوبة's meat and the rice beside a يخنة are the two most worth
  confirming.
