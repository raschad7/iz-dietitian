/** Read-only dataset audit. Run `bun run plan:audit`; redirect JSON to keep a baseline. */
import { readCatalogDataset } from './seed-catalog-foods';
import { coverage } from '@/features/weekly-plans/coverage';
import { datasetCatalog } from '@/features/weekly-plans/dataset-catalog';
import { suggestAllergens } from '@/features/weekly-plans/dish-suggestions';
import { baseServingKcal } from '@/features/weekly-plans/nutrition';
import { toPromptCatalog, toPromptSides } from '@/features/weekly-plans/queries';

const foods = readCatalogDataset();
const catalog = datasetCatalog();
const mains = catalog.filter(dish => !dish.isSide);
const bySlug = new Map(foods.map(food => [food.slug, food]));
const used = new Set(catalog.flatMap(dish => dish.ingredients.map(line => line.food.slug)));
const weighedWithUnits = catalog.flatMap(dish =>
  dish.ingredients.flatMap(line => {
    const food = line.food.slug ? bySlug.get(line.food.slug) : undefined;
    if (line.portion || !food?.portions.length) return [];
    return [{
      dish: dish.slug, food: food.slug, grams: line.quantityGrams,
      isPrimary: Boolean(line.isPrimary), isFree: Boolean(line.isFree),
      availableUnits: food.portions.map(portion => portion.labelEn),
    }];
  }),
);

const countBy = <T>(rows: readonly T[], key: (row: T) => string) => {
  const counts: Record<string, number> = {};
  for (const row of rows) counts[key(row)] = (counts[key(row)] ?? 0) + 1;
  return counts;
};

const allergenReview = catalog.flatMap(dish => {
  const suggested = suggestAllergens(dish.ingredients.map(line => ({
    ...line.food, category: line.food.category ?? '',
  })));
  const missingSuggestions = suggested.filter(tag => !dish.allergenTags.includes(tag));
  return missingSuggestions.length ? [{
    dish: dish.slug, missingSuggestions,
    ingredients: dish.ingredients.map(line => line.food.nameEn),
  }] : [];
});

const scenarios: { name: string; allergens: string[]; pattern: string | null }[] = [
  { name: 'unrestricted', allergens: [], pattern: null },
  { name: 'nuts-egg-sesame-excluded', allergens: ['nuts', 'egg', 'sesame'], pattern: null },
  { name: 'nuts-lactose-sesame-excluded', allergens: ['nuts', 'lactose', 'sesame'], pattern: null },
  { name: 'gluten-excluded', allergens: ['gluten'], pattern: null },
  { name: 'keto', allergens: [], pattern: 'keto' },
  { name: 'low-carb', allergens: [], pattern: 'low_carb' },
];

console.log(JSON.stringify({
  counts: {
    foods: foods.length, usedFoods: used.size, dishes: catalog.length,
    mains: mains.length, sides: catalog.length - mains.length,
    recipeLines: catalog.reduce((count, dish) => count + dish.ingredients.length, 0),
    weighedLinesWithHouseholdUnitsAvailable: weighedWithUnits.length,
    adjustableWeighedLinesWithHouseholdUnitsAvailable: weighedWithUnits.filter(line => line.isPrimary).length,
  },
  foodCategories: countBy(foods, food => food.category),
  primaryCounts: countBy(mains, dish => String(dish.ingredients.filter(line => line.isPrimary).length)),
  noAdjustableIngredients: mains.filter(dish => !dish.ingredients.some(line => line.isPrimary)).map(dish => dish.slug),
  unusedFoods: foods.filter(food => !used.has(food.slug)).map(food => food.slug),
  cookedDishDryGrains: catalog.flatMap(dish => dish.ingredients.flatMap(line => {
    const food = line.food.slug ? bySlug.get(line.food.slug) : undefined;
    return food?.category === 'grains' && food.state === 'dry'
      ? [{ dish: dish.slug, food: food.slug, displayNameAr: food.nameAr, unit: line.portion?.labelEn ?? 'g' }]
      : [];
  })),
  scenarios: scenarios.map(scenario => {
    const visible = catalog.filter(dish => !dish.allergenTags.some(tag => scenario.allergens.includes(tag)));
    const offered = toPromptCatalog(visible, scenario.pattern);
    const sides = toPromptSides(visible, scenario.pattern);
    const carbThreshold = scenario.pattern === 'keto' ? 10 : scenario.pattern === 'low_carb' ? 25 : null;
    return {
      name: scenario.name, mains: offered.length, sides: sides.length,
      coverage: coverage([...offered, ...sides].map(dish => ({ ...dish, isSide: sides.includes(dish) }))),
      abovePatternBaseCarbThreshold: carbThreshold === null ? [] : [...offered, ...sides]
        .filter(dish => dish.baseCarbs > carbThreshold)
        .map(dish => ({ dish: dish.slug, baseCarbs: dish.baseCarbs, mealTypes: dish.mealTypes })),
    };
  }),
  // Name heuristics can be wrong (e.g. peanut butter); these require human review.
  allergenSuggestionsToReview: allergenReview,
  weighedWithUnits,
  baseKcal: Object.fromEntries(catalog.map(dish => [dish.slug, baseServingKcal(dish.ingredients)])),
}, null, 2));
