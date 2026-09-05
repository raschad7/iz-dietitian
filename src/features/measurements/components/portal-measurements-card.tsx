import { getTranslations } from 'next-intl/server';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMediumDate } from '@/features/booking/format';
import { type Locale } from '@/i18n/routing';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

import { type PortalMeasurements } from '../portal';

/**
 * The client's own view of their measurements.
 *
 * ## It leads with a sentence, not a chart
 *
 * A dietitian reads a table; a client reads one line and wants to know whether
 * this is working. So the headline is the plain-language answer — and the answer
 * a body composition machine makes possible is *what kind* of weight moved, not
 * how much. "You lost more fat than total weight, so the weight you kept is
 * muscle" is the sentence a scale can never produce, and it is the reason the
 * clinic bought the machine.
 *
 * ## What is not here
 *
 * Visceral fat, metabolic age, BMI, the machine's scores, the original PDF.
 * Those are not filtered out in this component — `getPortalMeasurements` never
 * selects them, so they cannot reach this render at all. See its note for why
 * each one is withheld.
 *
 * The card is only ever mounted when the dietitian turned sharing on. When it is
 * off the card is **absent**, not blanked: §9.8, because a visible panel reading
 * "hidden" tells a client there is something being kept from them, which is
 * worse than not raising the subject.
 */
export async function PortalMeasurementsCard({
  data,
  locale,
}: {
  data: PortalMeasurements;
  locale: Locale;
}) {
  const t = await getTranslations('measurements.portalCard');

  const kg = (value: number) =>
    formatNumber(locale, Math.abs(value), {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });

  const since = data.sinceStart;

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <CardTitle>{t('title')}</CardTitle>
        <p className="text-caption text-muted-foreground">
          {t('latest', { date: formatMediumDate(locale, data.latestOn) })}
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/*
          The headline figure. Weight change since the start when there is one,
          and the plain weight on a client's very first measurement — a big "0.0"
          would be a strange thing to show someone who has just begun.
        */}
        <div className="rounded-lg bg-secondary px-4 py-5 text-center">
          <p className="text-caption text-muted-foreground">
            {since ? t('sinceStart') : t('weight')}
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-primary">
            <bdi>
              {since && since.weightKg !== null
                ? `${since.weightKg < 0 ? '−' : '+'}${kg(since.weightKg)}`
                : kg(data.weightKg)}{' '}
              <span className="text-body font-normal text-muted-foreground">kg</span>
            </bdi>
          </p>
        </div>

        {since ? (
          <>
            {/*
              Fat and muscle side by side, which is the whole point of the card:
              a client who lost 3 kg wants to know what left. Either box is
              absent when that visit did not measure it — never drawn as zero,
              the same rule the column and the chart follow.
            */}
            <div className="grid grid-cols-2 gap-3">
              <Split
                label={since.fatMassKg !== null && since.fatMassKg <= 0 ? t('fatLost') : t('fatGained')}
                value={since.fatMassKg}
                good={since.fatMassKg !== null && since.fatMassKg < 0}
                format={kg}
              />
              <Split
                label={
                  since.muscleMassKg !== null && since.muscleMassKg >= 0
                    ? t('muscleGained')
                    : t('muscleLost')
                }
                value={since.muscleMassKg}
                good={since.muscleMassKg !== null && since.muscleMassKg > 0}
                format={kg}
              />
            </div>

            <p className="text-body leading-relaxed">
              {t(`story.${since.narrative}`, {
                weight: since.weightKg === null ? '—' : kg(since.weightKg),
              })}
            </p>
          </>
        ) : (
          <p className="text-body text-muted-foreground">{t('onlyOne')}</p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * One half of the fat/muscle pair.
 *
 * Absent rather than zero when the figure was never measured — a client whose
 * first visit was a plain weigh-in has no fat mass to compare against, and
 * showing "0.0 kg lost" would be the app asserting something nobody measured.
 */
function Split({
  label,
  value,
  good,
  format,
}: {
  label: string;
  value: number | null;
  good: boolean;
  format: (value: number) => string;
}) {
  if (value === null) return null;

  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-caption text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-0.5 text-lg font-semibold tabular-nums',
          good ? 'text-status-on-track-fg' : 'text-foreground',
        )}
      >
        <bdi>
          {value < 0 ? '−' : '+'}
          {format(value)} kg
        </bdi>
      </p>
    </div>
  );
}
