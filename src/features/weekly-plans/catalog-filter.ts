import { MEAL_TOLERANCE } from './drift';
import type { CatalogEntry } from './queries';
import type { DishTag } from './schema';
import { bestServings } from './similar';
import type { RecentUse } from './usage';

/**
 * The narrowings that are about this client and this slot rather than about the
 * dish itself.
 *
 * They are deliberately not `DISH_TAGS`. A tag is a property the dish carries
 * wherever it appears; these three are answers to "is it right *here*" — does it
 * land on this slot's budget, has this client just eaten it, does it carry one
 * of their allergens. All three are computable from what the board already holds
 * in memory, which is why they are worth having: no round trip and no schema.
 */
export const CATALOG_OPTIONS = ['fitsBudget', 'notRecent', 'allergenSafe'] as const;
export type CatalogOption = (typeof CATALOG_OPTIONS)[number];

export type CatalogFilters = {
  /** The search box, already trimmed and lowercased. */
  needle: string;
  mealType: string | null;
  tags: readonly DishTag[];
  options: readonly CatalogOption[];
};

/** What the option predicates need that a dish does not carry itself. */
export type CatalogContext = {
  /** How recently this client had each dish, keyed by dish id. */
  usage: Record<string, RecentUse>;
  /** The open slot's target, or null when no slot is open or it has no target. */
  budgetKcal: number | null;
};

/**
 * The catalog, narrowed.
 *
 * Every filter is **AND**. Picking "vegetarian" and then "high protein" asks for
 * dishes that are both, which is what adding a second chip reads as; under OR
 * every extra chip would return *more* rows, which is the opposite of what
 * pressing a filter is understood to do.
 *
 * Pure, and separate from the panel that renders it, because the semantics above
 * are the part worth pinning down — which way the tags combine, what "recently"
 * counts as, and at which portion a dish is measured against a budget.
 */
export function filterCatalog(
  catalog: readonly CatalogEntry[],
  { needle, mealType, tags, options }: CatalogFilters,
  { usage, budgetKcal }: CatalogContext,
): CatalogEntry[] {
  return catalog.filter((dish) => {
    if (needle) {
      const haystack = `${dish.nameAr} ${dish.nameEn} ${dish.slug}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }

    if (mealType && !dish.mealTypes.includes(mealType)) return false;
    if (!tags.every((tag) => dish.tags.includes(tag))) return false;

    for (const option of options) {
      if (option === 'allergenSafe' && dish.blockedBy.length > 0) return false;

      // `usage` only holds the last few plans (`USAGE_WINDOW`), so presence in
      // it is exactly "recently" — including the plan being edited right now,
      // since the commonest repeat to catch is the one placed ten seconds ago.
      if (option === 'notRecent' && usage[dish.id]) return false;

      if (option === 'fitsBudget') {
        // Nothing to measure against. The option is not offered in this state,
        // but a filter that silently drops every row if it ever were is worse
        // than one that passes them through.
        if (budgetKcal === null || budgetKcal <= 0) continue;

        // Measured at the portion a drag would actually place, not at one base
        // serving: a dish is only "off budget" if no portion of it fits.
        const kcal = (bestServings(dish.baseKcal, budgetKcal) ?? 1) * dish.baseKcal;
        if (Math.abs(kcal - budgetKcal) > budgetKcal * MEAL_TOLERANCE) return false;
      }
    }

    return true;
  });
}

/**
 * Which options this client and this slot can actually answer.
 *
 * An option that cannot change the list is worse than a missing one: pressing it
 * does nothing, which reads as broken. "Within budget" needs an open slot with a
 * target, "not used recently" needs the client to have a history, and "no
 * allergens" needs at least one dish to be blocked.
 */
export function availableOptions(
  catalog: readonly CatalogEntry[],
  { usage, budgetKcal }: CatalogContext,
): CatalogOption[] {
  return CATALOG_OPTIONS.filter((option) => {
    if (option === 'fitsBudget') return budgetKcal !== null && budgetKcal > 0;
    if (option === 'notRecent') return Object.keys(usage).length > 0;
    return catalog.some((dish) => dish.blockedBy.length > 0);
  });
}
