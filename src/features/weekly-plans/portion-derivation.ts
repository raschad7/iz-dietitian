/**
 * Turns a food's *measured* household portions into the set the catalog offers.
 *
 * This is the rule that used to run at render time in `ingredient-units.ts`,
 * against a USDA label parsed on every keystroke. It runs **once, at dataset build
 * time** now (`scripts/build-catalog-dataset.ts`), and its output is committed to
 * `data/catalog-foods.json` as real rows in `catalog_food_portions`. Same
 * arithmetic, same conservatism — but a portion is data a dietitian could correct,
 * not a string the UI re-derives and can only get wrong in the same way forever.
 *
 * **Nothing here invents a weight.** Every portion is either one USDA measured
 * or a plain fraction of one: half a cup is half of *that* cup, a teaspoon is a
 * third of *that* tablespoon. A food whose measures are all weights ("3 oz") or
 * unrecognised units yields no portions at all and is measured in grams, which is
 * the honest answer rather than a friendly guess.
 *
 * ## Why it reads the whole list
 *
 * It used to read one portion - whichever `food_portion.csv` happened to put
 * first - because that is all the extract kept. For 66 of 91 catalog foods that
 * first row is a cup, which is how the catalog came to offer "1 cup, quartered or
 * chopped" for an apple and had no way to say "1 medium". USDA publishes the
 * medium apple; it was being discarded upstream.
 *
 * So the extract keeps every measure now, and this picks: **the unit a person
 * serves in first**, then one more to fall back on. A dietitian writes `1 تفاحة`
 * and `7 ملاعق أرز`, not `1.2 cups of apple`.
 */

import type { PortionEvidence, PortionKey, ReviewStatus } from './portion-contract';

/** A portion as the dataset stores it, before it becomes a `catalog_food_portions` row. */
export type PortionSeed = {
  /**
   * The portion's stable identity — see `portion-contract.ts`.
   *
   * Everything that used to key on `labelEn` keys on this: the step size, the
   * serving ceiling, the food's counted unit, and the seed's own upsert. A label
   * is text a human reads, and renaming one is no longer a behaviour change.
   */
  key: PortionKey;
  labelAr: string;
  labelEn: string;
  /** What one of this portion weighs. Always > 0. */
  grams: number;
  /** The one a freshly picked food starts in. Exactly one per food, when any exist. */
  isDefault: boolean;
  sortOrder: number;
  /**
   * Where this weight came from, when it is not the food's own USDA measure.
   *
   * Carried only by a curated portion - a unit a dietitian uses that USDA does not
   * publish. Every such weight is a clinical decision rather than a derivation, and
   * a row that cannot say where it came from should not be in a prescription.
   */
  sourceRef?: string;

  /* --- the portion contract, all curated and all optional -------------------
     Merged onto a derived row by key at build time, never derived. See
     `portion-contract.ts` for what each one means and why it is data. */

  /** Overrides `defaultStepOf(key)` where a food genuinely needs its own grid. */
  step?: number;
  /** The most of this food, in this unit, one meal may hold. */
  maxPerMeal?: number;
  evidence?: PortionEvidence;
  reviewStatus?: ReviewStatus;
  reviewedBy?: string;
  /** ISO date. */
  reviewedAt?: string;
};

/**
 * Categories a dietitian weighs rather than measures by volume.
 *
 * The source data does carry "1 cup, chopped or diced" for cooked chicken, but "a
 * cup of chicken" is not how a plan is written — meat, poultry and fish go by
 * grams. A deliberate product choice, carried over from Phase 1.
 *
 * It used to mean *no portions at all*, which went further than the reason for
 * it. A cup of chicken is not a serving; a drumstick is, and so is a slice of
 * deli turkey — those are countable objects a client is handed, and USDA
 * measures them. The dietitian asked for chicken by the piece, and the argument
 * against it was only ever an argument against the volume units.
 *
 * So the categories keep their ban on volume and keep whatever countable
 * portions the source actually measured. A cut with no measured piece — a
 * boneless breast, a stewing cube — still has none, because its weight is
 * whatever was put on the scale.
 */
