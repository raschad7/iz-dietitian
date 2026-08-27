import { ALLERGENS, type Allergen } from '@/features/clients/nutrition';

import { normalizeArabic } from './arabic-normalize';

/**
 * What the dish editor can propose about a recipe by reading the foods in it.
 *
 * Two suggestions, both offered at the review step and both marked as proposals
 * the dietitian confirms or removes:
 *
 * - which allergens the recipe appears to carry;
 * - whether it is vegetarian.
 *
 * **These are prompts, not guarantees.** A catalog food carries no allergen
 * column, so this reads the food's category where the category is decisive and
 * its canonical name otherwise. That is enough to stop a dietitian shipping a
 * bread dish with no gluten tag because they forgot the field existed; it is not
 * enough to certify a dish safe. Nothing here ever *clears* an allergen the
 * dietitian ticked, and nothing here reaches the allergen filter that guards plan
 * generation — that filter reads `dishes.allergen_tags`, which only a person
 * writes.
 *
 * Where the wording is ambiguous it over-proposes rather than under-proposes: an
 * extra chip is removed with one click, a missing one ships.
 */

/** The shape this module needs — satisfied by `FoodSearchResult` and by a test fixture. */
export type SuggestibleFood = {
  nameAr: string;
  nameEn: string;
  /** `catalog_foods.category`; `other` for a food a clinic added itself. */
  category: string;
};

/**
 * Categories whose every member is an animal food.
 *
 * `other` is deliberately absent: a clinic's own food lands there regardless of
 * what it is, so it is decided by name below instead.
 */
const ANIMAL_CATEGORIES = ['meat', 'poultry', 'fish', 'dairy_eggs'] as const;

/**
 * `normalizeArabic` plus the two foldings it deliberately refuses: ة→ه and ى→ي.
 *
 * That refusal is right where it lives — merging جبنة and جبنه when deciding
 * whether two *foods are the same food* would hide a real entry. Here the
 * question is only "does this name contain a word from a short list", the answer
 * is a removable chip, and without the folding a catalog spelling of طحينة never
 * meets the keyword طحينه.
 */
function fold(input: string): string {
  return normalizeArabic(input).replace(/ة/g, 'ه').replace(/ى/g, 'ي');
}

/**
 * Names are matched **whole word, never by substring.**
 *
 * Arabic makes the substring version actively wrong: أبيض (white) contains بيض
 * (egg), so every white rice and white cheese in the catalog would be proposed as
 * carrying eggs, and طحين (flour) is a prefix of طحينة (tahini). English has the
 * milder version of the same trap — butternut is not butter, nutmeg is not a nut.
 * Splitting on anything that is not a letter or digit and comparing whole tokens
 * costs the odd inflected form and removes the whole class of error.
 */
function wordsOf(nameAr: string, nameEn: string): Set<string> {
  const text = `${fold(nameAr)} ${nameEn.toLowerCase()}`;
  const words = new Set<string>();

  for (const token of text.split(/[^\p{L}\p{N}]+/u)) {
    if (!token) continue;
    words.add(token);
    // "almonds" and "eggs" without listing every plural.
    if (token.endsWith('s')) words.add(token.slice(0, -1));
  }

  return words;
}

type Rule = {
  /**
   * Whole words that carry the allergen, Arabic and English together. Both sides
   * go through `fold`, so a diacritic or a ة in the catalog and a bare form here
   * still meet.
   */
  words: readonly string[];
  /** Categories that decide on their own, without any word matching. */
  categories?: readonly string[];
};

/**
 * The words that carry each allergen.
 *
 * Deliberately conservative on categories: `nuts_seeds` is not a rule because it
 * holds sunflower and pumpkin seeds as well as almonds, and a dish wrongly
 * labelled "contains nuts" is a dish whose labels a dietitian stops reading.
 * Peanut sits under `nuts` because that is how an allergy record means it,
 * botany aside.
 */
