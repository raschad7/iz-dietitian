/**
 * Ingredient measurement units for the dish editor.
 *
 * A dietitian picks a food in a human unit — 2 pieces, 1 cup, 1 tablespoon — and
 * the nutrition engine needs grams. This module turns a food's single USDA
 * household measure (`foods.portionGrams` + `portionLabel`) into a short, sensible
 * menu of units for that specific food, each carrying the grams one of it weighs.
 * Grams is always offered and is always the source of truth: the editor stores
 * `quantity × gramsPerUnit` in `dish_ingredients.quantityGrams` and never opens a
 * second nutrition path — `dishTotals` still does the arithmetic it always did.
 *
 * Nothing here invents a conversion. Every non-gram unit is either the food's own
 * measured portion (a slice, a piece, a cup of *that* food) or a universal ratio
 * applied to it (½/¼ of that cup; a teaspoon as a third of that tablespoon). A
 * food with no trustworthy household measure — a weight-only USDA portion like
 * "1 oz", or none at all — offers grams alone. Correctness over a friendly label
 * everywhere.
 */

/** Every unit the editor can store, in no particular order. */
export const UNIT_KEYS = [
  'loaf',
  'half_loaf',
  'piece',
  'slice',
  'cup',
  'half_cup',
  'quarter_cup',
  'tbsp',
  'tsp',
  'g',
] as const;

export type UnitKey = (typeof UNIT_KEYS)[number];

/** Grams itself — always available, always the nutrition basis. */
export const GRAMS_UNIT: UnitOption = { key: 'g', gramsPerUnit: 1 };

export type UnitOption = {
  key: UnitKey;
  /** Grams that one of this unit weighs. `1` for grams. */
  gramsPerUnit: number;
};

/** The food fields this module reads — a subset of `FoodSearchResult`. */
export type UnitFood = {
  portionGrams: number | null;
  portionLabel: string | null;
  category: string;
};

/**
 * Categories a dietitian weighs rather than portions by household measure.
 *
 * USDA does carry a "1 cup, chopped or diced" for cooked chicken, but "a cup of
 * chicken" is not how a plan is written — meat, poultry, fish and seafood go by
 * grams. The USDA measure stays in `foods`; it is simply not offered as a unit
 * here. A deliberate product choice, not a data limitation.
 */
const GRAMS_ONLY_CATEGORIES = new Set([
  'Poultry Products',
  'Beef Products',
  'Pork Products',
  'Lamb, Veal, and Game Products',
  'Finfish and Shellfish Products',
  'Sausages and Luncheon Meats',
]);

/**
 * The USDA unit words that mean "one countable item" of the food — an egg, a
 * fillet, a link. All collapse to a single friendly "piece" unit.
 */
const PIECE_WORDS = new Set([
  'large',
  'medium',
  'small',
  'extra',
  'unit',
  'piece',
  'each',
  'whole',
  'fillet',
  'link',
  'patty',
  'stick',
  'wedge',
  'clove',
  'leaf',
  'ear',
  'fruit',
  'pod',
  'strip',
  'ball',
  'bar',
  'roll',
  'bun',
  'loaf',
  'cookie',
  'cracker',
  'chip',
]);

type Family = 'cup' | 'tbsp' | 'tsp' | 'slice' | 'piece' | 'loaf' | 'none';

/**
 * USDA unit words that mean "one whole flatbread/loaf" — a pita, a tortilla, a
 * roll. USDA carries "1 pita, large" = 60 g for pita bread; the old classifier
 * did not recognise "pita" and fell the whole food back to grams, which is why
 * bread had no رغيف unit. All collapse to the friendly "loaf" (رغيف).
 */
const LOAF_WORDS = new Set(['pita', 'loaf', 'tortilla', 'flatbread', 'naan', 'bun', 'roll', 'bagel']);

/**
 * The amount and unit word a USDA portion label leads with.
 *
 * The dataset builder guarantees the label starts with its own count — "1 large",
 * "3 oz", "1 cup, chopped" — so the first token is the amount and the next word is
 * the unit. Anything after (", chopped or diced") is descriptive and dropped.
 */
