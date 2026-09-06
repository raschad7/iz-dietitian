import { costMicroUsd, rateFor } from './pricing';

/**
 * What the platform's AI spend comes to, per clinic.
 *
 * Pure: every function here takes rows and returns totals, with no database
 * import, so the arithmetic can be asserted directly in `bun test`. The reading
 * half lives in `queries.ts` — which is the one module in the application
 * allowed to select across clinics.
 *
 * ## Where the numbers come from
 *
 * `weekly_plan_generations` — one row per call to a model, written by
 * `recordGeneration` for successes AND failures. Nothing else has to be
 * consulted: plan review writes to the same table under `scope: 'review'`
 * rather than keeping a second ledger, so a clinic's whole model bill is one
 * query over one table.
 *
 * ## How nulls are read
 *
 * `prompt_tokens` and `completion_tokens` are nullable and a null means "the
 * provider did not report this", not zero. It happens on a failed call, which
 * never got a usage block back, and on the local stand-in transport. They are
 * summed as zero — there is nothing else to sum them as — but a run that
 * succeeded and still reported no tokens is counted in `unmeasuredRuns`, so the
 * screen can say the total is a floor rather than presenting it as complete.
 */

/** One generation row, as the screen needs it. */
export type UsageRow = {
  clinicId: string;
  clinicName: string;
  /** `week` | `day` | `meal` | `review`. Text, because the column is. */
  scope: string;
  model: string;
  /** `ok` | `failed`. */
  status: string;
  promptTokens: number | null;
  completionTokens: number | null;
  durationMs: number | null;
  createdAt: Date;
};

export type UsageTotals = {
  runs: number;
  failed: number;
  promptTokens: number;
  completionTokens: number;
  /**
   * Micro-dollars over the runs that could be priced. Read it beside
   * `unpricedRuns`: with any of those, this is a floor and not the bill.
   */
  costMicroUsd: number;
  /** Runs on a model with no entry in `MODEL_RATES`. */
  unpricedRuns: number;
  /** Runs that succeeded but reported no token counts. */
  unmeasuredRuns: number;
  /** Null when nothing in the set reported a duration. */
  medianDurationMs: number | null;
  lastRunAt: Date | null;
};

export type ClinicUsage = UsageTotals & {
  clinicId: string;
  clinicName: string;
};

/** A totals row for one grouping key — a model, or a scope. */
export type KeyedUsage = UsageTotals & { key: string };

/**
 * The middle duration of a set.
 *
 * Median rather than mean: one generation that hit the 100-second timeout drags
 * an average far enough to hide that every other call took twelve seconds, and
 * "how long does this normally take" is the question the column is there to
 * answer. Rows with no duration are left out rather than counted as zero.
 */
export function medianOf(values: readonly number[]): number | null {
  if (!values.length) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0 ? Math.round((sorted[middle - 1]! + sorted[middle]!) / 2) : sorted[middle]!;
}

/** Totals over any set of rows. */
export function summarise(rows: readonly UsageRow[]): UsageTotals {
  const totals: UsageTotals = {
    runs: rows.length,
    failed: 0,
    promptTokens: 0,
    completionTokens: 0,
    costMicroUsd: 0,
    unpricedRuns: 0,
    unmeasuredRuns: 0,
    medianDurationMs: null,
    lastRunAt: null,
  };

  const durations: number[] = [];

  for (const row of rows) {
    if (row.status !== 'ok') totals.failed += 1;

    totals.promptTokens += row.promptTokens ?? 0;
    totals.completionTokens += row.completionTokens ?? 0;

    const cost = costMicroUsd(row.model, row.promptTokens, row.completionTokens);
    if (cost === null) totals.unpricedRuns += 1;
    else totals.costMicroUsd += cost;

    if (row.status === 'ok' && row.promptTokens === null && row.completionTokens === null) {
      totals.unmeasuredRuns += 1;
    }

    if (row.durationMs !== null) durations.push(row.durationMs);

    if (!totals.lastRunAt || row.createdAt > totals.lastRunAt) totals.lastRunAt = row.createdAt;
  }

  totals.medianDurationMs = medianOf(durations);

  return totals;
}

/**
 * Groups rows and summarises each group.
 *
 * Shared by the clinic, model and scope breakdowns, because "sum these rows" is
 * the same operation three times and the only thing that differs is what is read
 * off a row to key it by.
 */
function groupBy<T>(
  rows: readonly UsageRow[],
  keyOf: (row: UsageRow) => string,
  build: (key: string, group: UsageRow[]) => T,
): T[] {
  const groups = new Map<string, UsageRow[]>();

  for (const row of rows) {
    const key = keyOf(row);
    const held = groups.get(key);
    if (held) held.push(row);
    else groups.set(key, [row]);
  }

  return [...groups].map(([key, group]) => build(key, group));
}

/**
 * Sorts the expensive first, and breaks ties by volume.
 *
 * Cost alone would scatter every unpriced clinic at the bottom in whatever order
 * the map happened to hold them, which is exactly where a clinic running a model
 * nobody has rated would hide. Falling through to run count keeps them ordered by
 * the one measure that is always available, and the name last so the list is
 * stable between renders.
 */
function byWeight(a: UsageTotals & { name: string }, b: UsageTotals & { name: string }): number {
  return b.costMicroUsd - a.costMicroUsd || b.runs - a.runs || a.name.localeCompare(b.name);
}

/** Per-clinic totals, heaviest first. */
export function byClinic(rows: readonly UsageRow[]): ClinicUsage[] {
  return groupBy(
    rows,
    (row) => row.clinicId,
    (clinicId, group) => ({
      clinicId,
      // Every row in the group came from the same join, so any of them has the name.
      clinicName: group[0]!.clinicName,
      ...summarise(group),
    }),
  ).sort((a, b) => byWeight({ ...a, name: a.clinicName }, { ...b, name: b.clinicName }));
}

/** Per-model totals, heaviest first. */
export function byModel(rows: readonly UsageRow[]): KeyedUsage[] {
  return groupBy(
    rows,
    (row) => row.model,
    (key, group) => ({ key, ...summarise(group) }),
  ).sort((a, b) => byWeight({ ...a, name: a.key }, { ...b, name: b.key }));
}

/** Per-scope totals — `week`, `day`, `meal`, `review` — heaviest first. */
export function byScope(rows: readonly UsageRow[]): KeyedUsage[] {
  return groupBy(
    rows,
    (row) => row.scope,
    (key, group) => ({ key, ...summarise(group) }),
  ).sort((a, b) => byWeight({ ...a, name: a.key }, { ...b, name: b.key }));
}

/** Every model in the set that has no rate, for the screen to name in its warning. */
export function unpricedModels(rows: readonly UsageRow[]): string[] {
  const models = new Set<string>();

  for (const row of rows) {
    if (!rateFor(row.model)) models.add(row.model);
  }

  return [...models].sort();
}

/* ────────────────────────────────────────────────────────────────────────── */

/**
 * The range vocabulary lives in `period.ts`, which also owns the
 * previous-period arithmetic every other platform screen compares against.
 *
 * Re-exported here rather than moved outright: this module was the first reader
 * and the AI screen imports the pair from it, so keeping the names available
 * costs one line and saves a rename across the feature. There is still exactly
 * one definition.
 */
export {
  DEFAULT_USAGE_RANGE,
  parseUsageRange,
  rangeStart,
  USAGE_RANGES,
  type UsageRange,
} from './period';
