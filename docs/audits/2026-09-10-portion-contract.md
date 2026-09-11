# The portion contract

Date: 10 September 2026. Branch: `codex/weekly-plan-catalog-audit`.

Milestone 2 of the [remediation plan](2026-09-09-weekly-plan-remediation-plan.md),
narrowed to the part that must exist before any food is added: **what a portion
is, as data.**

## The problem, measured

Every portion in `data/catalog-foods.json` carries a bilingual label and a weight
and nothing else. The label is prose and the weight is a number, and nothing
records what the two together are supposed to mean. So the same words mean
different objects in different rows:

| Food | One `ملعقة كبيرة` | Where the number came from |
| --- | ---: | --- |
| `thyme-dried` | 2.7 g | USDA level measuring spoon |
| `bulgur-cooked` | 8.4 g | USDA level measuring spoon |
| `lentils-cooked` | 12.3 g | USDA level measuring spoon |
| `olive-oil` | 13.5 g | USDA level measuring spoon |
| `labaneh` | 15 g | USDA level measuring spoon |
| `honey` | 21 g | USDA level measuring spoon |
| `rice-white-cooked` | **25 g** | **a person**, recorded as "heaped eating spoon, clinic practice, Hebron. Not a level measuring tablespoon." |

Twenty-two portions in the catalog are labelled `ملعقة كبيرة`. Twenty-one are
USDA's *level measuring tablespoon*. One — rice — is the *heaped eating spoon* a
dietitian actually means when she writes ملاعق, and it is roughly three times the
weight of the others.

Both objects are real and both deserve to be in the catalog. Olive oil genuinely
is prescribed by the level spoon; rice genuinely is served by the heaped one. The
defect is that **the data cannot tell them apart**, so neither the dietitian, the
client, nor the code can either.

What that costs, measured rather than imagined. `scripts/audit-portions.ts` ranks
every suspect spoon by how many shipped recipe lines actually use it:

| Food | One `ملعقة كبيرة` | Recipe lines |
| --- | ---: | ---: |
| **لبنة** (labaneh) | 15 g, level — **and it is the food's counted unit** | **11** |
| برغل مطبوخ | 8.4 g, level | 0 |
| عدس مطبوخ | 12.3 g, level | 0 |
| شوفان مطبوخ | 14.6 g, level | 0 |
| عدس ناشف / فاصولياء | 11–12 g, level | 0 |
| أرز أبيض مطبوخ | 25 g, **heaped, reviewed** | 60 |

So the damage today is narrower than the shape of the defect suggests, and worth
stating plainly: the grains and legumes are written by the cup in every shipped
recipe, so their level spoons are a loaded gun rather than a wound. Rice — the 60
lines that matter most — is already correct, because it is the one portion a
person wrote.

**Labaneh is the live one.** Eleven recipe lines resolve `ملعقة لبنة` to 15 g, and
because it is labaneh's *counted unit*, every new line a dietitian writes defaults
to it too. A dollop of labneh is not a levelled 15 ml spoon.

The wider cost is what happens next: the moment anyone writes «٦ ملاعق برغل», the
app resolves it to 50 g and builds the day's energy on that, and nothing reports a
problem, because by its own data nothing is wrong. Multiplying this catalog by
three with that hole open is how a rare error becomes a common one.

The same defect has a second face. `data/catalog-foods.json` ships a `رغيف` at
60 g, taken from USDA's `Bread, pita, white, enriched`. The loaf this clinic
prescribes is 80–100 g. Bread appears in most breakfasts, so the error is
systematic rather than occasional — and again, invisible, because a weight with no
recorded provenance cannot disagree with anything.

## The second defect: identity is a English label

`catalog_food_portions` is unique on `(food_id, label_en)`, and three separate
systems key their behaviour on that English string:

- `ingredient-units.ts` — `UNIT_STEPS` decides that `Cup` moves by 0.25 and `Loaf`
  by 0.5.
- `portion-limits.ts` — `UNIT_LIMITS` caps `Tablespoon` of `bulgur-cooked` at 9.
- `catalog_foods.counted_as` — stores `Tablespoon`, `Loaf`, `Piece` as the unit a
  food is always written in.

So renaming a label from `Tablespoon` to `Eating spoon` silently changes the step
size, drops the serving ceiling, and breaks the counted-unit link — three
behaviours, no error, no test failure. The catalog cannot be corrected without
breaking the code that reads it, which is the precise reason the wrong spoon
weights have survived.

