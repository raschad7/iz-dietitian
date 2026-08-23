'use client';

import { useMemo } from 'react';

import { MascotFace } from '@/features/portal/mascot/mascot-face';
import { getMascotState } from '@/features/portal/mascot/states';
import { useRisingFraction } from '@/features/portal/rising-fraction';
import { type Locale } from '@/i18n/routing';
import { toIntlLocale } from '@/lib/format';

/** The character's own size beside the figure — big enough to lead, not so big it crowds the number next to it. */
const MASCOT_SIZE = 96;

/**
 * The progress tab's own "today" figure — the reactive character, with the
 * exact percentage printed beside it, replacing `TodayRing` on this one card.
 *
 * `TodayRing` stays exactly as it is everywhere else it is used (the home
 * screen's own commitment card) — this is a second, deliberately different
 * reading for the one card that asked for it, not a redesign of the shared
 * ring component. Same figure underneath, same count-up (`useRisingFraction`,
 * `countOnMount`), same `Intl` percent-sign split so the `%` can sit smaller
 * than the digits before it — only the picture beside the number changed.
 *
 * **The character's mood, not a one-shot celebration.** `emotion="resting"`
 * throughout: the tier baseline in `mascot-face.tsx` already leans the eyes
 * happier as `tier` climbs (see `tierBaseline` in `eye-choreography.ts`), and
 * that quiet difference is the whole point here — a fully-kept day already
 * gets its own flourish from `TodayFlameCell`'s claim card the moment it
 * happens, and replaying that same celebration on every read of this card
 * would cheapen both.
 */
export function TodayMascotFigure({
  fraction,
  locale,
  countOnMount = false,
}: {
  fraction: number | null;
  locale: Locale;
  /** See `TodayRing`'s own doc — passed straight through. */
  countOnMount?: boolean;
}) {
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

  return (
    <span className="flex shrink-0 items-center gap-4">
      <MascotFace emotion="resting" tier={getMascotState(fraction)} size={MASCOT_SIZE} />

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
    </span>
  );
}
