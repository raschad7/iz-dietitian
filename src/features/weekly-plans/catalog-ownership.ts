/**
 * The catalog's ownership filter (Phase 2 §2): all dishes, the shared/system
 * ones, or the clinic's own.
 *
 * A dish is "system"/shared when it has no owning clinic (`clinic_id = null`) and
 * "mine" when it belongs to the viewing clinic. Kept as a pure predicate — free of
 * the database — so `listDishes` can apply it in the same in-memory pass as the
 * meal/tag/search filters, and it can be unit-tested directly.
 */

export const OWNER_FILTERS = ['system', 'clinic'] as const;

export type OwnerFilter = (typeof OWNER_FILTERS)[number];

/** Narrows an untrusted query-string value to a known owner filter, or undefined. */
export function parseOwnerFilter(value: string | undefined): OwnerFilter | undefined {
  return value === 'system' || value === 'clinic' ? value : undefined;
}

/**
 * Whether a dish passes the ownership filter. No filter (undefined) passes
 * everything; `system` keeps shared dishes (no owner); `clinic` keeps the
 * clinic's own.
 */
export function matchesOwner(dishClinicId: string | null, owner: OwnerFilter | undefined): boolean {
  if (!owner) return true;
  if (owner === 'system') return dishClinicId === null;
  return dishClinicId !== null;
}
