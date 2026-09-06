import type { AuditEntry } from '@/features/admin/audit';
import type { ClinicUsage, KeyedUsage, UsageTotals } from '@/features/admin/ai-usage';
import type { PairedPoint, Point } from '@/features/admin/components/charts';
import type { GenerationFailure } from '@/features/admin/queries';

/**
 * Fixture rows for `/dev/admin`.
 *
 * Shaped like what the real reads return and nothing more — no query, no
 * database, no session. See the harness page for why that matters.
 *
 * The figures are deliberately awkward rather than tidy: a single-row ranking (
 * the case that drew a 200px charcoal slab across a card), a delta from zero (
 * which has no honest percentage), a null median, an unpriced model, a refused
 * action. Rounded, evenly-spaced sample data hides exactly the states that
 * break a layout.
 */

/** A fixed instant, so a screenshot taken twice is the same screenshot. */
const NOW = new Date('2026-09-06T09:00:00.000Z');

const at = (daysAgo: number, hour = 9): Date =>
  new Date(NOW.getTime() - daysAgo * 86_400_000 - hour * 3_600_000);

export const FIXTURE_AUDIT: AuditEntry[] = [
  {
    id: 'a1',
    actorId: 'u1',
    actorEmail: 'admin@enzyme.local',
    action: 'account.disable',
    targetType: 'account',
    targetId: 'u9',
    targetLabel: 'admin@enzyme.local',
    outcome: 'refused',
    reason: null,
    before: null,
    after: { refused: 'self' },
    ipAddress: null,
    createdAt: at(0, 2),
  },
  {
    id: 'a2',
    actorId: 'u1',
    actorEmail: 'admin@enzyme.local',
    action: 'clinic.reactivate',
    targetType: 'clinic',
    targetId: 'c1',
    targetLabel: 'عيادة التغذية',
    outcome: 'ok',
    reason: null,
    before: null,
    after: null,
    ipAddress: null,
    createdAt: at(0, 3),
  },
  {
    id: 'a3',
    actorId: 'u1',
    actorEmail: 'admin@enzyme.local',
    action: 'clinic.suspend',
    targetType: 'clinic',
    targetId: 'c1',
    targetLabel: 'عيادة التغذية',
    outcome: 'ok',
    reason: 'لم تُسدَّد الاشتراكات منذ ثلاثة أشهر',
    before: null,
    after: null,
    ipAddress: null,
    createdAt: at(1, 4),
  },
  {
    id: 'a4',
    actorId: 'u1',
    actorEmail: 'a.very.long.operator.address@enzyme.local',
    action: 'catalog.food.update',
    targetType: 'food',
    targetId: 'f1',
    targetLabel: 'خبز الشراك الفلسطيني الرقيق',
    outcome: 'ok',
    reason: null,
    before: null,
    after: null,
    ipAddress: null,
    createdAt: at(2),
  },
  {
    id: 'a5',
    actorId: 'u1',
    actorEmail: 'admin@enzyme.local',
    action: 'clinic.plan.update',
    targetType: 'clinic',
    targetId: 'c2',
    targetLabel: 'رشاد كركي',
    outcome: 'ok',
    reason: null,
    before: null,
    after: null,
    ipAddress: null,
    createdAt: at(4),
  },
];

/** The state the ranked chart used to draw as one solid rectangle. */
export const FIXTURE_SPEND_ONE: Point[] = [
  { label: 'رشاد كركي', value: 28_643, display: 'US$ 0.0286' },
];

/** And the same chart with a full field, including a name that must be cut. */
export const FIXTURE_SPEND_MANY: Point[] = [
  { label: 'رشاد كركي', value: 28_643, display: 'US$ 0.0286' },
  { label: 'عيادة التغذية العلاجية والوقائية', value: 19_210, display: 'US$ 0.0192' },
  { label: 'Northgate Nutrition Clinic', value: 12_004, display: 'US$ 0.0120' },
  { label: 'عيادة الأمل', value: 6_820, display: 'US$ 0.0068' },
  { label: 'Bayview Dietetics', value: 900, display: 'US$ 0.0009' },
];

const DAILY_RUNS = [0, 0, 1, 5, 2, 0, 0, 3, 1, 0];

export const FIXTURE_DAILY: PairedPoint[] = Array.from({ length: 30 }, (_, index) => ({
  label: `${index + 1} Aug`,
  value: DAILY_RUNS[index % DAILY_RUNS.length] ?? 0,
  second: index === 3 ? 2 : 0,
}));

const totals = (over: Partial<UsageTotals> = {}): UsageTotals => ({
  runs: 17,
  failed: 0,
  promptTokens: 135_100,
  completionTokens: 55_500,
  costMicroUsd: 28_643,
  unpricedRuns: 7,
  unmeasuredRuns: 0,
  medianDurationMs: 35_400,
  lastRunAt: at(3),
  ...over,
});

export const FIXTURE_TOTALS = totals();

/** Half the runs and no cost at all, so every delta on the row is exercised. */
export const FIXTURE_PREVIOUS = totals({
  runs: 9,
  failed: 2,
  promptTokens: 70_000,
  completionTokens: 30_000,
  costMicroUsd: 0,
  medianDurationMs: 41_800,
});

export const FIXTURE_CLINIC_USAGE: ClinicUsage[] = [
  { ...totals(), clinicId: 'c2', clinicName: 'رشاد كركي' },
  {
    ...totals({ runs: 4, failed: 1, costMicroUsd: 0, unpricedRuns: 4, medianDurationMs: null }),
    clinicId: 'c1',
    clinicName: 'عيادة التغذية العلاجية والوقائية',
  },
];

export const FIXTURE_MODEL_USAGE: KeyedUsage[] = [
  { ...totals({ runs: 10, costMicroUsd: 28_643, unpricedRuns: 0 }), key: 'gpt-4o-mini-2024-07-18' },
  { ...totals({ runs: 7, costMicroUsd: 0, unpricedRuns: 7 }), key: 'gpt-5.6-luna' },
];

export const FIXTURE_SCOPE_USAGE: KeyedUsage[] = [
  { ...totals({ runs: 14 }), key: 'week' },
  { ...totals({ runs: 3, costMicroUsd: 0, unpricedRuns: 3 }), key: 'review' },
];

export const FIXTURE_FAILURES: GenerationFailure[] = [
  {
    clinicId: 'c1',
    clinicName: 'عيادة التغذية العلاجية والوقائية',
    scope: 'week',
    model: 'gpt-4o-mini-2024-07-18',
    error: 'OpenAI stopped before finishing the plan (finish_reason: length).',
    createdAt: at(1),
  },
];
