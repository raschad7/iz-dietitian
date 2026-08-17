/**
 * A small curated bridge from USDA's English food descriptions to Arabic.
 *
 * The `foods` library is USDA SR Legacy — every shared row is English
 * ("Lentils, mature seeds, cooked, boiled, without salt") with no Arabic name.
 * When a dietitian searches `عدس`, the translate path finds those rows, but
 * showing their raw descriptions as the primary label is exactly the failure the
 * screenshots caught: seven near-identical English variants.
 *
 * This module derives a concise Arabic label from a description — "عدس مطبوخ",
 * "عدس أحمر" — by recognising the food's head noun and its meaningful
 * preparation, and dropping USDA provenance ("mature seeds", "without salt",
 * "drained"). It is **presentation only**: it never changes a stored nutrition
 * record, and it is deliberately conservative — a description whose head it does
 * not recognise returns `null`, and the caller falls back to a concise English
 * label rather than a wrong Arabic guess.
 *
 * It is not, and does not try to be, a full food ontology. It covers the common
 * Palestinian/Levantine pantry the catalog is actually searched for, and is a
 * plain data table so more foods are one line each. Pure and dependency-light so
 * `arabic-food-terms.test.ts` can pin every rule down with real USDA strings.
 */

import { normalizeArabic } from './arabic-normalize';

/**
 * The household-unit profile a food should offer, independent of its USDA portion
 * row. Consumed by `ingredient-units.ts`; kept here so a food's Arabic identity
 * and its natural unit are declared in one place.
 */
export type UnitProfile = 'loaf' | 'piece' | 'cup' | 'spoon' | 'grams';

type FoodBase = {
  /** English substrings that identify this food's head noun (lowercased). */
  match: readonly string[];
  /** The Arabic base name shown to the dietitian. */
  ar: string;
  /** The natural household unit for this food, when it has one. */
  unit?: UnitProfile;
};

/**
 * Head-noun dictionary, most specific first — the first entry whose `match`
 * appears in the description wins, so "chickpea" beats a bare "pea" and
 * "olive oil" is checked before "oil".
 */
