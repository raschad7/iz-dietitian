/**
 * The window every platform screen is read through, and the one before it.
 *
 * ## Why a period always comes in pairs
 *
 * The panel this replaces printed twenty-seven live counts and no baselines. A
 * count with nothing to compare it to cannot be acted on: "41 plans this week"
 * is not good news or bad news, it is a number. What an operator opens a
 * platform screen to learn is whether something changed, so every window here
 * carries the equally-long window immediately before it, and the figures are
 * shown as a value and a delta.
 *
 * The previous window is the same length and ends exactly where the current one
 * begins — no gap, no overlap. That is what makes the two comparable, and it is
 * why this arithmetic lives in one tested function rather than being redone at
 * each call site with a different off-by-one.
 *
 * ## Days, not calendar months
 *
 * "The last 30 days" means the same thing whenever it is read. "This month"
 * answers differently on the 1st and the 31st and quietly invites a comparison
 * between two periods of unequal length — which is exactly the mistake a delta
 * is supposed to prevent.
 */

/** How far back a screen looks. `all` is here because a young deployment's first month is its whole history. */
export const USAGE_RANGES = ['7d', '30d', '90d', 'all'] as const;

export type UsageRange = (typeof USAGE_RANGES)[number];

export const DEFAULT_USAGE_RANGE: UsageRange = '30d';

/** Narrows an untrusted query-string value to a known range. */
export function parseUsageRange(value: string | undefined): UsageRange {
  return USAGE_RANGES.includes(value as UsageRange) ? (value as UsageRange) : DEFAULT_USAGE_RANGE;
}

/**
 * The earliest instant a range includes, or `null` for "everything".
 *
 * Takes `now` rather than reading the clock, so one instant can be passed to
 * every part of a render and a test can assert the boundary without freezing
 * time globally.
 */
export function rangeStart(range: UsageRange, now: Date): Date | null {
  if (range === 'all') return null;

  return new Date(now.getTime() - rangeDays(range) * DAY_MS);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** How many days a bounded range covers. `all` has no length; it answers 0. */
export function rangeDays(range: UsageRange): number {
  return range === 'all' ? 0 : Number.parseInt(range, 10);
}

/**
 * A window and the equally-long one before it.
 *
 * `previousStart` and `previousEnd` are `null` for `all`, because there is no
 * period before all of history and inventing one would produce a delta against
 * an empty set — which renders as "+100%" on every figure and means nothing.
 * Callers must handle the null pair by showing no delta at all.
 */
export type Period = {
  range: UsageRange;
  start: Date | null;
  end: Date;
  previousStart: Date | null;
  previousEnd: Date | null;
};

export function periodOf(range: UsageRange, now: Date): Period {
  const start = rangeStart(range, now);

  if (!start) {
    return { range, start: null, end: now, previousStart: null, previousEnd: null };
  }

  const length = now.getTime() - start.getTime();

  return {
    range,
    start,
    end: now,
    // Ends where the current window begins, so no event is in both and none
    // falls between them.
    previousEnd: start,
    previousStart: new Date(start.getTime() - length),
  };
}

/** A figure, what it was last period, and what that means. */
export type Delta = {
  value: number;
  previous: number | null;
  /** Signed change. Null when there is nothing to compare against. */
  change: number | null;
  /** Change as a fraction of the previous value. Null when that value was zero. */
  ratio: number | null;
  direction: 'up' | 'down' | 'flat' | 'unknown';
};

/**
 * Compares two figures.
 *
 * **A rise from zero has no ratio.** Going from 0 to 5 is not a 500% increase
 * and it is not an infinite one; it is a change of five from nothing, and the
 * only honest presentation is the absolute number. Every dashboard that prints
 * "+∞%" or "+100%" there is lying about the arithmetic, so `ratio` is null and
 * the component renders the count.
 *
 * `previous: null` means the range was `all` — no earlier period exists — and
 * the direction is `unknown` rather than `flat`, because "we cannot tell" and
 * "it did not move" are different answers.
 */
export function delta(value: number, previous: number | null): Delta {
  if (previous === null) {
    return { value, previous: null, change: null, ratio: null, direction: 'unknown' };
  }

  const change = value - previous;

  return {
    value,
    previous,
    change,
    ratio: previous === 0 ? null : change / previous,
    direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
  };
}

/**
 * Whether a movement is worth the reader's attention.
 *
 * Small deployments produce noisy percentages — one clinic joining a base of
 * three is +33% — so a delta under this fraction is drawn in the muted colour
 * rather than tinted as a rise or a fall. It is still shown; it just does not
 * shout.
 */
export const NOTABLE_CHANGE = 0.05;

export function isNotable(value: Delta): boolean {
  return value.ratio !== null && Math.abs(value.ratio) >= NOTABLE_CHANGE;
}

/**
 * Whole days between two instants, rounded toward zero.
 *
 * Used for "last seen 12 days ago" and for trial countdowns. Deliberately not
 * `Intl.RelativeTimeFormat` — that is for display, and this is the number the
 * health rules compare against thresholds.
 */
export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

/**
 * Every day in a window, as `YYYY-MM-DD` keys, oldest first.
 *
 * Charts need a point per day including the days nothing happened — a series
 * built only from the rows that exist draws a line straight through a quiet
 * week and makes an outage look like normal traffic.
 *
 * Bounded to `maxPoints` by widening the step, so a 90-day range does not
 * render ninety labels on a phone. The step is in days and the buckets stay
 * contiguous, so nothing is dropped.
 */
export function dayKeys(start: Date, end: Date): string[] {
  const keys: string[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());

  while (cursor.getTime() <= last) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return keys;
}

/** The `YYYY-MM-DD` key an instant falls in. */
export function dayKey(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** The `YYYY-MM` key an instant falls in. */
export function monthKey(at: Date): string {
  return at.toISOString().slice(0, 7);
}

/**
 * The last `count` calendar months as `YYYY-MM` keys, oldest first, ending with
 * the one `now` falls in.
 */
export function monthKeys(now: Date, count: number): string[] {
  const keys: string[] = [];

  for (let back = count - 1; back >= 0; back -= 1) {
    const at = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    keys.push(at.toISOString().slice(0, 7));
  }

  return keys;
}

/**
 * Buckets timestamped rows into a fixed set of keys.
 *
 * The keys come in already complete — from `dayKeys` or `monthKeys` — so a
 * bucket with no rows is a zero rather than a gap. Rows outside the key set are
 * dropped silently, which is what makes it safe to pass a wider read than the
 * chart's window.
 */
export function bucketBy<T>(
  rows: readonly T[],
  keys: readonly string[],
  keyOf: (row: T) => string,
  valueOf: (row: T) => number = () => 1,
): { key: string; value: number }[] {
  const buckets = new Map(keys.map((key) => [key, 0]));

  for (const row of rows) {
    const key = keyOf(row);
    const held = buckets.get(key);
    if (held !== undefined) buckets.set(key, held + valueOf(row));
  }

  return keys.map((key) => ({ key, value: buckets.get(key) ?? 0 }));
}
