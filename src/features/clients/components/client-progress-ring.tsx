'use client';

import { useMemo, type ReactNode } from 'react';

import { useRisingFraction } from '@/features/portal/rising-fraction';
import { type Locale } from '@/i18n/routing';
import { toIntlLocale } from '@/lib/format';

/**
 * The Progress tab's weekly figure — a solid arc drawn to the week's average
 * adherence, with the percentage counting up inside it.
 *
 * **Draws itself in exactly the way the portal's own ring does.** This used
 * to be a server-rendered SVG that appeared already finished, with only a CSS
 * `stroke-dashoffset` transition drawing the arc once `RevealOnView` scrolled
 * it into sight — the figure itself printed instantly, so the ring and the
 * number disagreed about whether anything was still moving. `useRisingFraction`
 * (`features/portal/rising-fraction.ts`) is the fix already built for that
 * exact seam on the client-facing `TodayRing`: one number ramps from zero on
 * `easeSweep`, `strokeDashoffset` is computed from that same number every
 * frame, and `countOnMount` is what makes it start from zero on arrival
 * rather than only when the figure later changes. Reusing it here — instead
 * of a second, hand-rolled tween — is what keeps the ring and the digits
 * moving together, the way they do on the portal.
 *
 * A client component now, where it was not before: text content is not an
 * animatable CSS property, so a count-up has no way to run without
 * JavaScript. `caption` still arrives as a `ReactNode` from the server parent
 * — only the ring and the figure need the client boundary.
 */

const RADIUS = 46;
const STROKE = 9;
const LENGTH = 2 * Math.PI * RADIUS;

export function ClientProgressRing({
  fraction,
  locale,
  caption,
}: {
  /** 0–1, or null when the week has nothing recorded. */
  fraction: number | null;
  locale: Locale;
  caption?: ReactNode;
}) {
  const shown = useRisingFraction(fraction, { countOnMount: true });
  const drawn = shown !== null && shown > 0;

  const formatter = useMemo(
    () =>
      new Intl.NumberFormat(toIntlLocale(locale), {
        style: 'percent',
        maximumFractionDigits: 1,
        numberingSystem: 'latn',
      }),
    [locale],
  );

  const value = shown === null ? 0 : Math.min(Math.max(shown, 0), 1);
  const offset = LENGTH * (1 - value);

  return (
    <span className="relative grid size-36 shrink-0 place-items-center sm:size-40">
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={RADIUS} strokeWidth={STROKE} className="fill-none stroke-border" />

        {drawn ? (
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={LENGTH}
            strokeDashoffset={offset}
            className="fill-none stroke-viz-brand"
          />
        ) : null}
      </svg>

      <span className="flex flex-col items-center gap-1">
        <span className="font-heading text-display-sm font-semibold tabular-nums text-foreground">
          {shown === null ? '—' : formatter.format(shown)}
        </span>
        {caption ? <span className="text-caption text-muted-foreground">{caption}</span> : null}
      </span>
    </span>
  );
}
