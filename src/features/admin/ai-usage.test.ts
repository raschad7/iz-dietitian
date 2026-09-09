import { describe, expect, test } from 'bun:test';

import {
  DEFAULT_USAGE_RANGE,
  byClinic,
  byModel,
  byScope,
  medianDurationByDay,
  medianOf,
  parseUsageRange,
  rangeStart,
  summarise,
  unpricedModels,
  type UsageRow,
} from './ai-usage';

/** A generation row with sensible defaults, so each test states only what it is about. */
function row(over: Partial<UsageRow> = {}): UsageRow {
  return {
    clinicId: 'clinic-a',
    clinicName: 'Clinic A',
    scope: 'week',
    model: 'gpt-4o-mini',
    status: 'ok',
    promptTokens: 1_000,
    completionTokens: 500,
    durationMs: 12_000,
    createdAt: new Date('2026-09-01T10:00:00Z'),
    ...over,
  };
}

describe('summarise', () => {
  test('an empty set is all zeroes, with no median and no last run', () => {
    expect(summarise([])).toEqual({
      runs: 0,
      failed: 0,
      promptTokens: 0,
      completionTokens: 0,
      costMicroUsd: 0,
      unpricedRuns: 0,
      unmeasuredRuns: 0,
      medianDurationMs: null,
      lastRunAt: null,
    });
  });

  test('adds tokens and costs across rows', () => {
    const totals = summarise([row(), row()]);

    expect(totals.runs).toBe(2);
    expect(totals.promptTokens).toBe(2_000);
    expect(totals.completionTokens).toBe(1_000);
    // 2,000 × 0.15 + 1,000 × 0.60 = 300 + 600.
    expect(totals.costMicroUsd).toBe(900);
  });

  test('counts anything that is not `ok` as a failure', () => {
    expect(summarise([row(), row({ status: 'failed' })]).failed).toBe(1);
  });

  /**
   * A failed run never got a usage block back, so it contributes no tokens —
   * but it is still a run, and still a call that was attempted.
   */
  test('a failed run with no tokens still counts as a run', () => {
    const totals = summarise([row({ status: 'failed', promptTokens: null, completionTokens: null })]);

    expect(totals.runs).toBe(1);
    expect(totals.failed).toBe(1);
    expect(totals.promptTokens).toBe(0);
    // Not `unmeasured`: that count is about successes whose tokens went missing.
    expect(totals.unmeasuredRuns).toBe(0);
  });

  test('a successful run reporting no tokens is counted as unmeasured', () => {
    const totals = summarise([row({ promptTokens: null, completionTokens: null })]);

    expect(totals.unmeasuredRuns).toBe(1);
    expect(totals.failed).toBe(0);
  });

  /**
   * The honest-gap rule: an unrated model contributes its tokens to the token
   * columns and nothing at all to the cost, and says so.
   */
  test('an unrated model is counted but not priced', () => {
    const totals = summarise([row({ model: 'gpt-5.6-luna' }), row()]);

    expect(totals.runs).toBe(2);
    expect(totals.promptTokens).toBe(2_000);
    expect(totals.unpricedRuns).toBe(1);
    // Only the rated row contributed: 1,000 × 0.15 + 500 × 0.60 = 450.
    expect(totals.costMicroUsd).toBe(450);
  });

  test('takes the latest createdAt as the last run', () => {
    const totals = summarise([
      row({ createdAt: new Date('2026-08-01T00:00:00Z') }),
      row({ createdAt: new Date('2026-09-03T00:00:00Z') }),
      row({ createdAt: new Date('2026-08-20T00:00:00Z') }),
    ]);

    expect(totals.lastRunAt).toEqual(new Date('2026-09-03T00:00:00Z'));
  });

  test('ignores rows with no duration rather than reading them as zero', () => {
    // A zero would drag the median toward "instant" for calls that never reported.
    expect(summarise([row({ durationMs: 10_000 }), row({ durationMs: null })]).medianDurationMs).toBe(
      10_000,
    );
  });
});

describe('medianOf', () => {
  test('is null for an empty set', () => {
    expect(medianOf([])).toBeNull();
  });

  test('takes the middle of an odd-length set', () => {
    expect(medianOf([30, 10, 20])).toBe(20);
  });

  test('averages the two middles of an even-length set', () => {
    expect(medianOf([10, 20, 30, 40])).toBe(25);
  });

  /**
   * The reason this is a median at all. One timeout must not move the figure
   * that answers "how long does this normally take".
   */
  test('one outlier does not move it, where a mean would be dragged', () => {
    const values = [12_000, 12_000, 13_000, 100_000];
    const mean = values.reduce((a, b) => a + b, 0) / values.length;

    expect(medianOf(values)).toBe(12_500);
    expect(mean).toBeGreaterThan(30_000);
  });
});

