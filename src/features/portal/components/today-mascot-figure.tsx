'use client';

import { useMemo } from 'react';

import { EnergyMascotMark } from '@/features/portal/mascot/energy-mascot-mark';
import { useRisingFraction } from '@/features/portal/rising-fraction';
import { type Locale } from '@/i18n/routing';
import { toIntlLocale } from '@/lib/format';

/** The character's own size beside the figure — big enough to lead, not so big it crowds the number next to it. */
const MASCOT_SIZE = 96;

/**
 * The progress tab's own "today" figure — the reactive character, with the
 * heading, the exact percentage and the level's own sentence stacked in a
 * text column beside it, replacing `TodayRing` on this one card.
 *
 * **The same filling character the home screen draws, not a discrete tier
 * portrait.** This used to draw `MascotFace`, which only ever shows one of
 * six fixed drawings picked by *week* tier; the card sits on the progress
 * tab yet showed a different character than the "today" fill the client
 * already knows from the home screen. `EnergyMascotMark` is that exact mark
 * — the leaf silhouette filling with a wave as today's own fraction rises —
 * so the two screens now read as one character, not two.
 *
 * `TodayRing` stays exactly as it is everywhere else it is used (the home
 * screen's own commitment card) — this is a second, deliberately different
 * reading for the one card that asked for it, not a redesign of the shared
 * ring component. Same figure underneath, same count-up (`useRisingFraction`,
 * `countOnMount`), same `Intl` percent-sign split so the `%` can sit smaller
 * than the digits before it — only the picture beside the number changed.
 *
 * **Text and hooks live together on purpose.** The percentage needs
 * `useRisingFraction`'s count-up, which only runs on the client — so the
 * heading and the level sentence came in as props rather than staying back in
 * `TodayAdherenceCard` and leaving that component to reassemble a client
 * boundary around three sibling pieces it does not otherwise need. The same
 * `shown` value feeds both the percentage text below and `EnergyMascotMark`'s
 * own wave, so the number and the fill can never read as two different
 * moments of today.
 */
export function TodayMascotFigure({
  fraction,
  locale,
  countOnMount = false,
  heading,
  levelText,
}: {
  fraction: number | null;
  locale: Locale;
  /** See `TodayRing`'s own doc — passed straight through. */
  countOnMount?: boolean;
  /** `t('heading')` — resolved by the card, since this is the only text this component does not otherwise own. */
  heading: string;
  /** `t('level.*')`/`t('prompt')` — the one sentence that still reads the level rather than the number. */
  levelText: string;
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
    /*
      At 320px the card's content box is about 256px, so the character and
      the gap take most of it and leave too little for the text column
      beside it to read as more than a couple of clipped words. Stacking
      below 400px gives both the full width in turn, centred so the
      character stays the anchor; from 400px up, where the column is wide
      enough to read, the row is side by side.

      The text leads (first in DOM, so the inline-start/right edge in RTL),
      with the character following it at the inline-end.

      `gap-8`, up from `gap-4`: the two used to read as touching at 320px —
      the character's own bite notch sat close enough to the level sentence
      beside it that the two read as one shape. Doubling the gap gives the
      character its own clear margin off the text column.

      `pe-6`: the card's own `overflow-hidden` (`Card`'s default variant) was
      clipping the "Zzz" cascade at 100% — those letters sit outside the
      mark's own box (`end-[-20%]` and further, see `EnergyMascotMark`), and
      the character sits close enough to the card's inline-end edge here that
      `CardContent`'s ordinary padding was not enough clearance. Padding this
      row's own end side reserves the room the cascade needs without touching
      `CardContent`'s padding everywhere else it is used.
    */
    <div className="flex items-center gap-8 pe-6 max-[25rem]:flex-col max-[25rem]:pe-0 max-[25rem]:text-center">
      <div className="min-w-0 flex-1 space-y-1">
        <h2 className="font-heading text-lg leading-snug font-medium">{heading}</h2>

        {/* `pt-3`: the figure is the card's own headline number, not a
            continuation of the label above it, so it gets room of its own
            rather than sitting flush under the heading's own line. */}
        <p className="pt-3 font-heading text-4xl leading-none font-bold tabular-nums text-primary">
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
        </p>

        <p className="text-sm leading-relaxed text-muted-foreground">{levelText}</p>
      </div>

      <EnergyMascotMark fraction={fraction} shown={shown} size={MASCOT_SIZE} />
    </div>
  );
}