We are about to multiply this catalog by three. The keying has to be fixed first.

## What a portion records

Each portion row gains four things. Grams stay exactly what they are: the
nutrition basis, written onto the ingredient at save time, never recomputed from a
portion afterwards.

### 1. `key` — stable identity

A slug, unique per food, assigned once and never rewritten: `cup`, `half-cup`,
`quarter-cup`, `level-tablespoon`, `heaped-spoon`, `teaspoon`, `loaf`,
`half-loaf`, `slice`, `piece`, `container`, `leaf`.

Derived portions take their key from the derivation family, deterministically —
`FAMILY_ROWS` in `portion-derivation.ts` already produces exactly this closed set,
so the key is a column beside a label that already existed rather than a new
decision. Curated portions declare their own.

Uniqueness moves from `(food_id, label_en)` to `(food_id, key)`. `counted_as`,
`UNIT_STEPS` and `UNIT_LIMITS` all move onto the key. After that a label is only
ever text a human reads, and renaming one is safe by construction.

### 2. `measure` — how it is measured

The fact the catalog currently cannot state. A closed vocabulary:

| `measure` | What it means | Typical foods |
| --- | --- | --- |
| `heaped_spoon` | An eating spoon, filled — ملعقة أكل ممتلئة | rice, bulgur, freekeh, labaneh, cooked legumes |
| `level_spoon` | A measuring spoon, levelled — ملعقة ممسوحة | oil, tahini, honey, ghee, spices |
| `cup` | A standard cup, levelled | milk, yogurt, cooked grains as a fallback |
| `loaf` | One whole flatbread of a stated size | pita, taboon, toast |
| `piece` | One countable item of a stated size | egg, apple, banana, falafel |
| `slice` | One cut off something bigger | watermelon, cheese, toast |
| `container` | One packed unit as sold | canned chickpeas, yogurt pot |
| `serving` | A reviewed serving of a finished dish | mujaddara, maqluba, soup |

This is what makes a client instruction unambiguous. `٦ ملاعق أرز ممتلئة` and
`ملعقة زيت ممسوحة` are different sentences, and the difference is now a column
rather than a convention nobody wrote down.

It is also what makes the weight checkable. A `heaped_spoon` at 8.4 g is a
contradiction the seed can refuse; today it is the shipped value for bulgur.

### 3. `step` and `maxPerMeal` — the practical grid

Moved out of the code tables and onto the row they describe. `step` is what one
press of `−`/`+` moves by in that unit; `maxPerMeal` is the ceiling a portioner may
not push a line past.

They belong to the food-and-unit pair, which is what the code tables were already
trying to express by keying two maps on `(slug, label_en)`. As data they are
visible next to the number they constrain, they survive a rename, and a limit
naming a portion that does not exist is a seed error rather than a rule that
silently stops applying.

### 4. `evidence` and `review` — where the number came from

```
evidence: {
  kind: 'local_measurement' | 'published_table' | 'usda_measure' | 'estimate'
  source: string          // citation, URL, or who weighed it and where
  date: string            // when it was established
  samples?: number        // how many servings were weighed
  rangeGrams?: [number, number]   // the spread observed
  note?: string
}
review: {
  status: 'candidate' | 'needs_review' | 'reviewed'
  reviewedBy?: string
  reviewedAt?: string
}
```

`usda_measure` is the honest label for the twenty-one level spoons already
shipping: they are real measurements of a real object, just not the object the
dietitian means. Marking them says so without deleting them.

A portion at `candidate` or `needs_review` may be offered in the editor with its
status visible, and may **not** be used as the counted unit of a food a generated
plan writes. That is the rule that stops an unreviewed number quietly looking
official.

## Where each part lives

`data/catalog-foods.json` is both the curated input and the generated output:
`db:build-catalog` regenerates `note`, `nutrition` and `portions` from USDA on
every run and preserves the curated fields around them. So the contract has to sit
on the curated side or the next build erases it.

- **Curated, preserved by the build:** a per-food `portionRules` block, keyed by
  portion `key`, carrying `measure`, `step`, `maxPerMeal`, `evidence`, `review`,
  and an optional `grams` override.