const ALLERGEN_RULES: Record<Allergen, Rule> = {
  gluten: {
    words: [
      'خبز', 'خبزه', 'قمح', 'طحين', 'دقيق', 'برغل', 'فريكه', 'معكرونه', 'مكرونه',
      'شعير', 'سميد', 'مفتول', 'كعك', 'بسكوت', 'رقاق',
      'bread', 'wheat', 'flour', 'bulgur', 'freekeh', 'pasta', 'macaroni',
      'barley', 'semolina', 'couscous', 'biscuit', 'cracker', 'pita',
    ],
  },
  lactose: {
    words: [
      'حليب', 'لبن', 'لبنه', 'زبادي', 'جبن', 'جبنه', 'زبده', 'قشطه', 'كريمه',
      'شنينه', 'كفير', 'سمن', 'جميد',
      'milk', 'yogurt', 'yoghurt', 'cheese', 'butter', 'cream', 'labneh', 'kefir', 'ghee',
    ],
  },
  egg: {
    words: ['بيض', 'بيضه', 'بيضات', 'مايونيز', 'egg', 'mayonnaise'],
  },
  fish: {
    words: [
      'سمك', 'سمكه', 'سلمون', 'تونه', 'سردين', 'ماكريل', 'فيليه',
      'fish', 'salmon', 'tuna', 'sardine', 'mackerel',
    ],
    // The one category that decides on its own: everything in it is a fish.
    categories: ['fish'],
  },
  nuts: {
    words: [
      'لوز', 'جوز', 'كاجو', 'بندق', 'فستق', 'مكسرات', 'سوداني',
      'almond', 'walnut', 'cashew', 'hazelnut', 'pistachio', 'peanut', 'nuts',
    ],
  },
  sesame: {
    // طحينه, not طحين: whole-word matching is what keeps flour out of this list.
    words: ['سمسم', 'طحينه', 'طحينيه', 'sesame', 'tahini', 'tahina'],
  },
};

/** Animal words, for the foods whose category cannot say (a clinic's own). */
const ANIMAL_RULE: Rule = {
  words: [
    'دجاج', 'لحم', 'لحمه', 'غنم', 'بقر', 'عجل', 'خروف', 'ديك', 'حبش', 'كبده',
    'سمك', 'سمكه', 'سلمون', 'تونه', 'روبيان', 'جمبري', 'بيض', 'بيضه',
    'حليب', 'لبن', 'لبنه', 'زبادي', 'جبن', 'جبنه', 'زبده', 'قشطه', 'سمن',
    'chicken', 'beef', 'lamb', 'mutton', 'veal', 'turkey', 'liver', 'meat',
    'fish', 'salmon', 'tuna', 'shrimp', 'egg', 'milk', 'cheese', 'butter',
    'cream', 'yogurt', 'yoghurt', 'ghee',
  ],
  categories: ANIMAL_CATEGORIES,
};

function matches(food: SuggestibleFood, rule: Rule): boolean {
  if (rule.categories?.includes(food.category)) return true;

  const words = wordsOf(food.nameAr, food.nameEn);
  return rule.words.some((word) => words.has(fold(word)));
}

/**
 * The allergens the recipe appears to carry, in `ALLERGENS` order.
 *
 * Order is the constant's, not discovery order, so the same recipe always
 * proposes the same list and the chips never reshuffle between renders.
 */
export function suggestAllergens(foods: readonly SuggestibleFood[]): Allergen[] {
  return ALLERGENS.filter((allergen) => foods.some((food) => matches(food, ALLERGEN_RULES[allergen])));
}

/** Whether this one food reads as an animal product. */
export function isAnimalFood(food: SuggestibleFood): boolean {
  return matches(food, ANIMAL_RULE);
}

/**
 * Whether the recipe reads as vegetarian.
 *
 * False for an empty recipe: "no animal food yet" is not a finding about a dish
 * that has no ingredients.
 */
export function suggestVegetarian(foods: readonly SuggestibleFood[]): boolean {
  return foods.length > 0 && !foods.some(isAnimalFood);
}