export const FOOD_BASES: readonly FoodBase[] = [
  // Legumes
  { match: ['chickpea', 'garbanzo'], ar: 'حمّص', unit: 'cup' },
  { match: ['lentil'], ar: 'عدس', unit: 'cup' },
  { match: ['fava bean', 'faba bean', 'broadbean', 'broad bean'], ar: 'فول', unit: 'cup' },
  { match: ['kidney bean'], ar: 'فاصولياء حمراء', unit: 'cup' },
  { match: ['white bean', 'navy bean', 'cannellini'], ar: 'فاصولياء بيضاء', unit: 'cup' },
  { match: ['green bean', 'snap bean'], ar: 'فاصولياء خضراء', unit: 'cup' },
  { match: ['bean'], ar: 'فاصولياء', unit: 'cup' },
  // Grains & bread
  { match: ['pita'], ar: 'خبز عربي', unit: 'loaf' },
  { match: ['tortilla', 'flatbread'], ar: 'خبز', unit: 'loaf' },
  { match: ['bread'], ar: 'خبز', unit: 'loaf' },
  { match: ['bulgur', 'burghul'], ar: 'برغل', unit: 'cup' },
  { match: ['freekeh', 'frikeh'], ar: 'فريكة', unit: 'cup' },
  { match: ['rice'], ar: 'أرز', unit: 'cup' },
  { match: ['couscous'], ar: 'كسكس', unit: 'cup' },
  { match: ['pasta', 'macaroni', 'spaghetti'], ar: 'معكرونة', unit: 'cup' },
  { match: ['oats', 'oatmeal'], ar: 'شوفان', unit: 'cup' },
  // Dairy & eggs
  { match: ['egg'], ar: 'بيض', unit: 'piece' },
  { match: ['yogurt', 'labneh'], ar: 'لبن', unit: 'cup' },
  { match: ['milk'], ar: 'حليب', unit: 'cup' },
  { match: ['cheese'], ar: 'جبنة', unit: 'grams' },
  { match: ['butter'], ar: 'زبدة', unit: 'spoon' },
  // Meat & fish
  { match: ['chicken'], ar: 'دجاج', unit: 'grams' },
  { match: ['beef', 'veal'], ar: 'لحم بقري', unit: 'grams' },
  { match: ['lamb', 'mutton'], ar: 'لحم غنم', unit: 'grams' },
  { match: ['turkey'], ar: 'ديك رومي', unit: 'grams' },
  { match: ['tuna'], ar: 'تونة', unit: 'grams' },
  { match: ['salmon'], ar: 'سلمون', unit: 'grams' },
  { match: ['fish'], ar: 'سمك', unit: 'grams' },
  // Fats
  { match: ['olive oil'], ar: 'زيت زيتون', unit: 'spoon' },
  { match: ['oil'], ar: 'زيت', unit: 'spoon' },
  { match: ['tahini', 'sesame butter', 'sesame paste'], ar: 'طحينة', unit: 'spoon' },
  // Vegetables
  { match: ['tomato'], ar: 'بندورة', unit: 'piece' },
  { match: ['cucumber'], ar: 'خيار', unit: 'piece' },
  { match: ['potato'], ar: 'بطاطا', unit: 'piece' },
  { match: ['onion'], ar: 'بصل', unit: 'piece' },
  { match: ['eggplant', 'aubergine'], ar: 'باذنجان', unit: 'piece' },
  { match: ['zucchini', 'squash'], ar: 'كوسا', unit: 'piece' },
  { match: ['carrot'], ar: 'جزر', unit: 'piece' },
  { match: ['cauliflower'], ar: 'زهرة', unit: 'cup' },
  { match: ['spinach'], ar: 'سبانخ', unit: 'cup' },
  { match: ['parsley'], ar: 'بقدونس', unit: 'cup' },
  // Fruit
  { match: ['apple'], ar: 'تفاح', unit: 'piece' },
  { match: ['banana'], ar: 'موز', unit: 'piece' },
  { match: ['orange'], ar: 'برتقال', unit: 'piece' },
  { match: ['date'], ar: 'تمر', unit: 'piece' },
  { match: ['grape'], ar: 'عنب', unit: 'cup' },
  // Nuts
  { match: ['almond'], ar: 'لوز', unit: 'grams' },
  { match: ['walnut'], ar: 'جوز', unit: 'grams' },
];

/**
 * Meaningful preparation/quality words, English → Arabic. These change what the
 * food *is* to a dietitian, so they stay in the label.
 */
export const PREP_MODIFIERS: Readonly<Record<string, string>> = {
  cooked: 'مطبوخ',
  boiled: 'مسلوق',
  raw: 'نيء',
  fried: 'مقلي',
  grilled: 'مشوي',
  roasted: 'مشوي',
  baked: 'مخبوز',
  steamed: 'مطبوخ بالبخار',
  red: 'أحمر',
  white: 'أبيض',
  brown: 'أسمر',
  green: 'أخضر',
  yellow: 'أصفر',
  black: 'أسود',
  whole: 'كامل',
  skim: 'خالي الدسم',
  'low-fat': 'قليل الدسم',
  'lowfat': 'قليل الدسم',
  'nonfat': 'خالي الدسم',
  'whole-wheat': 'قمح كامل',
  wholewheat: 'قمح كامل',
  dried: 'مجفف',
  canned: 'معلب',
  frozen: 'مجمد',
};

/**
 * Provenance and lab qualifiers that carry nothing for a dietitian and only make
 * the label longer. Dropped entirely. Matched as whole comma-segments (lowercased,
 * trimmed) so "without salt" is dropped but a real word is never partially eaten.
 */
export const NOISE_SEGMENTS: ReadonlySet<string> = new Set([
  'mature seeds',
  'seeds',
  'without salt',
  'with salt',
  'drained',
  'drained solids',
  'stir-fried',
  'unenriched',
  'enriched',
  'commercial',
  'nfs',
  'prepared',
  'unprepared',
  'ready-to-serve',
  'salted',
  'unsalted',
  'pasteurized',
  'fresh',
  'includes usda commodity',
  'all classes',
  'composite of cuts',
  'trimmed to 1/8" fat',
  'meat only',
  'meat and skin',
  'reduced fat',
]);

