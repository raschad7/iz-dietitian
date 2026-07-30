/**
 * Narrowing for the enum-like `text` columns.
 *
 * Following the precedent set by `users.role`, columns like `clients.goal`,
 * `dishes.meal_types` and `weekly_plans.status` are `text` validated by Zod rather
 * than `pgEnum` — so a value written by an older version of the app, or by hand,
 * may not be a known key.
 *
 * Narrowing at the point of display means an unrecognised value renders as "not
 * set" instead of crashing the page with a missing-message error or, worse, silently
 * showing the wrong label. `next-intl` types message keys from `ar.json`, so this is
 * also what lets `t(\`goal.${value}\`)` typecheck at all.
 *
 * Originally local to `client-profile.tsx`; lifted here when the weekly-plans board
 * needed the same guard for allergens, meal types, tags and plan status.
 */
export function isMember<T extends string>(values: readonly T[], value: string | null | undefined): value is T {
  return value !== null && value !== undefined && (values as readonly string[]).includes(value);
}

/**
 * The members of `values` present in `input`, in the order `values` declares them.
 *
 * For the array columns: `dishes.allergen_tags` comes back as `string[]`, and the UI
 * needs the subset it has labels for. Ordering by the declaration rather than by what
 * the row happens to contain keeps a list of badges stable between rows.
 */
export function membersOf<T extends string>(values: readonly T[], input: readonly string[]): T[] {
  const present = new Set(input);
  return values.filter((value) => present.has(value));
}
