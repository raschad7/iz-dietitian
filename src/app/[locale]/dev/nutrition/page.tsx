import { notFound } from 'next/navigation';

import { ClientNutrition } from '@/features/clients/components/client-nutrition';
import { resolveLocale } from '@/i18n/params';
import { isMember } from '@/lib/enum';
import {
  BMR_SOURCES,
  DEFAULT_NUTRITION_RULES,
  PROTEIN_BASES,
} from '@/features/weekly-plans/nutrition-rules';

import { EMPTY_BODY_METRICS } from '@/features/measurements/compare';

import { FIXTURE_INTAKE, FIXTURE_METRICS, FIXTURE_UNSCANNED } from './fixture';
import { IntakeHarness } from './intake-harness';

type DevNutritionPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    basis?: string;
    rate?: string;
    bmr?: string;
    scan?: string;
    override?: string;
    weighed?: string;
  }>;
};

/**
 * A dev-only harness for the Nutrition tab.
 *
 * The same reasoning `/dev/measurements` writes down: the client record lives
 * behind the staff session guard and browser automation may not enter a
 * password, so the one screen showing a calorie target was the one screen
 * nobody could look at while the rules behind it were being changed.
 *
 * The query string is the point, because this card's figures are now a
 * *function of the clinic's settings* and a fixture can only be one clinic:
 *
 * - `?rate=` and `?basis=` — the protein rule. The same client reads 78 g, 59 g
 *   or 55 g at 1 g/kg depending on the basis, and the line under the grid has
 *   to name the one actually used.
 * - `?bmr=device|formula` — which basal figure the day is built on. The notice
 *   above the grid names the winner, so both values need driving.
 * - `?scan=none` — a client the analyser has never seen. The fallback case:
 *   `device` must quietly become the formula, `lean` must quietly become the
 *   adjusted weight, and neither may claim otherwise.
 * - `?override=1` — a dietitian-set protein target. The rule line is absent
 *   then, because there is no rule to explain.
 * - `?weighed=no` — a client nobody has weighed at all. The state the intake
 *   dialog cannot fix from inside itself now that the weight box is gone, so
 *   the readout has to name it and the body block has to say where to go.
 *
 * Dev-only: 404 in production. It ships no data access and no session guard,
 * and must never acquire either — the same contract as every other `/dev`
 * route.
 */
export default async function DevNutritionPage({ params, searchParams }: DevNutritionPageProps) {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  const locale = await resolveLocale(params);
  const query = await searchParams;

  const rate = Number(query.rate);

  const intake =
    query.override === '1' ? { ...FIXTURE_INTAKE, proteinTargetGrams: 120 } : FIXTURE_INTAKE;

  const rules = {
    proteinPerKg:
      Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_NUTRITION_RULES.proteinPerKg,
    proteinBasis: isMember(PROTEIN_BASES, query.basis)
      ? query.basis
      : DEFAULT_NUTRITION_RULES.proteinBasis,
    /* The clinic's per-case rates — the athlete and the two renal rows. */
    proteinRates: DEFAULT_NUTRITION_RULES.proteinRates,
    bmrSource: isMember(BMR_SOURCES, query.bmr) ? query.bmr : DEFAULT_NUTRITION_RULES.bmrSource,
  };

  /*
    `?weighed=no` is a client nobody has stood on a scale — the state the intake
    dialog can no longer fix from inside itself, and therefore the one worth
    being able to look at. The tab reports the missing weight in words and the
    body block says where to record one.
  */
  const metrics =
    query.weighed === 'no'
      ? EMPTY_BODY_METRICS
      : query.scan === 'none'
        ? FIXTURE_UNSCANNED
        : FIXTURE_METRICS;

  return (
    <main className="mx-auto w-full max-w-4xl p-4 sm:p-6">
      <IntakeHarness intake={intake} locale={locale} rules={rules} metrics={metrics} />
      <ClientNutrition locale={locale} intake={intake} rules={rules} metrics={metrics} />
    </main>
  );
}