- **Derived, regenerated by the build:** the portion rows themselves and their
  weights, as today — except that each now carries its deterministic `key`, and
  the build merges the matching `portionRules` entry onto it **by key**.
- A `portionRules` entry naming a key the food has no portion for is a build
  error, not a silent no-op. This is the check that already exists for
  `LIMITED_FOODS`, generalised.

A curated `grams` override is how the pita loaf becomes 90 g and the bulgur spoon
becomes a heaped spoon, without hand-editing generated output and without the
next build reverting it.

## What this deliberately does not change

- **Grams remain the nutrition basis.** Every total is still built from
  `quantity_grams`, written at save time. Correcting a portion weight therefore
  cannot move an existing recipe or a published plan's nutrition.
- It *can* change how a saved amount is **worded** when reopened —
  `resolveSavedRow` re-expresses stored grams in the portion, so a 50 g bulgur line
  reads as "6 spoons" today and would read as "2 spoons" against a corrected
  heaped spoon. The nutrition is unchanged and the wording becomes correct, but
  existing drafts will read differently. Published plans keep their snapshot.
- **No portion weight is corrected in this change.** The contract lands first,
  every existing row is classified honestly against it, and the corrections are a
  separate reviewed change with the dietitian's numbers in it.

## Open decisions

These need the dietitian, and the pilot cards are the way to ask them.

1. **Labaneh's spoon**, because it is the one costing something today. Is
   `ملعقة لبنة` a levelled 15 ml spoon (15 g, what ships) or a dollop? If a dollop,
   what does it weigh? Eleven recipe lines and every future line depend on it.
2. **The heaped spoon's weight, per food.** Rice is recorded at 25 g from clinic
   practice. Popular Arabic sources put a filled spoon of cooked rice at 15–20 g
   and 100 g of cooked rice at about 6.5 spoons. The spread is wide enough that
   it must be settled by weighing rather than by citation, and the answer differs
   per food — a heaped spoon of rice, of labaneh and of lentils are not one number.
3. **The loaf.** 80–100 g is a range; a prescription needs one number per bread,
   or two breads.
4. **What the client reads.** `٦ ملاعق أرز ممتلئة` is unambiguous and slightly
   clumsy. The alternative is to keep `٦ ملاعق` and carry the convention in the
   plan's own preamble. This is her call, not ours.

`bun run scripts/audit-portions.ts` prints the current queue, ranked by recipe
lines affected. It is the list to work down, and it will grow teeth on its own as
foods are added: the seed refuses a heaped spoon nobody has reviewed.


## What the approved weights changed, 10 September 2026

The clinic supplied and approved a reference table of Levantine clinical
portions, and its **"المعتمد سريرياً"** column was applied. It is recorded as
`evidence.kind: 'published_table'` naming the table — not as a local weighing,
because it was not one. The stated ±3 g ranges are stored beside each weight, so
a heaped spoon never reads as more precise than it is.

**108 of 295 dishes changed; about 7,520 kcal moved** — 84 dishes up, 24 down.
The رغيف at 60 g → 90 g is most of it. لبنة gained a 30 g heaped spoon and its
eleven recipe lines moved onto it. The corrections downward are the American
produce sizes USDA ships: خيار 301 → 110 g, بطاطا 213 → 150 g.

أرز stayed at 25 g. The table's *levelled* figure of 15 g is what the popular
Arabic sources quoted in the section above were describing, which settles that
disagreement in favour of the number the clinic already had.

### `countedAs` is a stronger claim than it looks

Making the heaped spoon the counted unit for bulgur, lentils and oats broke
twenty-nine recipes, and the seed was right to refuse them. `counted_as` means a
food is **always** written in that unit — true of an egg and a رغيف, false of
bulgur, where a cup in a pilaf and a spoonful on a plate are both real
quantities. Only labaneh genuinely has one unit, and its recipes were naming the
wrong spoon rather than the wrong unit.

### The correction revealed a real gap

The 250–400 kcal breakfast band now holds **10 dishes where `MIN_PER_CELL` wants
12**, with thirteen more sitting at 401–460. Nothing was lost. Those breakfasts
were never light; the catalog had been advertising them as light because the
bread inside them was under-counted by a third of a loaf. The honest reading is
that this clinic's catalog needs two more genuinely light breakfasts, and that
is a question for the dietitian rather than a threshold to lower.