export const WEIGHED_CATEGORIES = new Set(['meat', 'poultry', 'fish']);

/**
 * The families a weighed category may still carry: things you can count.
 *
 * `piece` and `slice` only. A cup, a spoon and a loaf all describe a volume or a
 * shape that meat does not come in.
 */
const COUNTABLE_FAMILIES = new Set<Family>(['piece', 'slice']);

/** The household families a measured portion can resolve to. */
type Family = 'cup' | 'tbsp' | 'tsp' | 'slice' | 'piece' | 'loaf' | 'leaf' | 'container' | 'none';

/**
 * Unit words meaning "one countable item" — an egg, a fillet, a date.
 *
 * `wedge` is deliberately **not** here; see `SLICE_WORDS`.
 */
export const PIECE_WORDS = new Set([
  'large', 'medium', 'small', 'extra', 'unit', 'piece', 'each', 'whole', 'fillet',
  'link', 'patty', 'stick', 'clove', 'ear', 'fruit', 'pod', 'strip',
  'ball', 'bar', 'cookie', 'cracker', 'chip', 'date',
  // Cuts a client is handed whole: دبوس، ورك، جناح. USDA measures each of them,
  // and `MAX_PIECE_GRAMS` is what stops "1 leg of lamb" joining them.
  'drumstick', 'thigh', 'wing', 'leg', 'breast', 'chop',
]);

/**
 * Unit words meaning "one cut off a bigger thing" — شريحة.
 *
 * `wedge` sat in `PIECE_WORDS` and is the reason a plan could say **حبة بطيخ**.
 * USDA publishes watermelon as "1 wedge (approx 1/16 of melon), 286 g"; read as a
 * piece that becomes "one watermelon", and one watermelon is 4,518 g — the number
 * USDA publishes on the very next line. The weight was right and the word was
 * wrong, which is the worse of the two failures: a client reading حبة بطيخ has
 * been told to eat a melon.
 *
 * A wedge is a slice, and شريحة is the word already in `FAMILY_ROWS` for it.
 */
const SLICE_WORDS = new Set(['slice', 'wedge']);

/** Unit words meaning "one whole flatbread or loaf" — a pita, a tortilla, a roll. */
const LOAF_WORDS = new Set(['pita', 'loaf', 'tortilla', 'flatbread', 'naan', 'bun', 'roll', 'bagel']);

/**
 * Unit words meaning "one packed container" — a tin of chickpeas, a pot of yogurt.
 *
 * Kept apart from `piece` because علبة is what a dietitian writes and حبة is not:
 * "one piece of chickpeas" is not a quantity anybody acts on.
 */
const CONTAINER_WORDS = new Set(['can', 'container', 'jar', 'package', 'packet', 'tin', 'bottle']);

/**
 * The lightest thing a علبة may be.
 *
 * USDA measures single-serve sachets with the same words as real packaging:
 * `1 container, individual` is an 11 g coffee creamer pod, `1 packet` is a 10 g
 * mayonnaise sachet and a 9 g ketchup one. Read as a علبة they told a dietitian
 * that a tub of cooking cream weighs 11 grams.
 *
 * The word cannot separate them — a 85 g `1 package, small (3 oz)` of cream
 * cheese is a real علبة and uses the same noun. The weight can: every genuine
 * one in the catalog is 85 g or more, and every sachet is under 12.
 */
const MIN_CONTAINER_GRAMS = 50;

/** Singular only: "2 leaves" of mint is 0.15 g a leaf, which is not a portion anyone uses. */
const LEAF_WORDS = new Set(['leaf']);

