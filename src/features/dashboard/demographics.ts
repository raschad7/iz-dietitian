import { CLIENT_SEXES, type ClientSex } from '@/features/clients/schema';
import { calculateAge } from '@/features/clients/age';

import { type ClientDemographic } from './queries';

/**
 * Turning the register into the two demographic charts.
 *
 * Pure — no database, no React, no `Intl` — so the bucketing rules can be read
 * and tested on their own, the same split as `src/features/clients/age.ts`.
 *
 * Both distributions keep an explicit "not recorded" bucket rather than
 * dropping the rows. A clinic with half its birthdays missing should see that
 * fact in the chart; silently narrowing the denominator would turn a
 * data-entry gap into a confident-looking statistic.
 */

/**
 * Age bands, in order.
 *
 * These are **ordinal**, not categorical: reordering them would change what
 * the chart means, which is why the bars take one hue in monotone lightness
 * steps rather than five different hues (see the viz tokens in globals.css).
 *
 * Five bands, because the sequential ramp has five steps and because the
 * clinical distinctions that matter here — paediatric, young adult, middle
 * age, pre-retirement, older adult — are five.
 */
export const AGE_BANDS = [
  { key: 'under18', min: 0, max: 17 },
  { key: 'age18to29', min: 18, max: 29 },
  { key: 'age30to44', min: 30, max: 44 },
  { key: 'age45to59', min: 45, max: 59 },
  { key: 'age60plus', min: 60, max: Infinity },
] as const;

export type AgeBandKey = (typeof AGE_BANDS)[number]['key'] | 'unknown';
export type SexKey = ClientSex | 'unknown';

export type DistributionSlice<TKey extends string> = {
  key: TKey;
  count: number;
  /** 0–1 of the whole register. Zero when there is nobody to divide by. */
  share: number;
};

export type Demographics = {
  total: number;
  age: DistributionSlice<AgeBandKey>[];
  sex: DistributionSlice<SexKey>[];
};

function bandOf(age: number): AgeBandKey {
  return AGE_BANDS.find((band) => age >= band.min && age <= band.max)?.key ?? 'unknown';
}

function toSlices<TKey extends string>(
  keys: readonly TKey[],
  counts: Map<string, number>,
  total: number,
): DistributionSlice<TKey>[] {
  return keys.map((key) => {
    const value = counts.get(key) ?? 0;
    return { key, count: value, share: total === 0 ? 0 : value / total };
  });
}

export function summariseDemographics(rows: ClientDemographic[], today: Date = new Date()): Demographics {
  const ageCounts = new Map<string, number>();
  const sexCounts = new Map<string, number>();

  for (const row of rows) {
    // `calculateAge` returns null for an unparseable or implausible date, so a
    // corrupt row lands in "not recorded" instead of skewing a band.
    const age = row.dateOfBirth ? calculateAge(row.dateOfBirth, today) : null;
    const ageKey: AgeBandKey = age === null ? 'unknown' : bandOf(age);
    ageCounts.set(ageKey, (ageCounts.get(ageKey) ?? 0) + 1);

    // The column is plain `text` with no check constraint, so anything outside
    // the known values is treated as unrecorded rather than trusted.
    const sexKey: SexKey = CLIENT_SEXES.includes(row.sex as ClientSex) ? (row.sex as ClientSex) : 'unknown';
    sexCounts.set(sexKey, (sexCounts.get(sexKey) ?? 0) + 1);
  }

  const total = rows.length;
  const ageKeys: AgeBandKey[] = [...AGE_BANDS.map((band) => band.key), 'unknown'];
  const sexKeys: SexKey[] = [...CLIENT_SEXES, 'unknown'];

  return {
    total,
    // An empty bucket is still drawn — a gap in the middle of an ordered scale
    // is information. "Not recorded" is dropped when it is empty, because there
    // is nothing to disclose.
    age: toSlices(ageKeys, ageCounts, total).filter((slice) => slice.key !== 'unknown' || slice.count > 0),
    sex: toSlices(sexKeys, sexCounts, total).filter((slice) => slice.key !== 'unknown' || slice.count > 0),
  };
}
