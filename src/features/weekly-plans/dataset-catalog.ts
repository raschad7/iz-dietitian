/**
 * The committed datasets, as the catalog the application works in.
 *
 * `data/catalog-foods.json` and `data/dishes.json` hold slugs, fdcIds and grams;
 * every module downstream wants `DishDetail` — a dish with its recipe resolved to
 * foods. This builds one from the other, with **no database**, so the coverage
 * grid and the review sweep can both read the same catalog a correct seed would
 * produce.
 *
 * Ids are slugs here rather than uuids. Nothing offline resolves a dish by uuid,
 * and a slug is the stable natural key the seed itself upserts on.
 */

import { readCatalogDataset, type CuratedFood } from '../../../scripts/seed-catalog-foods';
import { readDishDataset, type DishRecord } from '../../../scripts/seed-dishes';

import { baseServingKcal, type DishDetail, type DishIngredientDetail } from './nutrition';

/** One recipe line, resolved against the food dataset. */
function lineFor(
  ingredient: DishRecord['ingredients'][number],
  food: CuratedFood,
  index: number,
): DishIngredientDetail {
  const portion = ingredient.unit
    ? food.portions.find((one) => one.labelEn === ingredient.unit)
    : undefined;

  return {
    quantityGrams: ingredient.grams,
    food: {
      ...(food.nutrition as unknown as DishIngredientDetail['food']),
      id: food.slug,
      nameAr: food.nameAr,
      nameEn: food.nameEn,
      category: food.category,
    },
    portion: portion
      ? {
          id: `${food.slug}:${portion.labelEn}`,
          labelAr: portion.labelAr,
          labelEn: portion.labelEn,
          grams: portion.grams,
        }
      : null,
    portionQuantity: ingredient.count ?? null,
    isPrimary: ingredient.primary ?? false,
    isFree: ingredient.free ?? false,
    sortOrder: index,
  };
}

/**
 * Every shipped dish, recipe attached.
 *
 * A line whose food is missing from the catalog dataset is dropped rather than
 * thrown on: the seed already refuses that combination loudly, and this is a
 * reader, not a second gate.
 */
export function datasetCatalog(): DishDetail[] {
  const foods = new Map(readCatalogDataset().map((food) => [food.sourceRef, food]));

  return readDishDataset().map((dish) => {
    const ingredients = dish.ingredients.flatMap((ingredient, index) => {
      const food = foods.get(String(ingredient.fdcId));
      return food ? [lineFor(ingredient, food, index)] : [];
    });

    return {
      id: dish.slug,
      clinicId: null,
      slug: dish.slug,
      nameAr: dish.nameAr,
      nameEn: dish.nameEn,
      mealTypes: dish.mealTypes,
      source: dish.source,
      effort: dish.effort,
      cost: dish.cost,
      occasion: dish.occasion,
      isSide: dish.isSide,
      allergenTags: dish.allergenTags,
      baseServingLabel: dish.baseServingLabel,
      isActive: true,
      ingredients,
    };
  });
}

/** Energy of one base serving, for a dish already resolved by `datasetCatalog`. */
export function datasetBaseKcal(dish: DishDetail): number {
  return baseServingKcal(dish.ingredients);
}