function parsePortionLabel(label: string): { amount: number; unit: string } | null {
  const match = label.trim().toLowerCase().match(/^([\d.]+)\s+(.+)$/);
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const unit = match[2]!.split(/[\s,]+/)[0] ?? '';
  return unit ? { amount, unit } : null;
}

/** Maps a USDA unit word to the household family the editor offers. */
function classify(unit: string): Family {
  if (unit === 'cup') return 'cup';
  if (unit === 'tablespoon' || unit === 'tbsp') return 'tbsp';
  if (unit === 'teaspoon' || unit === 'tsp') return 'tsp';
  if (unit === 'slice') return 'slice';
  // Loaf before piece: "loaf"/"roll"/"bun" also live in PIECE_WORDS, but bread
  // reads as رغيف, not قطعة.
  if (LOAF_WORDS.has(unit)) return 'loaf';
  if (PIECE_WORDS.has(unit)) return 'piece';
  // Weight and volume units (oz, lb, gram, ml, quart…) and anything unknown carry
  // no friendly household unit — grams is the honest answer.
  return 'none';
}

/**
 * The unit menu for one household family, given the grams one base unit weighs.
 * Fractions are pure arithmetic on that weight — never invented — and grams is
 * always last.
 */
function buildFamily(family: Family, gramsPerBase: number): UnitOption[] {
  // Round derived grams to a tenth: the source portion is ~3 sig figs, and this
  // keeps ½/¼ splits off float noise (13.5 / 3 = 4.5, not 4.4999…).
  const g = (value: number): number => Math.round(value * 10) / 10;

  switch (family) {
    case 'loaf':
      return [
        { key: 'loaf', gramsPerUnit: g(gramsPerBase) },
        { key: 'half_loaf', gramsPerUnit: g(gramsPerBase / 2) },
        GRAMS_UNIT,
      ];
    case 'cup':
      return [
        { key: 'cup', gramsPerUnit: g(gramsPerBase) },
        { key: 'half_cup', gramsPerUnit: g(gramsPerBase / 2) },
        { key: 'quarter_cup', gramsPerUnit: g(gramsPerBase / 4) },
        GRAMS_UNIT,
      ];
    case 'tbsp':
      return [
        { key: 'tbsp', gramsPerUnit: g(gramsPerBase) },
        { key: 'tsp', gramsPerUnit: g(gramsPerBase / 3) },
        GRAMS_UNIT,
      ];
    case 'tsp':
      return [{ key: 'tsp', gramsPerUnit: g(gramsPerBase) }, GRAMS_UNIT];
    case 'slice':
      return [{ key: 'slice', gramsPerUnit: g(gramsPerBase) }, GRAMS_UNIT];
    case 'piece':
      return [{ key: 'piece', gramsPerUnit: g(gramsPerBase) }, GRAMS_UNIT];
    default:
      return [GRAMS_UNIT];
  }
}

/** The household family a stored UnitKey belongs to — used to rebuild a custom
 *  food's menu from its saved unit. */
function familyForKey(key: UnitKey): Family {
  switch (key) {
    case 'loaf':
    case 'half_loaf':
      return 'loaf';
    case 'cup':
    case 'half_cup':
    case 'quarter_cup':
      return 'cup';
    case 'tbsp':
      return 'tbsp';
    case 'tsp':
      return 'tsp';
    case 'slice':
      return 'slice';
    case 'piece':
      return 'piece';
    default:
      return 'none';
  }
}

/**
 * The unit menu for one food: its household unit(s) first, grams last.
 *
 * Grams is always present and always last. When no reliable household measure
 * exists — a suppressed category, a weight-only portion, or no portion at all —
 * the menu is grams alone.
 */
