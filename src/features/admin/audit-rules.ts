/**
 * The audit log's rules, with nothing behind them.
 *
 * ## Why this is a separate file from `audit.ts`
 *
 * `audit.ts` imports `next/headers` and the database client, which makes it a
 * server-only module. `ReasonDialog` is a client component and needs two numbers
 * from it — the minimum and maximum length of a reason — so that the button it
 * disables agrees with the rule the server enforces.
 *
 * Importing them from `audit.ts` pulled the whole thing into the browser bundle,
 * and the dev server said so in the only way it can: `Module not found: Can't
 * resolve 'net'`, `'tls'`, `'fs'`, `'perf_hooks'` — the `postgres` driver being
 * asked to run in a browser, plus a `next/headers` error underneath it. Nothing
 * would have shipped, but the failure is a wall of module traces rather than a
 * sentence, and the fix is not "mark it server-only" — it is to have the shared
 * half be shareable.
 *
 * So: everything here is a constant or a pure function. Nothing imports a
 * driver, a header, or a request. `audit.ts` re-exports all of it, so existing
 * call sites and the tests are unaffected.
 */

/** What kind of thing an action was performed on. */
export type AuditTargetType = 'clinic' | 'account' | 'food' | 'plan';

export type AdminActionSpec = {
  key: string;
  target: AuditTargetType;
  /**
   * Whether the operator must say why.
   *
   * True for anything that takes something away from someone who cannot undo it
   * — suspending a practice, disabling an account — and for promotion, which
   * hands somebody the keys to every clinic on the deployment. False for the
   * reverses of those, and for edits whose effect is visible in the
   * `before`/`after` pair.
   *
   * **Restoring never requires a reason.** Making it as costly to give access
   * back as to take it away is how a panel ends up with people left suspended
   * because nobody had a sentence ready.
   */
  requiresReason: boolean;
  /**
   * Marks the verbs the screen tints as consequential, so a suspension does not
   * read like a rename in a list of forty rows.
   */
  destructive: boolean;
};

/**
 * The closed set of verbs the platform area can perform.
 *
 * Read in four places: the action that writes the row, the filter on the audit
 * screen, the message catalogue that names it, and the rule that decides whether
 * a reason is required. Adding a privileged button means adding a line here
 * first — which is the point. A verb that is not in this list has nowhere to be
 * logged, so the log cannot fall behind the panel by accident.
 */
export const ADMIN_ACTIONS = [
  { key: 'clinic.suspend', target: 'clinic', requiresReason: true, destructive: true },
  { key: 'clinic.reactivate', target: 'clinic', requiresReason: false, destructive: false },
  { key: 'clinic.plan.update', target: 'clinic', requiresReason: false, destructive: false },
  { key: 'account.disable', target: 'account', requiresReason: true, destructive: true },
  { key: 'account.enable', target: 'account', requiresReason: false, destructive: false },
  { key: 'account.promote', target: 'account', requiresReason: true, destructive: true },
  { key: 'catalog.food.update', target: 'food', requiresReason: false, destructive: false },

  /*
    The price list. `create` and `update` need no reason — the before/after pair
    on the row says exactly what changed, which is the rule this file already
    applies to a food edit and to a clinic's plan.

    `archive` does need one, and is the only package verb marked destructive.
    Retiring a package is not reversible from the customer's side: it disappears
    from every picker, and a clinic sitting on it can no longer be moved back
    onto it once moved off. That is the same shape as suspending a practice, so
    it earns the same sentence. `restore` is its reverse and, like every other
    reverse here, costs nothing — see the note above `requiresReason`.
  */
  { key: 'plan.create', target: 'plan', requiresReason: false, destructive: false },
  { key: 'plan.update', target: 'plan', requiresReason: false, destructive: false },
  { key: 'plan.archive', target: 'plan', requiresReason: true, destructive: true },
  { key: 'plan.restore', target: 'plan', requiresReason: false, destructive: false },
] as const satisfies readonly AdminActionSpec[];

export type AdminActionKey = (typeof ADMIN_ACTIONS)[number]['key'];

const ACTION_BY_KEY = new Map<string, AdminActionSpec>(
  ADMIN_ACTIONS.map((spec) => [spec.key, spec]),
);

/** The spec for a verb, or `undefined` for a string the registry never declared. */
export function actionSpec(key: string): AdminActionSpec | undefined {
  return ACTION_BY_KEY.get(key);
}

/** Whether a verb refuses to be recorded without a reason. */
export function requiresReason(key: string): boolean {
  return ACTION_BY_KEY.get(key)?.requiresReason ?? false;
}

/**
 * The shortest reason worth storing.
 *
 * Five characters, not one. A required field with no floor is a field people
 * type `x` into, and a log full of `x` is a log that cost the operator a click
 * and told the reviewer nothing. Five is low enough that "spam" and "fraud"
 * pass and high enough that a stray keystroke does not.
 */
export const REASON_MIN_LENGTH = 5;

/** The longest. A paragraph is fine; an essay pasted by accident is not. */
export const REASON_MAX_LENGTH = 500;

/** Whether a reason clears the floor. Trimmed first, because whitespace is not a reason. */
export function isUsableReason(reason: string | null | undefined): boolean {
  const trimmed = reason?.trim() ?? '';

  return trimmed.length >= REASON_MIN_LENGTH && trimmed.length <= REASON_MAX_LENGTH;
}

/**
 * Escapes the wildcards `LIKE` gives meaning to.
 *
 * Without this, an operator searching for a reason containing `100%` matches
 * every row — `%` is "anything" to Postgres, and the term is interpolated into
 * a pattern. Not a security hole (the value is still a bound parameter, so
 * there is no injection here) but a search that silently returns everything is
 * a search nobody can trust, and this was wrong on all three platform screens
 * before the log existed to notice it.
 *
 * The backslash goes first, or it would escape the escapes added after it.
 */
export function escapeLike(term: string): string {
  return term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * The `target_type` written for a verb the registry does not declare.
 *
 * Unreachable in normal use — `AuditInput['action']` is the union of declared
 * keys — but the column is `not null`, so the write needs *something* rather
 * than a crash if a caller ever gets there through a cast.
 */
export const AUDIT_TARGET_FALLBACK: AuditTargetType = 'clinic';
