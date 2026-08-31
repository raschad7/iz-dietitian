'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Caret } from '@/components/ui/caret';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { TooltipHint } from '@/components/ui/tooltip-hint';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

import { CALENDAR_VIEWS, type CalendarView } from '../schema';
import { DatePickerButton } from './date-picker-button';

/**
 * View switch, date navigation and search.
 *
 * ## Layout
 *
 * Three zones on a `1fr auto 1fr` grid: **the view switch** at the
 * inline-start, the date navigator in the middle, search at the inline-end. The
 * two `1fr` tracks are equal, which is what puts the navigator on the *page's*
 * centre line rather than merely between its neighbours — a group centred by
 * `justify-between` drifts with whatever is beside it, and this row's two sides
 * are nowhere near the same width.
 *
 * The view switch sat at the inline-end beside the search until the search
 * started standing down below `lg`, which left the far zone holding one control
 * on some widths and none on others. It owns the inline-start alone now.
 *
 * ## There is no Today button
 *
 * A `Today` button stood at the inline-start, before the switch. It was the
 * first thing in the row and the least of what the row does: two of the three
 * zones already answer "when" — the date names the span you are on and the
 * chevrons step it — and the third names how much of it you see. A separate
 * control for one particular date was a fourth idea in a row that had three.
 *
 * It also did not survive the tablet. Below `lg` the switch and the button
 * together overflow their `1fr` track and `flex-wrap` broke them onto two
 * lines, so the toolbar grew a row on the screen with the least height to
 * spare — and the thing that ended up alone on the top line was the button.
 *
 * Today is not lost with it: the date button opens the picker, which marks
 * today in the grid and carries its own control to jump there. One press became
 * two on the one navigation nobody makes twice in a session.
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
  /**
   * The pointer has landed on a view, or focus has reached it. The calendar
   * prefetches that view so the click that usually follows is served from the
   * router cache instead of a round trip. See `Segmented`'s `onOptionHover`.
   */
  onViewHover?: (view: CalendarView) => void;
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
  onViewHover,
  onPrevious,
  onNext,
  onDateChange,
  hideSearch = false,
}: CalendarToolbarProps) {
  const t = useTranslations('booking');

  return (
    /*
      `gap-6` in the tablet band, `gap-3` either side of it.

      The three zones are `1fr auto 1fr`, and the middle track is only as wide
      as the date it holds — which for a week is a *long* label ("August 10, 2026
      – August 16, 2026"). On a desktop the two `1fr` tracks have slack left over
      and the switch sits well clear of the first chevron; at 768–1023px they do
      not, so the switch ended up hard against the navigator and the two read as
      one run of controls rather than as "how am I looking at this" and "when".
      Doubling the gutter there is what separates them again.

      Below `md` this costs nothing and cannot: the grid is a single column and
      the only zone left in it is the navigator, so there is no gap to draw.
    */
    <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1fr] md:gap-6 lg:gap-3">
      {/*
        `hidden md:flex` — below `md` the only thing in this zone is a switch
        that is itself hidden, and an empty grid item is not nothing: the grid
        drops to a single column there, so it would be a row of its own with a
        `gap-3` above it. The same reasoning as the search zone at the other
        end of the row.

        The wrapper stays rather than the switch becoming the grid item
        directly: a grid item is blockified, so `inline-flex` would compute to
        `flex` and the control would stretch across the whole `1fr` track
        instead of sitting at its own width.
      */}
      <div className="hidden items-center md:flex">
        {/*
          Which views a screen offers is a property of the screen.

          - **Phone (below `md`)** — day only, and *no switch at all*. A week is
            seven columns and a month is seven by six; neither is legible on a
            375px screen, and every way of making them fit is a form of
            "shrink until unreadable". With one view left there is no choice to
            present, and a segmented control with a single segment is a label
            pretending to be a control — it would take width from the date
            navigator, which on this screen is the whole of the toolbar.
          - **Tablet and desktop (`md` and up)** — all three, and both of the
            wide views now fit a tablet outright rather than being cropped by
            one. The week drops its per-column floor below `lg` so seven columns
            divide the width they are given (`WEEK_DAY_MIN_WIDTH`), and the
            month draws a dot per appointment instead of a name-and-time chip,
            which is what let its own floor come down to `28rem`. Neither needs
            a sideways swipe to reach the end of the row. The search field
            standing down in this band is what leaves the room for the third
            segment.

          Gated in CSS rather than by rebuilding the options from a `matchMedia`
          reading: this toolbar is server-rendered, and a width read on the
          client would either flash the wrong segments on first paint or make the
          whole toolbar width-aware state.

          ⚠ A hidden switch is still a set of reachable routes —
          `/app/calendar/week` can be typed, bookmarked, shared, or arrived at by
          turning a phone to landscape — so hiding the control is only half the
          job. `CalendarViewGuard` is the other half, and it now has one rule
          left: a phone belongs on the day.
        */}
        {/*
          Day / week / month, as the `contained` shape: a white card lifted out
          of a sunken grey well, not the primary olive `Segmented` draws by
          default. It is the same control the sign-in role switch and the
          settings tabs use, so the raised card **slides** between the three
          views rather than blinking on in place — which is navigation reading as
          one continuous move rather than three separate lights.

          Which view you are in is load-bearing state, but it is *navigation*,
          not the action of the page; a quiet raised card marks the current
          segment without competing with the buttons beside it or with the grid
          underneath — which is why it is `contained` and not the olive `default`.

          The unselected segments do not answer the pointer with a fill: the
          track *is* a fill, so a second one on hover would read as a half that
          has half-selected itself. Only the label darkens, which leaves the
          sliding card as the one thing that ever marks the view. The focus ring
          is untouched, so a keyboard still says where it is.
        */}
        <Segmented
          label={t('nav.view')}
          size="sm"
          shape="contained"
          value={view}
          onChange={onViewChange}
          onOptionHover={onViewHover}
          /*
            ⚠ `max-md:hidden`, **not** `hidden md:inline-flex`. Both hide the
            switch below `md`, but the second one also *sets the display* at
            `md` and up — and `contained` lays its segments out as an
            `inline-grid` of equal columns, which is what the travelling thumb's
            equal-thirds arithmetic depends on. Forcing it back to flex made the
            segments size to their own labels ("يوم" is far shorter than "أسبوع")
            while the thumb kept landing on thirds, so the raised card sat across
            the wrong segment and hung off the end of the track.

            This variant only ever writes `display: none`, below `md`, and leaves
            the component to own its layout everywhere else.
          */
          className="max-md:hidden"
          options={CALENDAR_VIEWS.map((candidate) => ({
            value: candidate,
            label: t(`nav.${candidate}`),
          }))}
        />
      </div>

      {/*
        The gap is measured in the label's own `em`, not in pixels, which is why
        this row sets `text-body-sm` — the size the date button draws at — so the
        `em` has something to resolve against. The two chevrons frame the date,
        and what "close enough to be one control" means is a property of the type
        between them: at a fixed 8px the frame drifted away from a short label
        like `August 15, 2026` and crowded a long one.

        It is a hairline — 0.125em, under 2px — because it is only one of three
        things standing between the arrow and the text, and the smallest. The
        other two are padding: 10px inside each 40px arrow button, and the date
        button's own inline padding. Those buttons are 40px because every control
        in this row is, and because that is the size a pointer and a thumb both
        expect; the glyph cannot be pushed nearer without cutting into the hit
        area that makes them pressable.

        `min-w-0` so the date button inside can honour its own `truncate`. A flex
        child defaults to `min-width: auto`, which is its content — a 285px label
        on a 375px phone then pushed the toolbar wider than the viewport and put
        a horizontal scrollbar on the page.
      */}
      <div className="flex min-w-0 items-center justify-center gap-[0.125em] text-body-sm">
        {/*
          `Caret` rather than the icon set's disclosure chevron: this is a
          control whose whole content is the arrow, and the set's chevron is
          drawn at the weight of a mark *on* something else. It mirrors itself
          in RTL, so in Arabic the arrow on the right is "previous" — which is
          also what its tooltip says when you point at it. The tooltip repeats
          the `aria-label` rather than replacing it: the hint is what the
          pointer gets, the label is what names the control.
        */}
        <TooltipHint label={t('nav.previous')}>
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
            /*
              32px wide, 40 tall — `icon-sm` draws a 40px square.

              The height is what keeps the row level with the Today button, the
              field and the view switch; the width was the last thing holding the
              chevron away from the date, 10px of empty button on the side facing
              it. Narrowing only the axis that does no work brings the frame in
              without taking the control below a comfortable target: 32×40 is
              well past the 24px minimum, and the full height stays pressable.
            */
            className="w-8 rounded-lg"
            aria-label={t('nav.previous')}
            onClick={onPrevious}
          >
            {/*
              20px, not the caret's default 16. These two are the whole content
              of their buttons and they sit beside a date set in the same ink —
              at 16px in a 32px box the arrow read as a mark someone had left in
              an empty square rather than as the control. `size-5` fills the
              button the way a glyph should and gives the pointer something to
              aim at. The panel's own step arrows follow, one size down for the
              smaller button they sit in.
            */}
            <Caret direction="start" className="size-5" />
          </Button>
        </TooltipHint>

        <DatePickerButton
          locale={locale}
          value={anchorDate}
          range={range}
          today={today}
          label={rangeLabel}
          onSelect={onDateChange}
        />

        <TooltipHint label={t('nav.next')}>
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
            /*
              32px wide, 40 tall — `icon-sm` draws a 40px square.

              The height is what keeps the row level with the Today button, the
              field and the view switch; the width was the last thing holding the
              chevron away from the date, 10px of empty button on the side facing
              it. Narrowing only the axis that does no work brings the frame in
              without taking the control below a comfortable target: 32×40 is
              well past the 24px minimum, and the full height stays pressable.
            */
            className="w-8 rounded-lg"
            aria-label={t('nav.next')}
            onClick={onNext}
          >
            <Caret direction="end" className="size-5" />
          </Button>
        </TooltipHint>
      </div>

      {/*
        `hidden lg:flex` — the search zone is a desktop zone, and below `lg`
        there is nothing in it to lay out.

        Hiding the *zone* rather than the field is what keeps the phone's
        toolbar to two rows. Below `md` this grid drops to a single column, so
        an empty flex box is not nothing: it is a third row and a `gap-3` above
        it, under a date navigator, on the screen with the least height in the
        app. From `md` up the row is `1fr auto 1fr` and the third track is
        declared by the template rather than by this child, so the date stays on
        the page's centre line whether the zone is drawn or not.
      */}
      <div className="hidden flex-wrap items-center justify-end gap-2 lg:flex">
        {!hideSearch && (
          /*
            40px tall, like the view switch and the Today button beside it. It
            was 32px, which made the one field in the row sit a step below every
            control around it — the same tell the design system calls out for a
            36px input beside a 48px button, one size down.

            **Below `lg` there is no field at all** — the gating lives on the
            zone around this one now, and it used to be `md:hidden lg:block`:
            shown on a phone, gone on a tablet, back on a desktop.

            The tablet half of that has not changed and its reason has not
            either. Between 768 and 1023px the toolbar is a single
            `1fr auto 1fr` row carrying Today, the date navigator, a
            three-segment view switch and this 224px field, and the field is the
            widest thing in it.

            The phone half was the mistake. A phone gets the day view and only
            the day view, and a day is one column of a dozen blocks with every
            name already on it — there is nothing there to *find*. What the
            field cost was the whole width of the screen and a third row above
            the grid, which on the shortest viewport in the app came out of the
            hours you can actually see. So it goes, and the day gets the row
            back.

            It is a *hide*, not a removal: the search still exists on the screen
            with the room for it, and no appointment becomes unreachable without
            it — the grid shows every booking in the range either way, and the
            register is where you look someone up.
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
              lang={locale}
              unclippedText={locale === 'ar'}
              unclippedTextClassName={cn(
                'ps-10 pe-4 text-body-sm',
                query ? 'text-foreground' : 'text-placeholder',
              )}
              unclippedTextDirection="rtl"
            />
          </div>
        )}
      </div>
    </div>
  );
}