export function deriveUnitOptions(food: UnitFood): UnitOption[] {
  if (GRAMS_ONLY_CATEGORIES.has(food.category)) return [GRAMS_UNIT];
  if (food.portionGrams == null || food.portionGrams <= 0 || !food.portionLabel) return [GRAMS_UNIT];

  // A clinic custom food stores its serving as a bare UnitKey token in
  // `portionLabel` (e.g. "loaf") with the grams one of it weighs in
  // `portionGrams` — no leading count, unlike a USDA "1 pita, large". The
  // dietitian chose that household unit in the custom-food dialog, so offer it
  // (and its fractions) directly. See `createCustomFood`.
  const label = food.portionLabel.trim();
  if (!/^\d/.test(label)) {
    const key = label as UnitKey;
    const family = (UNIT_KEYS as readonly string[]).includes(key) ? familyForKey(key) : 'none';
    return family === 'none' ? [GRAMS_UNIT] : buildFamily(family, food.portionGrams);
  }

  const parsed = parsePortionLabel(food.portionLabel);
  if (!parsed) return [GRAMS_UNIT];

  const gramsPerBase = food.portionGrams / parsed.amount;
  if (!Number.isFinite(gramsPerBase) || gramsPerBase <= 0) return [GRAMS_UNIT];

  return buildFamily(classify(parsed.unit), gramsPerBase);
}

/**
 * The household unit to suggest for a custom food, guessed from its Arabic name
 * — bread → رغيف, oil → ملعقة, rice/lentils → كوب, eggs/produce → حبة. Grams when
 * nothing obvious fits, so the dietitian is never fighting a wrong default.
 */
export function suggestUnitKey(nameAr: string): UnitKey {
  const name = nameAr.trim();
  const has = (...needles: string[]) => needles.some((needle) => name.includes(needle));

  if (has('خبز', 'رغيف', 'صمون', 'كماج')) return 'loaf';
  if (has('توست', 'شريحة')) return 'slice';
  if (has('زيت', 'سمن', 'طحين', 'طحينة', 'دبس', 'عسل', 'صلصة')) return 'tbsp';
  if (has('أرز', 'ارز', 'رز', 'برغل', 'فريكة', 'عدس', 'حمص', 'فول', 'حليب', 'لبن', 'شوربة')) return 'cup';
  if (has('بيض', 'بيضة', 'تفاح', 'موز', 'برتقال', 'بندورة', 'خيار', 'بطاطا', 'حبة')) return 'piece';
  return 'g';
}

/** The unit a freshly picked food starts in: its natural household unit, else grams. */
export function defaultUnitKey(options: readonly UnitOption[]): UnitKey {
  return options[0]?.key ?? 'g';
}

export function findUnit(options: readonly UnitOption[], key: string): UnitOption | undefined {
  return options.find((option) => option.key === key);
}

/**
 * The grams a row contributes: `quantity × gramsPerUnit`, the single figure the
 * nutrition engine receives. A blank or non-positive quantity, or an unknown
 * unit, contributes nothing — the row is mid-edit, not a mistake.
 */
export function rowGrams(options: readonly UnitOption[], quantity: number, unitKey: string): number {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  const unit = findUnit(options, unitKey);
  return unit ? quantity * unit.gramsPerUnit : 0;
}

/**
 * Reopens a saved ingredient into a `{ quantity, unit }` row without ever
 * changing the grams it holds.
 *
 * The recipe's stored `quantityGrams` is authoritative. When the saved unit is
 * one this food still offers, the quantity is that weight expressed back in the
 * unit (100 g of egg → "2 pieces"), so an untouched save writes the same grams.
 * When the saved unit no longer applies — a legacy free-text label, or a food
 * that has since become grams-only — the row falls back to grams and the exact
 * stored weight, rather than silently rescaling the recipe.
 */
export function resolveSavedRow(
  food: UnitFood,
  saved: { quantityGrams: number; householdLabel: string | null; householdGrams: number | null },
): { unitKey: UnitKey; quantity: number } {
  const options = deriveUnitOptions(food);
  const match = saved.householdLabel ? findUnit(options, saved.householdLabel) : undefined;

  if (match && match.gramsPerUnit > 0) {
    return { unitKey: match.key, quantity: saved.quantityGrams / match.gramsPerUnit };
  }

  return { unitKey: 'g', quantity: saved.quantityGrams };
}
