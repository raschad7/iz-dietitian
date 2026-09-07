/**
 * The most of one counted food a single meal may hold.
 *
 * ## Why this is a table of foods and not a table of categories
 *
 * Portioning capped counted foods by *category*: three pieces for fruit,
 * vegetables, dairy and eggs, and nothing at all for nuts, olives or pulses,
 * which were bounded only by a weight ceiling. A pistachio kernel weighs 0.7 g,
 * so a forty-gram ceiling permitted **fifty-seven pistachios**. Almonds reached
 * twenty-five and cashews twenty-three.
 *
 * Meanwhile `review.ts` flagged any count above three, whatever the food. So the
 * two halves of the system disagreed in both directions at once: the portioner
 * produced amounts its own reviewer called mistakes, and the reviewer called
 * mistakes on amounts that were perfectly ordinary.
 *
 * A real dietitian's week settles it. She writes «٣ حبات لوز» and «حبة جوز» — three
 * almonds, one walnut — and in the same plan writes «١٢ حبة عنب» and «٤ حبات
 * اسكدنيا». Twelve grapes is a snack; twelve almonds is nearly a day's fat. No
 * single number describes both, and no category does either, because grapes and
 * dates are both `fruits` and one is eaten by the dozen and the other by the one.
 *
 * So the limit belongs to the food. The numbers below are read off her practice
 * where she named the food, and set to a generous multiple of a normal serving
 * where she did not.
 *
 * ## What a limit is and is not
 *
 * A ceiling, never a target — the same contract as the rest of `portioning.ts`.
 * A line only meets one when a multiplier tried to push it past, and a recipe
 * that already exceeds its ceiling keeps what its author wrote, because a ceiling
 * may not rewrite a dish.
 *
 * The unit is never changed. Nuts stay counted in pieces and rice stays measured
 * in spoons, because that is how the instruction is read in the kitchen and how
 * every plan in the region is written — one serving of cooked rice is a third of a
 * cup, or five to six tablespoons. What was wrong was never the unit; it was the
 * number in front of it.
 */

/** How many of a counted food a meal may hold, keyed by the food's slug. */
const COUNT_LIMITS: Record<string, number> = {
  /* Nuts. Counted, and counted small — a handful is ten to twenty pieces
     depending on the nut, and forty grams is where the weight ceiling already
     sits. */
  almonds: 12,
  walnuts: 4,
  cashews: 12,
  pistachios: 20,
  hazelnuts: 12,

  /* Fruit. Eaten by the dozen or by the one, and the difference is the food. */
  grapes: 20,
  'strawberry-raw': 15,
  'dates-medjool': 3,
  'figs-raw': 4,
  'loquat-raw': 8,
  'apple-raw': 2,
  'banana-raw': 2,
  'orange-raw': 2,
  'pear-raw': 2,
  'plum-raw': 4,
  'guava-raw': 2,
  'watermelon-raw': 2,

  /* Everything else that is counted. Olives sat in `prepared`, which had no
     ceiling of any kind; nine of them is an ordinary breakfast and ninety is not. */
  'olives-green': 12,
  'egg-raw': 3,
  'egg-boiled': 3,
  falafel: 8,
};

/**
 * How many of a measured food a meal may hold, in the unit it is written in.
 *
 * Rice is the one that matters. Nine tablespoons appeared twenty-one times across
 * the audited weeks and ten twice, where the dietitian writes six and seven. The
 * unit is right and the count was not, so this caps the count.
 */
const UNIT_LIMITS: Record<string, Record<string, number>> = {
  Tablespoon: {
    'rice-white-cooked': 9,
    'rice-brown-cooked': 9,
    'bulgur-cooked': 9,
    freekeh: 9,
    'oats-dry': 6,
    labneh: 4,
    hummus: 4,
    'tahini-sesame-paste': 2,
    'olive-oil': 2,
  },
  Loaf: { 'pita-white': 2, 'pita-wholewheat': 2 },
};

/**
 * The limit for one line, or null where the food has none.
 *
 * `foodSlug` is the catalog food's own slug — the stable natural key the seed
 * upserts on — so a limit follows the food rather than whichever dish holds it.
 */
export function countLimit(foodSlug: string | null | undefined, unitLabelEn?: string | null): number | null {
  if (!foodSlug) return null;

  if (unitLabelEn) {
    const byUnit = UNIT_LIMITS[unitLabelEn]?.[foodSlug];
    if (byUnit !== undefined) return byUnit;
  }

  return COUNT_LIMITS[foodSlug] ?? null;
}

/**
 * Whether a written amount is more than a person eats at one sitting.
 *
 * The question `review.ts` used to answer with a flat "more than three of
 * anything", which called twelve grapes a mistake and fifty-seven pistachios
 * nothing at all. A food with no limit is not judged here — silence is the honest
 * answer where nobody has decided.
 */
export function exceedsCountLimit(
  foodSlug: string | null | undefined,
  count: number,
  unitLabelEn?: string | null,
): boolean {
  const limit = countLimit(foodSlug, unitLabelEn);
  return limit !== null && count > limit;
}