/**
 * Unit words that name a **weight or a volume** — never a countable item.
 *
 * These are refused outright rather than left to fall through to the word scan
 * in {@link classifyPortion}, and that scan is exactly why they have to be:
 * USDA writes almonds as `1 oz (23 whole kernels)`, the scan finds `whole` in
 * `PIECE_WORDS`, and an ounce becomes **one حبة لوز of 28.4 g**. That is the
 * catalogue telling a client to eat twenty-three almonds where the dietitian
 * wrote one, and it shipped: the same class of error as the watermelon wedge
 * that became a whole melon, arrived by the opposite route.
 *
 * A weight is a weight however the label describes what is in it. The count in
 * the brackets describes *the ounce*; it is not a unit of its own — and USDA
 * publishes the real one separately, `1 almond = 1.2 g`, which is the row the
 * scan below is now free to find.
 */
const MEASURE_WORDS = new Set([
  'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds',
  'g', 'gram', 'grams', 'kg', 'kilogram', 'mg',
  'ml', 'milliliter', 'millilitre', 'l', 'liter', 'litre',
  'quart', 'quarts', 'pint', 'pints', 'gallon', 'gallons',
  'fl', 'floz',
]);

/**
 * Unit words for one nut, seed or kernel out of a handful.
 *
 * The clinic counts nuts and does not weigh them — "١٠ حبات لوز" is what a plan
 * says — and USDA does publish the figures for it: `1 almond` at 1.2 g, `1
 * kernel` of pistachio at 0.7 g, `10 nuts` of hazelnut at 14 g. None of those
 * words was countable to `classifyPortion`, so every nut in the catalogue was
 * offered by the cup, and almonds were offered by an ounce wearing the word حبة.
 */
const KERNEL_WORDS = new Set(['nut', 'nuts', 'kernel', 'kernels']);

/**
 * The amount and unit word a USDA portion label leads with.
 *
 * The dataset builder guarantees the label starts with its own count — "1 large",
 * "3 oz", "0.5 cup, diced" — so the first token is the amount and the next word is
 * the unit. Anything after (", chopped or diced") is descriptive and dropped.
 */
export function parsePortionLabel(label: string): { amount: number; unit: string } | null {
  const match = label.trim().toLowerCase().match(/^([\d.]+)\s+(.+)$/);
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const unit = match[2]!.split(/[\s,]+/)[0] ?? '';
  return unit ? { amount, unit } : null;
}

/** Maps a measured unit word to the household family the catalog offers. */
export function classifyUnit(unit: string): Family {
  if (unit === 'cup') return 'cup';
  if (unit === 'tablespoon' || unit === 'tbsp') return 'tbsp';
  if (unit === 'teaspoon' || unit === 'tsp') return 'tsp';
  if (SLICE_WORDS.has(unit)) return 'slice';
  // Loaf before piece and container: "loaf", "roll" and "bun" read as رغيف, not قطعة.
  if (LOAF_WORDS.has(unit)) return 'loaf';
  if (CONTAINER_WORDS.has(unit)) return 'container';
  if (LEAF_WORDS.has(unit)) return 'leaf';
  if (PIECE_WORDS.has(unit)) return 'piece';
  // Weight and volume units (oz, lb, gram, ml, quart…) and anything unknown carry
  // no household portion — grams is the honest answer.
  return 'none';
}

/**
 * The household units a clinic may choose when adding its own food, and the
 * bilingual labels each becomes.
 *
 * The dietitian picks a unit key in the custom-food dialog; `createCustomFood`
 * turns it into one `catalog_food_portions` row with these labels. The same six
 * keys and the same labels appear in migration 0029, which is what carried the
 * pre-Phase-2 single-portion column across — so a food added before the change and
 * one added after are indistinguishable afterwards.
 */
