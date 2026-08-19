/**
 * Turns one *measured* household portion into the set of portions the catalog
 * offers for that food.
 *
 * This is the rule that used to run at render time in `ingredient-units.ts`,
 * against a USDA label parsed on every keystroke. It runs **once, at dataset build
 * time** now (`scripts/build-catalog-dataset.ts`), and its output is committed to
 * `data/catalog-foods.json` as real rows in `catalog_food_portions`. Same
 * arithmetic, same conservatism — but a portion is data a dietitian could correct,
 * not a string the UI re-derives and can only get wrong in the same way forever.
 *
 * **Nothing here invents a weight.** Every portion is either the food's own
 * measured portion or a plain fraction of it: half a cup is half of *that* cup, a
 * teaspoon is a third of *that* tablespoon. A food whose only measured portion is
 * a weight ("3 oz", "1 oz") or an unrecognised unit yields no portions at all and
 * is measured in grams, which is the honest answer rather than a friendly guess.
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
const PIECE_WORDS = new Set([
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
export function derivePortions(source: {
  category: string;
  portionGrams: number | null | undefined;
  portionLabel: string | null | undefined;
}): PortionSeed[] {
  if (GRAMS_ONLY_CATEGORIES.has(source.category)) return [];
  if (source.portionGrams == null || source.portionGrams <= 0 || !source.portionLabel) return [];

  const parsed = parsePortionLabel(source.portionLabel);
  if (!parsed) return [];

  // "0.5 cup, diced = 75 g" means a whole cup is 150 g. The label's own count is
  // what makes the base recoverable.
  const base = source.portionGrams / parsed.amount;
  if (!Number.isFinite(base) || base <= 0) return [];

  const family = classifyUnit(parsed.unit);
  if (family === 'none') return [];

  return FAMILY_ROWS[family]
    .map(([labelAr, labelEn, factor], index) => ({
      labelAr,
      labelEn,
      grams: g(base * factor),
      isDefault: index === 0,
      sortOrder: index,
    }))
    // A fraction that rounds away to nothing is not a portion. Only reachable for
    // a food measured in fractions of a gram, and dropping it beats offering
    // "quarter cup = 0 g".
    .filter((portion) => portion.grams > 0);
}
