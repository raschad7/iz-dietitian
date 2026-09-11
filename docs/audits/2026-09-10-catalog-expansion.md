# Expanding the ingredient catalog

Date: 10 September 2026. Branch: `codex/weekly-plan-catalog-audit`.
Milestone 4 of the [remediation plan](2026-09-09-weekly-plan-remediation-plan.md),
after the [portion contract](2026-09-10-portion-contract.md) and
[serving components](2026-09-10-serving-components.md).

**146 → 189 foods.** Fifty added, seven removed, and three defects fixed on the
way.

## What was wrong

### Every meat was mince

The catalog held ground beef and ground lamb and nothing else — no لحم خروف
قطع, no لحم عجل, no cut of beef. A dietitian writing a يخنة had one identity to
reach for and it was the wrong one.

### Raw protein nothing could prescribe

Seven entries — صدر دجاج ني، فخذ دجاج ني، صدر ديك رومي ني، لحم بقري مفروم ني،
لحم غنم مفروم ني، سلمون ني، بلطي ني — were used by **zero** recipe lines. Every
plan is written in cooked amounts and each had a cooked counterpart already. Their
only effect was to put a second "صدر دجاج" in the search for someone to pick
wrong. Removed.

Raw vegetables and dry grains stay: a salad tomato really is raw, and dry rice is
how rice is bought.

### Chicken could not be counted

`GRAMS_ONLY_CATEGORIES` gave meat, poultry and fish no portions at all. The reason
it recorded was sound — *"a cup of chicken is not how a plan is written"* — but it
went further than its own argument. A cup of chicken is not a serving; **a
drumstick is**, and USDA measures one.

The rule now bans the *volume* families and keeps whatever countable portion the
source actually measured:

| | |
| --- | ---: |
| صدر دجاج مشوي | 172 g قطعة |
| فخذ دجاج | 116 g |
| ورك دجاج | 199 g |
| دبوس دجاج | 96 g |
| جناح دجاج | 21 g |
| شرائح حبش | 16 g شريحة |
| كبدة | 68 g شريحة |
| سمك قاروص | 101 g فيليه |

A cut with no measured piece — a boneless stewing cube, mince — still has none,
because its weight is whatever went on the scale.

### The bug that found: "yield from"

Allowing meat to carry countable portions immediately produced **one حبة لحم غنم
of 272 g** and **313 g of ground lamb as a single piece**. Both came from labels
reading `1 unit, cooked (yield from 1 lb raw meat)` — what a pound of raw meat
cooks down to, which is a cooking loss and never a serving.

`isServable` already refused `yields` for countable units. It did not refuse
`yield from`, because until now nothing that carried such a label was allowed a
portion at all. It is refused for every family now. The right number was always on
the next line: `1 thigh without skin`, `1 wing, bone and skin removed`,
`0.5 breast, bone and skin removed`.

This is the watermelon-wedge error in its most expensive form, and it was one
build away from a plan telling a client to eat 313 g of lamb as one piece.

### A plausibility floor that rejected reality

A cup was floored at 24 g, from a stated 0.1 g/ml. **فشار is 8 g a cup and جرجير
20 g** — both correct, both refused. The floor had been set from the lightest food
anyone had entered rather than the lightest food there is. Now 0.025 g/ml, which
still catches a cup recorded at a teaspoon's weight.

### An alias on the wrong food

`صلصة بندورة` was an alias of both معجون بندورة and كاتشب. In Palestinian usage it
means the first and never the second, and it put 100 kcal of ketchup one search
result away from 82 kcal of tomato paste under a name that means only one of them.

## What was added

**Meat (6)** لحم غنم قطع، فخذ خروف مشوي، لحم بقري قطع، لحم عجل قطع، شرائح لحم
مشوية، كبدة.
**Poultry (4)** دبوس، ورك، جناح، شرائح حبش.
**Fish (3)** سمك قاروص، سمك بوري، تونة بالزيت — all cooked or canned.
**Grains and starch (4)** كينوا مطبوخة، بطاطا حلوة مشوية، ذرة مسلوقة، رقائق عجين.
**Snacks (5)** فشار، أقراص أرز، جرانولا، لوح جرانولا، شوكولاتة داكنة.
**Legumes (2)** ترمس مسلوق، حمص بطحينة.
**Seeds (3)** بذور الشيا، بذر كتان، بذور القرع.
**Fruit (12)** دراق، أفوكادو، أناناس، يوسفي، جريب فروت، كاكا، كرز، تمر، زبيب،
مشمش مجفف، تين مجفف، برقوق مجفف.
**Vegetables (6)** فلفل أحمر حلو، فلفل حار، سلق، جرجير، شمندر، كرفس.
**Dairy (2)** لبن عيران، جبنة عكاوي.
**Condiments (3)** دبس، صلصة الصويا، زيت ذرة.