export const CUSTOM_UNIT_LABELS = {
  loaf: { key: 'loaf', labelAr: 'رغيف', labelEn: 'Loaf' },
  piece: { key: 'piece', labelAr: 'حبة', labelEn: 'Piece' },
  slice: { key: 'slice', labelAr: 'شريحة', labelEn: 'Slice' },
  cup: { key: 'cup', labelAr: 'كوب', labelEn: 'Cup' },
  tbsp: { key: 'level-tablespoon', labelAr: 'ملعقة كبيرة', labelEn: 'Tablespoon' },
  tsp: { key: 'teaspoon', labelAr: 'ملعقة صغيرة', labelEn: 'Teaspoon' },
} as const satisfies Record<string, { key: PortionKey; labelAr: string; labelEn: string }>;

export type CustomUnitKey = keyof typeof CUSTOM_UNIT_LABELS;

/**
 * The household unit to suggest for a custom food, guessed from its Arabic name —
 * bread → رغيف, oil → ملعقة, rice/lentils → كوب, eggs/produce → حبة. Grams when
 * nothing obvious fits, so the dietitian is never fighting a wrong default.
 *
 * A *suggestion*, and only ever a pre-selected dropdown value the dietitian can
 * change before saving — which is what makes a guess acceptable here and was never
 * acceptable for a name or a nutrition value.
 */
export function suggestUnitKey(nameAr: string): CustomUnitKey | 'g' {
  const name = nameAr.trim();
  const has = (...needles: string[]) => needles.some((needle) => name.includes(needle));

  if (has('خبز', 'رغيف', 'صمون', 'كماج')) return 'loaf';
  if (has('توست', 'شريحة')) return 'slice';
  if (has('زيت', 'سمن', 'طحين', 'طحينة', 'دبس', 'عسل', 'صلصة')) return 'tbsp';
  if (has('أرز', 'ارز', 'رز', 'برغل', 'فريكة', 'عدس', 'حمص', 'فول', 'حليب', 'لبن', 'شوربة')) return 'cup';
  if (has('بيض', 'بيضة', 'تفاح', 'موز', 'برتقال', 'بندورة', 'خيار', 'بطاطا', 'حبة')) return 'piece';
  return 'g';
}

