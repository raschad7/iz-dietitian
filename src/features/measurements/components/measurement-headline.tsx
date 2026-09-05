'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Segmented } from '@/components/ui/segmented';
import { cn } from '@/lib/utils';

export type MeasurementRange = 'last' | 'start';

/**
 * The headline card, and the switch between "since last visit" and "since the
 * start".
 *
 * ## Both answers are already on the page
 *
 * ⚠ **This used to round-trip.** The choice lived in `?range=` and the switch
 * called `router.replace`, so every press was a server render, a network wait
 * and a visible reload of a card the reader was looking at — to swap eight
 * numbers the server had already computed. `summariseProgress` returns
 * `sinceLast` *and* `sinceStart` from one pass over the same rows: there was
 * never a second query to make, only a second render.
 *
 * So the panel renders both, on the server, and this owns which one is shown.
 * Switching is instant and costs nothing, and no measurement, formatter or
 * translator crosses into the browser — only the two blocks of finished markup.
 * It is the arrangement `ClientProfileTabs` uses for the record's own views,
 * for the same reason.
 *
 * ## The URL still says which one
 *
 * `history.replaceState`, not a navigation: the address stays shareable and a
 * refresh reopens on the same comparison, without Next re-fetching anything.
 * `replaceState` rather than `pushState` because looking at the same visit from
 * a different baseline is not a place, and stacking it onto history would turn
 * Back into a walk through comparisons rather than the way off this record.
 */
export function MeasurementHeadline({
  defaultRange,
  header,
  panels,
  labels,
  showSwitch,
}: {
  defaultRange: MeasurementRange;
  /** The card's title and its "last measured" subline, built on the server. */
  header: ReactNode;
  /** Both comparisons, rendered. Only the selected one is in the tree. */
  panels: Record<MeasurementRange, ReactNode>;
  labels: { last: string; start: string; group: string };
  /** False on a client's very first measurement — there is nothing to compare. */
  showSwitch: boolean;
}) {
  const [range, setRange] = useState<MeasurementRange>(defaultRange);
  const [shown, setShown] = useState<MeasurementRange>(defaultRange);
  const swapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (swapTimer.current) clearTimeout(swapTimer.current);
    },
    [],
  );

  const goTo = useCallback((next: MeasurementRange) => {
    setRange((current) => {
      if (next === current) return current;

      const url = new URL(window.location.href);
      url.searchParams.set('range', next);
      window.history.replaceState(null, '', url);

      const instant = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (swapTimer.current) clearTimeout(swapTimer.current);
      /*
        Mirrors `--duration-reverse`, the speed the fade below runs *out* at —
        the CSS takes the block down and this decides when it is safe to
        replace, so the two must agree or the incoming figures appear over the
        outgoing ones. The same constant and the same reasoning as
        `ClientProfileTabs`.
      */
      swapTimer.current = setTimeout(() => setShown(next), instant ? 0 : 140);

      return next;
    });
  }, []);

  const settled = range === shown;

  return (
    <Card>
      {/*
        `items-center`, not `items-baseline`: the switch is a 52px control and a
        baseline row would hang it off the title's text baseline. The title and
        its subline keep their own baseline inside the group they share.
      */}
      <CardHeader className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {header}

        {showSwitch ? (
          /*
            `shape="pill"` — the control the record's own tab bar wears, one
            screen up. Both answer the same question ("which view of this am I
            in?") and they were answering it in two visual languages: the tabs
            slide a raised white thumb through a grey well, and this filled the
            selected half with solid brand green. A segmented control that is not
            the page's primary action should not be the loudest thing on the
            card.

            `pill` is `w-full` by construction — its halves are equal because the
            thumb behind them is sized `100% / count` — so the width belongs to
            this wrapper. Full-bleed on a phone, where it sits under the title on
            its own row; capped from `sm` up, where it sits at the end of the
            header.
          */
          <div className="w-full sm:w-72">
            <Segmented
              role="radiogroup"
              shape="pill"
              label={labels.group}
              value={range}
              onChange={goTo}
              options={[
                { value: 'last', label: <span className="truncate">{labels.last}</span> },
                { value: 'start', label: <span className="truncate">{labels.start}</span> },
              ]}
            />
          </div>
        ) : null}
      </CardHeader>

      <CardContent>
        {/*
          Out fast, in a shade slower, so a comparison always arrives the same
          way. The 4px of travel is vertical on purpose: a horizontal slide would
          have to pick a direction, and the reading direction inverts between
          Arabic and English.
        */}
        <div
          className={cn(
            'transition-[opacity,translate] ease-(--ease-sweep)',
            'motion-reduce:transition-none motion-reduce:translate-y-0',
            settled
              ? 'translate-y-0 opacity-100 duration-(--duration-label)'
              : 'translate-y-1 opacity-0 duration-(--duration-reverse)',
          )}
        >
          {panels[shown]}
        </div>
      </CardContent>
    </Card>
  );
}