/** Colour/kind words — the first axis of a food's identity. */
const COLOUR_WORDS = ['red', 'white', 'brown', 'green', 'yellow', 'black', 'whole-wheat', 'wholewheat'] as const;

/**
 * Cooking-state words, each mapped to the one state that defines the food's
 * nutrition. Raw and cooked lentils are different foods; "boiled" and "steamed"
 * are both just "cooked" for grouping.
 */
const COOK_STATE: Readonly<Record<string, string>> = {
  cooked: 'cooked',
  boiled: 'cooked',
  steamed: 'cooked',
  raw: 'raw',
  fried: 'fried',
  grilled: 'grilled',
  roasted: 'grilled',
  baked: 'baked',
  dried: 'dried',
  canned: 'canned',
  frozen: 'frozen',
};

/**
 * Which cooking word to read when a description carries several. USDA writes
 * "cooked, roasted" — the distinctive method (roasted, fried, grilled, baked)
 * is the real one, so it beats the generic "cooked"; "cooked, boiled" is just
 * "cooked".
 */
const COOK_PRIORITY = [
  'fried',
  'grilled',
  'roasted',
  'baked',
  'cooked',
  'boiled',
  'steamed',
  'raw',
  'dried',
  'canned',
  'frozen',
] as const;

export type DerivedFood = {
  /** The Arabic label to show, e.g. "عدس مطبوخ". */
  name: string;
  /** The base food's Arabic noun, e.g. "عدس" — the dedup/ranking anchor. */
  base: string;
  /** The natural unit profile for this food, when known. */
  unit: UnitProfile | undefined;
  /**
   * A stable key for collapsing near-identical variants: the base plus the one
   * defining preparation (cooked vs raw vs …) and colour, with provenance gone.
   * "lentils cooked boiled without salt" and "…with salt" share a key; "lentils
   * raw" and "lentils red" do not.
   */
  groupKey: string;
};

/** Splits a USDA description into lowercased, noise-free comma segments. */
function meaningfulSegments(description: string): string[] {
  return description
    .toLowerCase()
    .split(',')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && !NOISE_SEGMENTS.has(segment));
}

/**
 * Derives a concise Arabic label from a USDA description, or null when the food's
 * head noun is not in the dictionary (the caller then shows concise English).
 */
export function deriveArabicFoodName(description: string): DerivedFood | null {
  const haystack = description.toLowerCase();
  // A multi-word needle ("olive oil", "green bean") requires every word present,
  // in any order — so "Oil, olive, salad or cooking" resolves to olive oil rather
  // than the bare "oil" entry that follows it.
  const found = FOOD_BASES.find((entry) =>
    entry.match.some((needle) => needle.split(' ').every((part) => haystack.includes(part))),
  );
  if (!found) return null;

  // The meaningful words present anywhere in the description, provenance dropped.
  const words = new Set(
    meaningfulSegments(description)
      .flatMap((segment) => segment.split(/\s+/))
      .map((word) => word.trim())
      .filter(Boolean),
  );

  // A food's identity for both the label and the dedup key is its base plus one
  // colour and one cooking state — the two axes that actually change the food.
  const colour = COLOUR_WORDS.find((word) => words.has(word)) ?? '';
  const cookWord = COOK_PRIORITY.find((word) => words.has(word)) ?? '';
  const cookState = cookWord ? COOK_STATE[cookWord]! : '';

  const shown = [colour, cookWord]
    .filter(Boolean)
    .map((word) => PREP_MODIFIERS[word])
    .filter(Boolean) as string[];
  const name = [found.ar, ...shown].join(' ').trim();

  // Salt/provenance variants of the same colour-and-state food collapse; raw vs
  // cooked, red vs white never do.
  const groupKey = `${found.ar}|${colour}|${cookState}`;

  return { name, base: found.ar, unit: found.unit, groupKey };
}

/** True when a normalized query matches (or is a prefix of) an Arabic base noun. */
export function queryMatchesBase(query: string, base: string): 'exact' | 'prefix' | null {
  const q = normalizeArabic(query);
  const b = normalizeArabic(base);
  if (!q) return null;
  if (b === q) return 'exact';
  if (b.startsWith(q) || q.startsWith(b)) return 'prefix';
  return null;
}
