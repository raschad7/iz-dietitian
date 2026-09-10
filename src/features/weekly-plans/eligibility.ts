import {
  foodDietClass,
  suggestAllergens,
  type SuggestibleFood,
} from './dish-suggestions';

export type PlanConstraints = {
  allergens: readonly string[];
  dietPattern: string | null;
  /** Typed exclusions that have not yet been mapped to a reviewed catalog fact. */
  unmappedExclusions?: readonly string[];
};

export type EligibilityViolation =
  | { kind: 'allergen'; allergen: string }
  | { kind: 'diet_pattern'; pattern: 'vegetarian' | 'vegan' }
  | { kind: 'unknown_diet_class'; foodName: string }
  | { kind: 'unmapped_exclusion'; exclusion: string }
  | { kind: 'unsupported_pattern'; pattern: string };

export type EligibilityDecision = {
  eligible: boolean;
  violations: EligibilityViolation[];
  /** Client allergens that conflict, suitable for a disabled-catalog label. */
  blockedBy: string[];
};

export type EligibleDish = {
  allergenTags: readonly string[];
  ingredients?: readonly { food: SuggestibleFood }[];
  recipe?: readonly { food: SuggestibleFood }[];
};

/** Patterns with deterministic, ingredient-level checks in the current catalog. */
export const SUPPORTED_DIET_PATTERNS = ['vegetarian', 'vegan'] as const;

export function isSupportedDietPattern(pattern: string | null): boolean {
  return pattern === null || SUPPORTED_DIET_PATTERNS.some((value) => value === pattern);
}

/**
 * Compatibility between the legacy umbrella tags and the precise vocabulary.
 * It intentionally errs toward blocking: an old `nuts` dish cannot prove which
 * nut it contains, and an old `lactose` dairy tag cannot prove absence of milk
 * protein.
 */
const ALLERGEN_COMPATIBILITY: Record<string, readonly string[]> = {
  nuts: ['nuts', 'peanut', 'tree_nuts'],
  peanut: ['peanut', 'nuts'],
  tree_nuts: ['tree_nuts', 'nuts'],
  lactose: ['lactose', 'milk'],
  milk: ['milk', 'lactose'],
};

export function allergenConflicts(
  clientAllergens: readonly string[],
  dishAllergens: readonly string[],
): string[] {
  const carried = new Set(dishAllergens);

  return [...new Set(clientAllergens)].filter((allergen) =>
    (ALLERGEN_COMPATIBILITY[allergen] ?? [allergen]).some((tag) => carried.has(tag)),
  );
}

/** Declared tags plus conservative name/category suggestions, never fewer. */
export function effectiveDishAllergens(dish: EligibleDish): string[] {
  const foods = foodsOf(dish);
  return [...new Set([...dish.allergenTags, ...suggestAllergens(foods)])];
}

/**
 * The one eligibility decision used by generation, manual editing and publish.
 * Unknown prepared/custom foods fail vegetarian/vegan checks because absence of
 * a keyword is not evidence that a food is compatible with a prescription.
 */
export function evaluateDishEligibility(
  dish: EligibleDish,
  constraints: PlanConstraints,
): EligibilityDecision {
  const violations: EligibilityViolation[] = [];
  const blockedBy = allergenConflicts(constraints.allergens, effectiveDishAllergens(dish));

  violations.push(...blockedBy.map((allergen) => ({ kind: 'allergen' as const, allergen })));
  violations.push(
    ...(constraints.unmappedExclusions ?? []).map((exclusion) => ({
      kind: 'unmapped_exclusion' as const,
      exclusion,
    })),
  );

  const pattern = constraints.dietPattern;

  if (pattern !== null && !isSupportedDietPattern(pattern)) {
    violations.push({ kind: 'unsupported_pattern', pattern });
  } else if (pattern === 'vegetarian' || pattern === 'vegan') {
    const foods = foodsOf(dish);

    for (const food of foods) {
      const foodClass = foodDietClass(food);

      if (foodClass === 'unknown') {
        violations.push({
          kind: 'unknown_diet_class',
          foodName: food.nameAr || food.nameEn,
        });
        continue;
      }

      const allowed =
        pattern === 'vegetarian'
          ? foodClass === 'plant' || foodClass === 'dairy' || foodClass === 'egg'
          : foodClass === 'plant';

      if (!allowed) violations.push({ kind: 'diet_pattern', pattern });
    }
  }

  return { eligible: violations.length === 0, violations, blockedBy };
}

/** A non-null unrecognised database value is also unsupported. */
export function unsupportedPattern(pattern: string | null): string | null {
  if (pattern === null || isSupportedDietPattern(pattern)) return null;
  return pattern;
}

export function hasUnmappedExclusions(constraints: PlanConstraints): boolean {
  return (constraints.unmappedExclusions?.length ?? 0) > 0;
}

function foodsOf(dish: EligibleDish): SuggestibleFood[] {
  return (dish.ingredients ?? dish.recipe ?? []).map((line) => line.food);
}
