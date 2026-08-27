'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { getEnergyMessageKey } from '@/features/portal/mascot/energy-progress';
import { EnergyMascotMark } from '@/features/portal/mascot/energy-mascot-mark';
import { useRisingFraction } from '@/features/portal/rising-fraction';
import { type Locale } from '@/i18n/routing';
import { toIntlLocale } from '@/lib/format';

/**
 * The home screen's daily commitment card, replacing `TodayRing`'s dashed
 * disc with the brand mark itself as the progress indicator — every meal
 * ticked rises a soft green "energy" fill inside the same leaf silhouette,
 * and the mark's two eyes read tired at empty and proud at full.
 *
 * **The mark itself lives in `EnergyMascotMark`.** This component owns the
 * one `useRisingFraction` both the mark and the percentage below it read
 * from, and everything about the text under the character — the percentage,
 * the meals count, the message. `TodayMascotFigure` (the progress tab's own
 * card) draws the exact same mark beside its own heading/level text, which
 * is what the shared component is for.
 *
 * **A different scale from the reactive mascot's.** `ReactiveMascot` reads a
 * *week's* average adherence into one of six drawings (`states.ts`); this
 * card reads *today's* meal fraction alone into `energy-progress.ts`'s five
 * bands. The two never share a component because they are never allowed to
 * disagree about the same day for different reasons — this card only ever
 * asks "how much of today is done".
 */

const MASCOT_SIZE = 128;

export function TodayEnergyMascot({
  fraction,
  completed,
  total,
  locale,
  countOnMount = false,
}: {
  fraction: number | null;
  completed: number;
  total: number;
  locale: Locale;
  countOnMount?: boolean;
}) {
  const t = useTranslations('portal.progress.today');

  const shown = useRisingFraction(fraction, { countOnMount });

  const formatter = useMemo(
    () =>
      new Intl.NumberFormat(toIntlLocale(locale), {
        style: 'percent',
        maximumFractionDigits: 0,
        numberingSystem: 'latn',
      }),
    [locale],
  );

  const percentParts = shown === null ? null : formatter.formatToParts(shown);
  // Read off `shown`, the same animated value the mark's own fill and eyes
  // are drawn from — so the words never call the day "complete" a beat
  // before the energy has actually finished rising to the top.
  const messageKey = getEnergyMessageKey(shown);

  return (
    <span className="flex flex-col items-center gap-3">
      <EnergyMascotMark fraction={fraction} shown={shown} size={MASCOT_SIZE} />

      <span className="flex flex-col items-center gap-1 text-center">
        <span className="font-heading text-4xl leading-none font-bold tabular-nums text-primary">
          {percentParts ? (
            percentParts.map((part, index) =>
              part.type === 'percentSign' ? (
                <span key={index} className="text-xl">
                  {part.value}
                </span>
              ) : (
                <span key={index}>{part.value}</span>
              ),
            )
          ) : (
            '—'
          )}
        </span>

        {total > 0 ? (
          <span className="text-caption leading-none text-muted-foreground">{t('meals', { completed, total })}</span>
        ) : null}

        <p className="pt-2 font-heading text-lg leading-snug font-bold text-[#6D6C65]">{t(`energy.${messageKey}`)}</p>
      </span>
    </span>
  );
}