/** Round to a tenth: the source is ~3 significant figures, and this keeps ½/¼ splits off float noise. */
function g(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Every family's rows, as multiples of the measured base.
 * `[key, labelAr, labelEn, factor]`.
 *
 * The key leads because it is the identity; the two labels are how it is read in
 * each language. Note that the tablespoon derives as `level-tablespoon`: what USDA
 * measured is a levelled 15 ml spoon, and saying so is what leaves room for the
 * dietitian's heaped `ملعقة` to exist on the same food as its own row.
 */
const FAMILY_ROWS: Record<
  Exclude<Family, 'none'>,
  readonly (readonly [PortionKey, string, string, number])[]
> = {
  cup: [
    ['cup', 'كوب', 'Cup', 1],
    ['half-cup', 'نصف كوب', 'Half cup', 1 / 2],
    ['quarter-cup', 'ربع كوب', 'Quarter cup', 1 / 4],
  ],
  tbsp: [
    ['level-tablespoon', 'ملعقة كبيرة', 'Tablespoon', 1],
    // A teaspoon is a third of a tablespoon by definition, not by estimate.
    ['teaspoon', 'ملعقة صغيرة', 'Teaspoon', 1 / 3],
  ],
  tsp: [['teaspoon', 'ملعقة صغيرة', 'Teaspoon', 1]],
  slice: [['slice', 'شريحة', 'Slice', 1]],
  piece: [['piece', 'حبة', 'Piece', 1]],
  loaf: [
    ['loaf', 'رغيف', 'Loaf', 1],
    ['half-loaf', 'نصف رغيف', 'Half loaf', 1 / 2],
  ],
  leaf: [['leaf', 'ورقة', 'Leaf', 1]],
  container: [['container', 'علبة', 'Container', 1]],
};

/**
 * The portions a food offers, from its one measured household portion.
 *
 * Returns `[]` — meaning "grams only" — for a suppressed category, a missing or
 * non-positive weight, a label with no leading count, or a unit that names a weight
 * rather than a household measure.
 */
/** One measured portion as the USDA extract records it. */
export type MeasuredPortion = { grams: number; label: string };

/**
 * Which unit a food should lead with, best first.
 *
 * A countable thing beats a volume: nobody asks for a cup of apple. Bread leads
 * over everything because a رغيف is the only unit anyone states it in. Spoons come
 * last because a food measured in spoons is a condiment, and its cup - if it has
 * one - is the more useful default.
 */
const FAMILY_PRIORITY: readonly Exclude<Family, 'none'>[] = [
  'loaf',
  'piece',
  'container',
  'slice',
  'cup',
  'tbsp',
  'tsp',
  'leaf',
];

/**
 * Categories whose **small** spoon leads.
 *
 * A dietitian prescribes oil by the teaspoon. One is about 45 kcal, which is a
 * number she can put against a target; a tablespoon of olive oil is 120 and lands
 * on the plate as "نصف ملعقة كبيرة" — a fraction nobody measures and nobody
 * serves. The clinic said so directly about زيت زيتون، سمنة and زبدة.
 *
 * Only the fats. طحينة and زبدة الفول السوداني are spread by the tablespoon and
 * written that way, and they are `nuts_seeds`.
 *
 * Both spoons still exist on the food either way; this decides which one a fresh
 * line opens in and which one the settings guide prints.
 */
const TEASPOON_FIRST_CATEGORIES = new Set(['fats_oils']);

/**
 * How many unit families one food offers.
 *
 * Two. The one it is served in and one to fall back on - an apple in حبة and in
 * كوب. A longer menu is a menu the dietitian has to read before she can use it,
 * and every extra row is another way to record the same amount differently.
 */
const MAX_FAMILIES = 2;

/** Size words that make a label a countable item even when the unit word is the food's own name. */
const SIZE_WORDS = ['medium', 'large', 'small'];

/**
 * Categories a person is served by the spoon and by nothing else.
 *
 * A cup of olive oil is 216 g and about 1,900 kcal. It is a bottle measure, not a
 * serving, and offering it at all invites a recipe to be written in one. USDA also
 * lists honey by the 14 g packet, which is a sachet rather than an amount anyone
 * prescribes. Both are written in spoons and always were - this keeps them there
 * now that a food can offer more than one family.
 *
 * `sauces_condiments` joined them when the 10 g "1 packet" of mayonnaise was
 * refused as a علبة and a 220 g **cup** of it inherited the default. That is the
 * category whose own definition is "small amounts that season a dish rather than
 * compose it", so the spoon was always the only unit it should have offered.
 */
const SPOON_ONLY_CATEGORIES = new Set(['fats_oils', 'sweets', 'sauces_condiments']);

/** The only families those categories may offer. */
const SPOON_FAMILIES = new Set<Family>(['tbsp', 'tsp']);

/**
 * The graded size a category counts in, where it is not "medium".
 *
 * Eggs are sold by grade, and the reference unit everywhere - including USDA's own
 * "1 cup (4.86 large eggs)" - is the LARGE egg at 50 g. Preferring the medium
 * would make one حبة mean 44 g of a raw egg and 50 g of a boiled one: the same egg
 * weighing two different amounts depending on whether it had been cooked.
 */
const PREFERRED_SIZE: Record<string, string> = { eggs: 'large', dairy_eggs: 'large' };

/** Nothing a person is served in one sitting weighs this much. */
const MAX_SERVABLE_GRAMS = 1000;

/**
 * The heaviest thing that may be called **one حبة**.
 *
 * A piece is what a person picks up and eats: an apple, an egg, a banana, a
 * mango. `MAX_SERVABLE_GRAMS` was the only ceiling and it is a ceiling on a
 * *serving*, which let three whole vegetables through as countable items —
 * a 908 g cabbage, a 588 g cauliflower, a 552 g cantaloupe — because USDA writes
 * them "1 melon, medium" and `classifyPortion` reads `medium` as "countable".
 * A recipe line saying `1 حبة ملفوف` is 908 g of cabbage.
 *
 * 350 g, because the largest thing anyone eats whole in this catalog is a mango
 * at 336 g. Above it the food simply falls back to its next family — a cup for
 * the cabbage, a wedge for the melon — which is how those foods are actually
 * served and what a dietitian would have written by hand.
 *
 * It bounds `piece` only. A رغيف, an علبة and a كوب are all bought and served in
 * one, and their weights are already what they say they are.
 */
const MAX_PIECE_GRAMS = 350;

/**
 * The lightest thing that may be called **one حبة**.
 *
 * A piece is something a person picks up and counts, and below about half a gram
 * nobody does: a pine nut is 0.17 g, so `30 حبة صنوبر` would be an instruction to
 * count out thirty pine nuts for five grams of food. Those go by the spoon and
 * the cup, which is how they are actually served, and the food falls back to
 * them.
 *
 * Half a gram, because the lightest thing this catalogue genuinely counts is a
 * pistachio kernel at 0.7 g — "٢٠ حبة فستق" is a real line in a real plan.
 */
const MIN_PIECE_GRAMS = 0.5;

/**
 * Unit words naming the *whole plant* — what you carry home from the market.
 *
 * USDA writes cauliflower "1 head small (4" dia.), 265 g" and cantaloupe
 * "1 melon, medium, 552 g". `classifyPortion` reads the `small` and the `medium`
 * as "this is countable", so both became a حبة: a plan could say **حبة زهرة** and
 * mean a whole cauliflower.
 *
 * A head is a purchase. The serving is the cup beside it, which is what the food
 * falls back to once these are refused.
 *
 * Matched against the label's **leading unit word only**, never the whole label —
 * watermelon's real serving is "1 wedge (approx 1/16 of melon)", and a substring
 * scan would throw away the wedge for mentioning the melon it was cut from.
 */
const WHOLE_PLANT_WORDS = new Set(['head', 'bunch', 'melon', 'bulb', 'stalk']);

/**
 * Whether a measured portion is one ordinary serving of the food.
 *
 * Anything failing this is skipped entirely, so the food falls back to its next
 * family — which is how it is actually served.
 *
 * `NLEA serving` is a labelling construct and `as purchased` says so itself.
 *
 * **`yields` is refused only for a countable unit.** It describes what something
 * *produces*: "1 wedge yields 5.9 g" is the juice out of a lemon wedge, and a
 * شريحة of lemon juice is not a thing. But "1 can (12 oz) yields 211 g" is the
 * drained weight of a tin — the most useful number a canned food has, and the one
 * a dietitian writes علبة against.
 */
function isServable(label: string, unit: string, family: Family, grams: number): boolean {
  const lower = label.toLowerCase();

  if (lower.includes('nlea')) return false;
  if (lower.includes('as purchased')) return false;
  if (WHOLE_PLANT_WORDS.has(unit)) return false;
  if (lower.includes('yields') && (family === 'piece' || family === 'slice')) return false;

  /*
    "yield from" is a cooking loss, never a serving — and it is refused for every
    family, unlike the `yields` rule above.

    USDA publishes meat as `1 unit, cooked (yield from 1 lb raw meat) = 272 g`:
    what a pound of raw lamb cooks down to. Read as a countable unit it becomes
    **one حبة لحم غنم of 272 g**, and 313 g of ground lamb as a single piece. It
    is the watermelon-wedge error in its most expensive form, and it appeared the
    moment meat was allowed to carry countable portions at all.

    The right number is always on the next line: `1 thigh without skin`,
    `1 wing, bone and skin removed`, `0.5 breast, bone and skin removed`. Refusing
    the yield is what lets the derivation find it.
  */
  if (lower.includes('yield from')) return false;

  return grams <= MAX_SERVABLE_GRAMS;
}

/**
 * The family a measured label belongs to.
 *
 * Falls back to scanning the label's words when the leading unit is unrecognised,
 * which is what `1 Potato medium (2-1/4 to 3-1/4 dia)` needs: the unit word is the
 * food's own name, and `medium` is the part that says it is a countable item.
 *
 * **The fallback never runs for a weight or a volume.** See `MEASURE_WORDS`: an
 * ounce described as "23 whole kernels" is an ounce, and reading the description
 * as the unit is how one almond came to weigh 28.4 g.
 *
 * `nameEn` answers the case the scan cannot: `1 almond` for *Nuts, almonds*,
 * `1 olive`, `1 apricot`. There is no adjective to find and no generic unit
 * word — the label counts the food itself, which is the plainest statement of a
 * countable item there is. It is the `medium` fallback reached from the other
 * side.
 *
 * **That case requires the label to count exactly one**, and the restriction is
 * load-bearing. USDA writes `10 grapes = 49 g`, `10 beans (4" long) = 55 g` and
 * `10 watermelon balls = 122 g`: the ten is there *because* one is too small to
 * publish, which is the same fact as "nobody counts these one at a time". Read
 * as a unit, they make حبة بطيخ a 12 g melon ball — the watermelon error again,
 * from a third direction. A label that counts one is a statement about the
 * thing; a label that counts ten is a weight for a handful.
 *
 * `KERNEL_WORDS` is the deliberate exception and takes any count, because a
 * handful is exactly how nuts are served and `10 nuts = 14 g` is the only figure
 * USDA gives for a hazelnut. The floor on how light a حبة may be
 * (`MIN_PIECE_GRAMS`) is what keeps that from reaching a pine nut.
 */
export function classifyPortion(label: string, unit: string, nameEn = '', amount = 1): Family {
  const direct = classifyUnit(unit);
  if (direct !== 'none') return direct;

  // A weight is a weight, whatever the label says is in it.
  if (MEASURE_WORDS.has(unit)) return 'none';

  const words = label.toLowerCase().split(/[\s,()]+/);
  if (words.some((word) => SIZE_WORDS.includes(word))) return 'piece';
  if (words.some((word) => PIECE_WORDS.has(word))) return 'piece';
  if (KERNEL_WORDS.has(unit)) return 'piece';
  if (amount === 1 && namesTheFood(unit, nameEn)) return 'piece';

  return 'none';
}

/**
 * Whether the unit word is the food's own name — `almond` against
 * *Nuts, almonds*.
 *
 * Crudely singular: the name is matched word by word, with a trailing `s`
 * allowed on either side. A stemmer would be a dependency for a rule that has to
 * hold over one committed dataset of 145 foods, and it would still get `leaves`
 * wrong.
 */
function namesTheFood(unit: string, nameEn: string): boolean {
  if (!unit) return false;

  const singular = (word: string) => (word.endsWith('s') ? word.slice(0, -1) : word);
  const target = singular(unit);

  return nameEn
    .toLowerCase()
    .split(/[^a-z]+/)
    .some((word) => word.length > 2 && singular(word) === target);
}

/**
 * How good a candidate is for its family, lower being better.
 *
 * Within `piece` this is what picks the 182 g medium apple over the 101 g extra
 * small and the 223 g large. Within `cup` it prefers the plain "1 cup" to "1 cup,
 * mashed" - the same volume described three ways is one unit, and the plainest
 * label is the one that reads as that unit rather than as a preparation.
 */
function candidateRank(label: string, category: string): number {
  const lower = label.toLowerCase();
  const preferred = PREFERRED_SIZE[category];

  if (preferred && lower.includes(preferred)) return 0;
  if (lower.includes('medium')) return 1;
  // "1 fruit", "1 apricot", "1 pomegranate" - a bare count of the thing itself.
  if (!lower.includes(',') && !lower.includes('large') && !lower.includes('small')) return 2;
  if (lower.includes('large')) return 3;
  if (lower.includes('small')) return 4;

  return 5;
}

/**
 * The portions a food offers, from every household measure USDA published for it.
 *
 * Returns `[]` - meaning "grams only" - for a suppressed category, and for a food
 * whose every measure names a weight rather than a household unit.
 */
export function derivePortions(source: {
  category: string;
  /** The food's English name, for the `1 almond` case — see `classifyPortion`. */
  nameEn?: string;
  portions: readonly MeasuredPortion[] | null | undefined;
}): PortionSeed[] {
  if (!source.portions?.length) return [];

  /** The best measured base for one of each family. */
  const best = new Map<Exclude<Family, 'none'>, { base: number; rank: number }>();

  for (const portion of source.portions) {
    if (!(portion.grams > 0)) continue;

    const parsed = parsePortionLabel(portion.label);
    if (!parsed) continue;

    const family = classifyPortion(portion.label, parsed.unit, source.nameEn ?? '', parsed.amount);
    if (family === 'none') continue;
    // After the family, because two of the three rules depend on it — see there.
    if (!isServable(portion.label, parsed.unit, family, portion.grams)) continue;
    // Checked on the *base* rather than on the measured weight: "2 pieces" of
    // something is a claim about one piece, and it is the one piece that has to
    // be a thing a person eats. Both ends: too heavy is a watermelon, too light
    // is a pine nut.
    if (family === 'piece') {
      const one = portion.grams / parsed.amount;
      if (one > MAX_PIECE_GRAMS || one < MIN_PIECE_GRAMS) continue;
    }
    // A sachet is not a علبة — see `MIN_CONTAINER_GRAMS`.
    if (family === 'container' && portion.grams / parsed.amount < MIN_CONTAINER_GRAMS) continue;
    if (SPOON_ONLY_CATEGORIES.has(source.category) && !SPOON_FAMILIES.has(family)) continue;
    // Meat by the piece, never by the cup — see `WEIGHED_CATEGORIES`.
    if (WEIGHED_CATEGORIES.has(source.category) && !COUNTABLE_FAMILIES.has(family)) continue;

    // "0.5 cup, diced = 75 g" means a whole cup is 150 g. The label's own count is
    // what makes the base recoverable.
    const base = portion.grams / parsed.amount;
    if (!Number.isFinite(base) || base <= 0) continue;

    const rank = candidateRank(portion.label, source.category);
    const held = best.get(family);

    if (!held || rank < held.rank) best.set(family, { base, rank });
  }

  const families = FAMILY_PRIORITY.filter((family) => best.has(family)).slice(0, MAX_FAMILIES);

  const rows: PortionSeed[] = [];
  /*
   * Two families can name the same unit: a tablespoon family derives its own
   * teaspoon, and a food that measured both would emit `teaspoon` twice. The seed
   * upserts portions on `(food_id, key)`, so a duplicate is not an error - it is
   * one row silently taking whichever weight was written last. The first family
   * wins, because families are walked in priority order.
   */
  const taken = new Set<PortionKey>();

  for (const family of families) {
    const { base } = best.get(family)!;

    /*
      Smallest first for the fats, so the teaspoon is the row that leads and
      `isDefault` lands on it. Sorting by the factor rather than naming the key
      says the intent once and needs no second list to keep in step.
    */
    const definition =
      family === 'tbsp' && TEASPOON_FIRST_CATEGORIES.has(source.category)
        ? [...FAMILY_ROWS[family]].sort((a, b) => a[3] - b[3])
        : FAMILY_ROWS[family];

    for (const [key, labelAr, labelEn, factor] of definition) {
      if (taken.has(key)) continue;

      const grams = g(base * factor);
      // A fraction that rounds away to nothing is not a portion. Only reachable
      // for a food measured in fractions of a gram, and dropping it beats
      // offering "quarter cup = 0 g".
      if (grams <= 0) continue;

      taken.add(key);

      rows.push({
        key,
        labelAr,
        labelEn,
        grams,
        isDefault: rows.length === 0,
        sortOrder: rows.length,
      });
    }
  }

  return rows;
}