Every number comes from `data/usda-sr-legacy.ndjson` by `sourceRef`. Nothing here
was typed by hand, and `catalog-dataset.test.ts` proves the committed file is
exactly what re-running the derivation produces.

Against the plan's target allocation the catalog now sits at 25 grains, 26
meat/poultry/fish/eggs, 16 dairy, 13 legumes, 31 fruit, 35 vegetables, 19
oils/nuts/seeds, 14 seasonings and specialty.

## Judgement calls to confirm with the dietitian

1. **لحم عجل → USDA veal** (`Veal, cubed for stew`, 188 kcal). In the Levant عجل
   often means young beef rather than milk-fed calf. If that is her usage, the
   right row is لحم بقري قطع at 212 kcal. A 24 kcal/100 g difference — small, but
   it is the wrong animal.
2. **جبنة عكاوي → `queso blanco`** (310 kcal). USDA has no Levantine brined white
   cheese. عكاوي and نابلسية are not the same cheese; they share one row here with
   نابلسية as an alias.
3. **The chicken piece weights are meat-only** — no bone, no skin. If she writes
   «دبوسين دجاج» meaning bone in, the number is different.

## Still missing, and why

Not in USDA at all, so each needs a published table or a product label:
**حلاوة طحينية، دبس رمان، مخلل لفت، خبز طابون، خبز صاج، كعك القدس، عجينة فطاير**
(only phyllo is available). Still blocked from before: **فريكة مطبوخة، سماق،
جميد، توست النور**. خبز النور itself is resolved — see the packet below.

## The half this does not do

A food on its own is invisible to a client — they only ever see dishes. These 50
are now available to the dietitian in search and in the dish editor, and they are
the raw material for the dish expansion, which is the other half of this step and
has not been done.


---

## The packets, 11 September 2026

Two of the three provisional products came back with their manufacturers' own
panels, photographed by the clinic. Both were worth waiting for.

### خبز النور was nearly five times too heavy

| | Provisional stand-in | The packet |
| --- | ---: | ---: |
| Per 100 g | 265 kcal | **102 kcal** |
| Loaf | 90 g | **50 g** |
| **One رغيف** | **238 kcal** | **51 kcal** |

مخابز النور (Tulkarm, عتيل) state the panel per رغيف against 50 g: 51 kcal,
protein 6.05 g, carbohydrate 6.05 g, fat 0.08 g, fibre 3.04 g, sodium 0.018 g,
sucrose not detected. It is wheat flour, wheat bran, natural yeast and a little
sea salt — a high-bran bread, which is why it is so light.

The packet prints the *same* figure for protein and for carbohydrate, which is
unusual enough to check: 4/4/9 on its own numbers returns 49 kcal against the 51
it states, so the panel agrees with itself. Recorded as printed rather than
corrected. Total sugars are not given — only sucrose, as "not detected" — so
total sugar stays `null`.

**This bread is in every day of both weekly plans.** The stand-in would have
overstated a week by roughly 1,300 kcal, which is the whole argument for
`needs_review` being a state the catalog can hold rather than a note in someone's
head.

### فلوربو

Flourbo chocolate cookies, no added sugar, 185 g pack. Panel per 31 g serving:
130 kcal, fat 6 g, saturated 1 g, carbohydrate 19 g, fibre 3 g, total sugar 1 g,
added sugar 0 g, protein 2 g, sodium 0.1 g. Scaled to 100 g: 419 kcal.

The stand-in had it at 451 kcal — close, for once. What the panel does *not* say
is how many biscuits its 31 g serving is. The clinic prescribes «قطعتين», which
makes two the reading, so one قطعة is recorded at 15.5 g and left
`needs_review` until somebody weighs one.

### Still provisional

**خبز شراك** — no packet, because it is sold loose off the saj. It keeps white
pita's composition and a 60 g loaf, both marked `estimate`.
