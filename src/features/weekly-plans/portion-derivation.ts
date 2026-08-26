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

/** A portion as the dataset stores it, before it becomes a `catalog_food_portions` row. */
export type PortionSeed = {
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
};

/**
 * Categories a dietitian weighs rather than portions.
 *
 * The source data does carry "1 cup, chopped or diced" for cooked chicken, but "a
 * cup of chicken" is not how a plan is written — meat, poultry and fish go by
 * grams. A deliberate product choice, carried over from Phase 1 unchanged, and the
 * reason those foods simply have no portion rows.
 */
export const GRAMS_ONLY_CATEGORIES = new Set(['meat', 'poultry', 'fish']);

/** The household families a measured portion can resolve to. */
type Family = 'cup' | 'tbsp' | 'tsp' | 'slice' | 'piece' | 'loaf' | 'leaf' | 'container' | 'none';

/** Unit words meaning "one countable item" — an egg, a fillet, a date. */
export const PIECE_WORDS = new Set([
  'large', 'medium', 'small', 'extra', 'unit', 'piece', 'each', 'whole', 'fillet',
  'link', 'patty', 'stick', 'wedge', 'clove', 'ear', 'fruit', 'pod', 'strip',
  'ball', 'bar', 'cookie', 'cracker', 'chip', 'date',
]);

/** Unit words meaning "one whole flatbread or loaf" — a pita, a tortilla, a roll. */
const LOAF_WORDS = new Set(['pita', 'loaf', 'tortilla', 'flatbread', 'naan', 'bun', 'roll', 'bagel']);

/**
 * Unit words meaning "one packed container" — a tin of chickpeas, a pot of yogurt.
 *
 * Kept apart from `piece` because علبة is what a dietitian writes and حبة is not:
 * "one piece of chickpeas" is not a quantity anybody acts on.
 */
const CONTAINER_WORDS = new Set(['can', 'container', 'jar', 'package', 'packet', 'tin', 'bottle']);

/** Singular only: "2 leaves" of mint is 0.15 g a leaf, which is not a portion anyone uses. */
const LEAF_WORDS = new Set(['leaf']);

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
  if (unit === 'slice') return 'slice';
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
  loaf: { labelAr: 'رغيف', labelEn: 'Loaf' },
  piece: { labelAr: 'حبة', labelEn: 'Piece' },
  slice: { labelAr: 'شريحة', labelEn: 'Slice' },
  cup: { labelAr: 'كوب', labelEn: 'Cup' },
  tbsp: { labelAr: 'ملعقة كبيرة', labelEn: 'Tablespoon' },
  tsp: { labelAr: 'ملعقة صغيرة', labelEn: 'Teaspoon' },
} as const satisfies Record<string, { labelAr: string; labelEn: string }>;

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

/** Every family's rows, as multiples of the measured base. `[labelAr, labelEn, factor]`. */
const FAMILY_ROWS: Record<Exclude<Family, 'none'>, readonly (readonly [string, string, number])[]> = {
  cup: [
    ['كوب', 'Cup', 1],
    ['نصف كوب', 'Half cup', 1 / 2],
    ['ربع كوب', 'Quarter cup', 1 / 4],
  ],
  tbsp: [
    ['ملعقة كبيرة', 'Tablespoon', 1],
    // A teaspoon is a third of a tablespoon by definition, not by estimate.
    ['ملعقة صغيرة', 'Teaspoon', 1 / 3],
  ],
  tsp: [['ملعقة صغيرة', 'Teaspoon', 1]],
  slice: [['شريحة', 'Slice', 1]],
  piece: [['حبة', 'Piece', 1]],
  loaf: [
    ['رغيف', 'Loaf', 1],
    ['نصف رغيف', 'Half loaf', 1 / 2],
  ],
  leaf: [['ورقة', 'Leaf', 1]],
  container: [['علبة', 'Container', 1]],
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
 */
const SPOON_ONLY_CATEGORIES = new Set(['fats_oils', 'sweets']);

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
const PREFERRED_SIZE: Record<string, string> = { dairy_eggs: 'large' };

/** Nothing a person is served in one sitting weighs this much. */
const MAX_SERVABLE_GRAMS = 1000;

/**
 * Portions that measure something other than one ordinary serving.
 *
 * `NLEA serving` is a labelling construct, not a household count. A whole melon or
 * a whole pint is a purchase, not a portion. Both would otherwise win a family and
 * become the unit a dietitian is offered.
 */
function isServable(label: string, grams: number): boolean {
  const lower = label.toLowerCase();
  if (lower.includes('nlea')) return false;
  if (lower.includes('as purchased')) return false;
  return grams <= MAX_SERVABLE_GRAMS;
}

/**
 * The family a measured label belongs to.
 *
 * Falls back to scanning the label's words when the leading unit is unrecognised,
 * which is what `1 Potato medium (2-1/4 to 3-1/4 dia)` needs: the unit word is the
 * food's own name, and `medium` is the part that says it is a countable item.
 */
export function classifyPortion(label: string, unit: string): Family {
  const direct = classifyUnit(unit);
  if (direct !== 'none') return direct;

  const words = label.toLowerCase().split(/[\s,()]+/);
  if (words.some((word) => SIZE_WORDS.includes(word))) return 'piece';
  if (words.some((word) => PIECE_WORDS.has(word))) return 'piece';

  return 'none';
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
  portions: readonly MeasuredPortion[] | null | undefined;
}): PortionSeed[] {
  if (GRAMS_ONLY_CATEGORIES.has(source.category)) return [];
  if (!source.portions?.length) return [];

  /** The best measured base for one of each family. */
  const best = new Map<Exclude<Family, 'none'>, { base: number; rank: number }>();

  for (const portion of source.portions) {
    if (!(portion.grams > 0) || !isServable(portion.label, portion.grams)) continue;

    const parsed = parsePortionLabel(portion.label);
    if (!parsed) continue;

    const family = classifyPortion(portion.label, parsed.unit);
    if (family === 'none') continue;
    if (SPOON_ONLY_CATEGORIES.has(source.category) && !SPOON_FAMILIES.has(family)) continue;

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
   * teaspoon, and a food that measured both would emit "Teaspoon" twice. The seed
   * upserts portions on `(food_id, label_en)`, so a duplicate is not an error - it
   * is one row silently taking whichever weight was written last. The first
   * family wins, because families are walked in priority order.
   */
  const taken = new Set<string>();

  for (const family of families) {
    const { base } = best.get(family)!;

    for (const [labelAr, labelEn, factor] of FAMILY_ROWS[family]) {
      if (taken.has(labelEn)) continue;

      const grams = g(base * factor);
      // A fraction that rounds away to nothing is not a portion. Only reachable
      // for a food measured in fractions of a gram, and dropping it beats
      // offering "quarter cup = 0 g".
      if (grams <= 0) continue;

      taken.add(labelEn);

      rows.push({
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