describe('medianDurationByDay', () => {
  const dayOf = (r: UsageRow) => r.createdAt.toISOString().slice(0, 10);

  test('gives one median per day, oldest first', () => {
    const points = medianDurationByDay(
      [
        row({ createdAt: new Date('2026-09-02T09:00:00Z'), durationMs: 40_000 }),
        row({ createdAt: new Date('2026-09-01T09:00:00Z'), durationMs: 10_000 }),
        row({ createdAt: new Date('2026-09-01T11:00:00Z'), durationMs: 30_000 }),
      ],
      dayOf,
    );

    expect(points).toEqual([
      { key: '2026-09-01', value: 20_000 },
      { key: '2026-09-02', value: 40_000 },
    ]);
  });

  /* The reason this is not a `bucketBy` call: a zero on a duration axis draws
     the line to the floor and says the day was instant. */
  test('omits days with no runs rather than zeroing them', () => {
    const points = medianDurationByDay(
      [
        row({ createdAt: new Date('2026-09-01T09:00:00Z'), durationMs: 10_000 }),
        row({ createdAt: new Date('2026-09-04T09:00:00Z'), durationMs: 20_000 }),
      ],
      dayOf,
    );

    expect(points.map((point) => point.key)).toEqual(['2026-09-01', '2026-09-04']);
  });

  test('skips runs that reported no duration, and days made only of them', () => {
    const points = medianDurationByDay(
      [
        row({ createdAt: new Date('2026-09-01T09:00:00Z'), durationMs: null }),
        row({ createdAt: new Date('2026-09-02T09:00:00Z'), durationMs: null }),
        row({ createdAt: new Date('2026-09-02T10:00:00Z'), durationMs: 8_000 }),
      ],
      dayOf,
    );

    expect(points).toEqual([{ key: '2026-09-02', value: 8_000 }]);
  });

  test('is empty when nothing timed anything', () => {
    expect(medianDurationByDay([row({ durationMs: null })], dayOf)).toEqual([]);
  });
});

describe('byClinic', () => {
  test('totals each clinic separately and keeps its name', () => {
    const grouped = byClinic([
      row({ clinicId: 'a', clinicName: 'Alpha' }),
      row({ clinicId: 'a', clinicName: 'Alpha' }),
      row({ clinicId: 'b', clinicName: 'Beta' }),
    ]);

    expect(grouped).toHaveLength(2);
    expect(grouped.find((c) => c.clinicId === 'a')!.runs).toBe(2);
    expect(grouped.find((c) => c.clinicId === 'b')!.clinicName).toBe('Beta');
  });

  test('puts the most expensive clinic first', () => {
    const grouped = byClinic([
      row({ clinicId: 'small', clinicName: 'Small', promptTokens: 100, completionTokens: 100 }),
      row({ clinicId: 'big', clinicName: 'Big', promptTokens: 900_000, completionTokens: 900_000 }),
    ]);

    expect(grouped[0]!.clinicId).toBe('big');
  });

  /**
   * Unpriced clinics all have a cost of zero, so cost alone leaves them in map
   * order — which is where a clinic burning tokens on an unrated model would
   * hide. Run count is the measure that is always available.
   */
  test('orders clinics that cannot be priced by how many runs they made', () => {
    const grouped = byClinic([
      row({ clinicId: 'quiet', clinicName: 'Quiet', model: 'unrated-model' }),
      row({ clinicId: 'busy', clinicName: 'Busy', model: 'unrated-model' }),
      row({ clinicId: 'busy', clinicName: 'Busy', model: 'unrated-model' }),
    ]);

    expect(grouped.map((c) => c.clinicId)).toEqual(['busy', 'quiet']);
  });

  test('is stable by name when cost and volume tie', () => {
    const grouped = byClinic([
      row({ clinicId: 'z', clinicName: 'Zebra' }),
      row({ clinicId: 'a', clinicName: 'Antelope' }),
    ]);

    expect(grouped.map((c) => c.clinicName)).toEqual(['Antelope', 'Zebra']);
  });
});

describe('byModel and byScope', () => {
  test('group by the model name as stored', () => {
    const grouped = byModel([row({ model: 'gpt-4o-mini' }), row({ model: 'gpt-5.6-luna' }), row()]);

    expect(grouped.find((m) => m.key === 'gpt-4o-mini')!.runs).toBe(2);
    expect(grouped.find((m) => m.key === 'gpt-5.6-luna')!.unpricedRuns).toBe(1);
  });

  /** Review is a model call like any other, and shows up as its own scope. */
  test('separate a review from the generations it reviewed', () => {
    const grouped = byScope([row({ scope: 'week' }), row({ scope: 'review' }), row({ scope: 'day' })]);

    expect(grouped.map((s) => s.key).sort()).toEqual(['day', 'review', 'week']);
    expect(grouped.find((s) => s.key === 'review')!.runs).toBe(1);
  });
});

describe('unpricedModels', () => {
  test('names each unrated model once, sorted', () => {
    expect(
      unpricedModels([row({ model: 'zeta-1' }), row({ model: 'alpha-1' }), row({ model: 'zeta-1' }), row()]),
    ).toEqual(['alpha-1', 'zeta-1']);
  });

  test('is empty when everything in the set has a rate', () => {
    expect(unpricedModels([row(), row({ model: 'console' })])).toEqual([]);
  });
});

describe('parseUsageRange', () => {
  test('accepts each known range', () => {
    expect(parseUsageRange('7d')).toBe('7d');
    expect(parseUsageRange('all')).toBe('all');
  });

  test('falls back to the default for anything else', () => {
    // Straight off the query string, so it is attacker controlled.
    expect(parseUsageRange(undefined)).toBe(DEFAULT_USAGE_RANGE);
    expect(parseUsageRange('')).toBe(DEFAULT_USAGE_RANGE);
    expect(parseUsageRange('1000d')).toBe(DEFAULT_USAGE_RANGE);
    expect(parseUsageRange("'; drop table users; --")).toBe(DEFAULT_USAGE_RANGE);
  });
});

describe('rangeStart', () => {
  const now = new Date('2026-09-05T12:00:00Z');

  test('counts back the named number of days', () => {
    expect(rangeStart('7d', now)).toEqual(new Date('2026-08-29T12:00:00Z'));
    expect(rangeStart('30d', now)).toEqual(new Date('2026-08-06T12:00:00Z'));
    expect(rangeStart('90d', now)).toEqual(new Date('2026-06-07T12:00:00Z'));
  });

  test('is null for `all`, which is the absence of a lower bound', () => {
    expect(rangeStart('all', now)).toBeNull();
  });
});
