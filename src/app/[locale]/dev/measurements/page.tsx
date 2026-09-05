import { notFound } from 'next/navigation';

import { MeasurementsPanel } from '@/features/measurements/components/measurements-panel';
import { resolveLocale } from '@/i18n/params';
import { isMember } from '@/lib/enum';
import { type IsoDate } from '@/lib/iso-date';

import {
  FIXTURE_CLIENT_ID,
  FIXTURE_INTAKE_WEIGH_IN,
  FIXTURE_MEASUREMENTS,
  FIXTURE_REPORT_IDS,
} from './fixture';

type DevMeasurementsPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ range?: string; goal?: string; extra?: string }>;
};

const RANGES = ['last', 'start'] as const;

/**
 * A dev-only harness for the Measurements tab.
 *
 * The same reasoning `/dev/board` writes down: the client record lives behind
 * the staff session guard and browser automation may not enter a password, so
 * the one screen with four tiles, a five-metric chart, a six-row history and a
 * fourteen-field dialog was also the one screen nobody could look at while it
 * was being changed. This renders the real `MeasurementsPanel` over a fixture
 * history, so the badges, the range switch, the trend picker and the record
 * dialog can be driven and screenshotted at any width in either language.
 *
 * `?goal=` is the part worth having. A change badge takes its colour from the
 * *verdict*, and the verdict comes from the client's goal — so the same six
 * rows must read green for a client losing weight and neutral for one
 * maintaining. Flipping the goal in the URL is how that is checked without
 * six fixtures.
 *
 * `?extra=weighin` adds the hand-typed row the intake box files — today, at
 * midnight, carrying only a weight. See the fixture for why it is opt-in.
 *
 * Dev-only: 404 in production. It ships no data access and no session guard,
 * and must never acquire either — the same contract as `/dev/board`,
 * `/dev/meals`, `/dev/dishes` and `/dev/ui`.
 */
export default async function DevMeasurementsPage({
  params,
  searchParams,
}: DevMeasurementsPageProps) {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  const locale = await resolveLocale(params);
  const query = await searchParams;
  const range = isMember(RANGES, query.range) ? query.range : 'last';

  // Newest first, the order `listMeasurements` returns and the panel expects.
  const measurements =
    query.extra === 'weighin'
      ? [FIXTURE_INTAKE_WEIGH_IN, ...FIXTURE_MEASUREMENTS]
      : FIXTURE_MEASUREMENTS;

  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <MeasurementsPanel
        clientId={FIXTURE_CLIENT_ID}
        locale={locale}
        today={'2026-09-04' as IsoDate}
        measurements={measurements}
        subject={{ goal: query.goal ?? 'weight_loss', heightCm: 156 }}
        currentWeightKg={72.2}
        range={range}
        reportIds={FIXTURE_REPORT_IDS}
        sharing
      />
    </main>
  );
}
