'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Caret } from '@/components/ui/caret';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Tooltip } from '@/components/ui/tooltip';
import { type Locale } from '@/i18n/routing';

import { CALENDAR_VIEWS, type CalendarView } from '../schema';
import { DatePickerButton } from './date-picker-button';

/**
 * View switch, date navigation and search.
 *
 * ## Layout
 *
 * Three zones on a `1fr auto 1fr` grid: Today at the inline-start, the date
 * navigator in the middle, search and the view switch at the inline-end. The
 * two `1fr` tracks are equal, which is what puts the navigator on the *page's*
 * centre line rather than merely between its neighbours — a group centred by
 * `justify-between` drifts with whatever is beside it, and this row's two sides
 * are nowhere near the same width.
 *
 * Inside that middle zone the date sits **between** the two chevrons, so
 * "back" and "forward" read as pointing away from where you are. It is a
 * button in the same box as Today, because it does the same kind of thing —
 * both move the calendar to a date — and it opens the month grid.
 *
 * The previous/next carets point along the *reading* direction: in Arabic
 * "previous" points right. `start`/`end` are logical names and `Caret` mirrors
 * itself in RTL, so this never branches on the locale — the direction is
 * expressed once, in the prop.
 *
 * Both carry a tooltip naming the step, because two arrows either side of a
 * date are the one place in this row where the control's meaning depends on
 * which side of the label it is on — and in Arabic that is the opposite side
 * from the one a reader of English would guess.
 */

export type CalendarToolbarProps = {
  locale: Locale;
  view: CalendarView;
  /** Already formatted for the current view — "August 2026", "5 August 2026". */
  rangeLabel: string;
  /** The date the view is built around, for the picker's grid. */
  anchorDate: string;
  /** The span the view covers, inclusive — marked in full in the picker. */
  range: { from: string; to: string };
  /** Today, or null before the shared clock has ticked. Marked in the picker. */
  today: string | null;
  query: string;
  onQueryChange: (query: string) => void;
  onViewChange: (view: CalendarView) => void;
  onToday: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onDateChange: (date: string) => void;
  /**
   * Hides the search field. A client's own Visit History tab already shows
   * only that one person's appointments — searching within a list of one is
   * nothing to filter, so the box has no job left to do there.
   */
  hideSearch?: boolean;
};

export function CalendarToolbar({
  locale,
  view,
  rangeLabel,
  anchorDate,
  range,
  today,
  query,
  onQueryChange,
  onViewChange,
  onToday,
  onPrevious,
  onNext,
  onDateChange,
  hideSearch = false,
}: CalendarToolbarProps) {
  const t = useTranslations('booking');

  return (
    <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
      {/*
        Today and the date wear the tertiary `ghost` box — the same one a
        dialog's Cancel takes. Neither is the thing you came to this screen to
        do: the grid is, and two outlined boxes above it were the loudest
        controls on a page whose whole job is the day underneath them. Boxless
        at rest, filled on hover, so they still answer the pointer.
      */}
      <div className="flex items-center">
        <Button type="button" variant="ghost" size="sm" onClick={onToday}>
          {t('nav.today')}
        </Button>
      </div>

      {/*
        `gap-2` either side of the label rather than the old `gap-1`: the two
        chevrons frame the date, and a frame that touches what it holds reads as
        one wide control instead of three.
      */}
      <div className="flex items-center justify-center gap-2">
        {/*
          `Caret` rather than the icon set's disclosure chevron: this is a
          control whose whole content is the arrow, and the set's chevron is
          drawn at the weight of a mark *on* something else. It mirrors itself
          in RTL, so in Arabic the arrow on the right is "previous" — which is
          also what its tooltip says when you point at it. The tooltip repeats
          the `aria-label` rather than replacing it; `Tooltip` is `aria-hidden`,
          so the pointer gets the hint and everything else gets the label.
        */}
        <Tooltip label={t('nav.previous')}>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            /*
              `rounded-lg` (8px), not the circle `icon-sm` draws by default.
              The round fill is right for a standalone icon button — an avatar
              menu, a bell — where the control is its own object. These two sit
              tight against a rectangular date button and mark a *step*, so a
              disc appearing under the pointer read as a third kind of shape in
              a three-item row. A soft rectangle matches the button between them
              and the segmented switch across the toolbar.
            */
            className="rounded-lg"
            aria-label={t('nav.previous')}
            onClick={onPrevious}
          >
            <Caret direction="start" />
          </Button>
        </Tooltip>

        <DatePickerButton
          locale={locale}
          value={anchorDate}
          range={range}
          today={today}
          label={rangeLabel}
          onSelect={onDateChange}
        />

        <Tooltip label={t('nav.next')}>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            /*
              `rounded-lg` (8px), not the circle `icon-sm` draws by default.
              The round fill is right for a standalone icon button — an avatar
              menu, a bell — where the control is its own object. These two sit
              tight against a rectangular date button and mark a *step*, so a
              disc appearing under the pointer read as a third kind of shape in
              a three-item row. A soft rectangle matches the button between them
              and the segmented switch across the toolbar.
            */
            className="rounded-lg"
            aria-label={t('nav.next')}
            onClick={onNext}
          >
            <Caret direction="end" />
          </Button>
        </Tooltip>
      </div>

      <div className="flex flex-wrap items-center justify-start gap-2 md:justify-end">
        {!hideSearch && (
          /*
            40px tall, like the view switch and the Today button beside it. It
            was 32px, which made the one field in the row sit a step below every
            control around it — the same tell the design system calls out for a
            36px input beside a 48px button, one size down.
          */
          <div className="relative w-56">
            <Icon
              name="search"
              className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={t('search.placeholder')}
              aria-label={t('search.placeholder')}
              className="h-10 ps-10 pe-4 text-body-sm"
            />
          </div>
        )}

        {/*
          Day / week / month, with the selected one in the light gray surface
          rather than in the primary olive `Segmented` draws by default.

          `bg-muted text-foreground` — the sunken neutral from globals.css,
          paired with the body text colour so the label keeps full contrast.
          Which view you are in is load-bearing state, but it is *navigation*,
          not the action of the page; a quiet gray fill marks the current
          segment without competing with the buttons beside it or with the grid
          underneath.

          Local to this call site rather than a change to `Segmented`'s default:
          the login role switch and the portal's upcoming/past filter are also
          segmented controls and keep the primary fill.
        */}
        <Segmented
          label={t('nav.view')}
          size="sm"
          value={view}
          onChange={onViewChange}
          activeClassName="bg-muted text-foreground"
          options={CALENDAR_VIEWS.map((candidate) => ({
            value: candidate,
            label: t(`nav.${candidate}`),
          }))}
        />
      </div>
    </div>
  );
}
