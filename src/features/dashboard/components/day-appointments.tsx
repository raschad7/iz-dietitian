'use client';

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Caret } from '@/components/ui/caret';
import { Icon } from '@/components/ui/icon';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '@/components/ui/table';
import { patientToneStyle } from '@/features/booking/patient-color';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * The dashboard's appointments panel — one day's table, and a stepper to walk
 * the week.
 *
 * **This component owns the whole card, but writes none of its words.** The
 * heading, the "what's next" chip and the link to the calendar arrive as
 * already-rendered nodes from `AppointmentsPanel`, which is a server component;
 * every string in the table arrives pre-formatted in `labels` and in the day
 * objects. Nothing here calls `Intl` or `useTranslations`, so stepping between
 * days costs no bundle and no round trip. Same boundary `stat-charts.tsx` draws
 * around the two plots.
 *
 * The card is a client component at all only because the stepper and the table
 * have to sit in one header row and share one piece of state. Keeping the
 * `Card` on the server and handing the client half a slot in its header was the
 * alternative, and it needs the parent to reach into the child's layout —
 * a seam that breaks the moment either side's geometry changes.
 *
 * **The whole week is already in memory.** `loadDashboard` reads Sunday to
 * Saturday in the one query it used to spend on today alone, so a day change is
 * a `useState` and nothing else. That is the reason this is client state rather
 * than a `?date=` search param: a dashboard is a page you glance at, and a full
 * server round trip to look at Thursday would make the cheapest interaction on
 * the page the slowest one.
 *
 * ## The header is three zones, and the stepper is the middle one
 *
 * Heading and status at the inline-start, the day stepper on the card's centre
 * line, the count and the way out at the inline-end — a `1fr auto 1fr` grid,
 * the same shape and the same reasoning as the calendar's own toolbar. The two
 * equal tracks are what put the stepper on the *card's* centre rather than
 * merely between its neighbours; a group centred with `justify-between` drifts
 * with whatever is beside it, and these two sides are nowhere near the same
 * width.
 *
 * It bought a row back. The stepper used to sit on its own line under the
 * heading, which spent ~40px of a panel whose whole value is how many
 * appointments it can show at once.
 *
 * The carets follow the **reading** direction, so in Arabic "previous" points
 * right. `Caret` mirrors itself from a logical `start`/`end` prop, which is why
 * nothing here branches on the locale.
 *
 * Both ends stop at the week the page loaded. There is no eighth day in memory,
 * and a caret that pages beyond the data would either lie or have to fetch —
 * the calendar is one click away and is the screen for going further.
 *
 * **Leaving today has a way back.** The day label carries a static marker while
 * you are on today and becomes a button the moment you are not, so the panel
 * cannot strand you three days out with nothing but a caret to count back on.
 *
 * ## Three things the table does that a list would not
 *
 * **It opens on what is happening now, with the row before it still on
 * screen.** Not at the top — the top of a working day is the part that is
 * already over — and not with the live row flush against the header either,
 * because "what did I just finish" is context for "what am I in". The scroll
 * lands one row early, so the panel reads previous, current, next without a
 * gesture. `useLayoutEffect` does it before paint.
 *
 * **It says where "now" falls** — with the fill on the live row and the caret on
 * the next one, not with a rule drawn between them. See `NowClock` for what that
 * rule was and why the clock reading moved to the header.
 *
 * **It admits it scrolls.** `globals.css` sets `scrollbar-width: none` on
 * everything in the app, so a bounded box has no native way to say it is
 * bounded. The two fades are that affordance, and they appear only in the
 * direction there is more, which is the same job a scrollbar thumb's position
 * does. That file's own note asks for exactly this: "surfaces that can overflow
 * should show their own affordance".
 */

/** One appointment, already formatted for the locale by the server. */
export type AppointmentRow = {
  id: string;
  /** `8:45 – 9:15 AM`. Latin digits in both locales, like the calendar. */
  time: string;
  /** The start on its own — the phone's column has room for nothing else. */
  timeShort: string;
  clientName: string;
  clientId: string;
  /**
   * The client's position in the clinic — what their colour is picked from.
   *
   * The row used to carry the hue itself, which was fine while a colour was one
   * number. It is five custom properties now, so the row carries the input and
   * `patientToneStyle` spells them at the point of use rather than the server
   * shipping a colour this type would have to keep in step with.
   */
  clientSeq: number;
  reason: string | null;
  /** Against the clock at render time. Every row on a past day is `done`. */
  status: 'done' | 'live' | 'upcoming';
  /** The first appointment on this day that has not started yet. */
  isNext: boolean;
};

export type AppointmentDay = {
  /** `YYYY-MM-DD` — the day view this table's rows link to. */
  date: string;
  /** `Tue` / `الثلاثاء`. */
  weekday: string;
  /** `11`. */
  dayNumber: string;
  /** `5 appointments`, pluralised by the server. */
  countLabel: string;
  isToday: boolean;
  rows: AppointmentRow[];
};

export type DayAppointmentsLabels = {
  previousDay: string;
  nextDay: string;
  /** Marks today, and names the button that returns to it. */
  today: string;
  time: string;
  client: string;
  reason: string;
  status: string;
  done: string;
  live: string;
  next: string;
  /** The current time, e.g. `9:05 AM`. Shown in the header while on today. */
  now: string;
  empty: string;
  emptyCta: string;
};

/**
 * The table's ceiling, at every width.
 *
 * It pairs with `flex-1` rather than replacing it: from `xl` up the table grows
 * to fill what the card's header leaves and stops here, so a short laptop gets
 * a panel that fits and a tall monitor does not get one stretched to the floor.
 *
 * **The ceiling is what makes "one finished row" true.** The scroll below lands
 * one appointment above whatever is happening now — but scrolling can only hide
 * the rows before that if the box is smaller than its contents. Left to grow, a
 * tall screen fitted the whole morning and every finished appointment stayed on
 * screen, `scrollTop` clamped to zero, and the panel opened on the part of the
 * day that is already over. Roughly five rows: one behind you, the one you are
 * in, the one next, and a little of the afternoon.
 */
const TABLE_HEIGHT = 'max-h-[336px]';

/**
 * Row height, as the padding above and below a cell.
 *
 * `TableCell` ships `py-2.5`, tuned for the dense register on `/app/clients`
 * where the job is fitting a long list on one screen. This table is the
 * opposite case — five rows, read from across a desk, several times a morning —
 * so the rows are given air. Declared once rather than per cell so a row cannot
 * end up half a step taller than the one under it.
 */
const CELL = 'py-3.5';

/** How far from an edge still counts as "at the edge", in pixels. */
const EDGE_SLACK = 4;

/**
 * The clock, beside the day it belongs to.
 *
 * ## It used to be a line across the table
 *
 * A hairline row was inserted between the last finished appointment and the
 * first one still ahead, carrying the time on an olive rule. It was three
 * problems at once. It was a `<tr>` that is not an appointment, in a table whose
 * rows are appointments — so the scroll anchoring had to filter it out by hand,
 * and a screen reader met a row with one cell spanning four columns. It painted
 * a second olive mark two rows from the olive fill on the live appointment, in a
 * panel where olive already means *now*. And when the day was over it fell past
 * the last row, leaving a rule hanging under the table pointing at nothing.
 *
 * The line was answering "where in this day am I" — a question the table already
 * answers, twice: the live row is filled, and the next one carries an amber
 * caret and chip. All the line added was the reading on the clock, and a clock
 * is a fact about the *day*, not about the gap between two rows. So it sits in
 * the header with the day's own label, and only while you are looking at today.
 *
 * The dot stays: it is what separates a live reading from a printed one.
 */
function NowClock({ label }: { label: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />
      <span dir="ltr" className="text-label font-semibold tabular text-muted-foreground">
        {label}
      </span>
    </span>
  );
}

export function DayAppointments({
  days,
  initialDate,
  labels,
  title,
}: {
  days: AppointmentDay[];
  /** Today when the clinic works today, otherwise the first day of the week. */
  initialDate: string;
  labels: DayAppointmentsLabels;
  /** Server-rendered: the card's heading. */
  title: ReactNode;
}) {
  const [selected, setSelected] = useState(initialDate);
  const [edges, setEdges] = useState({ up: false, down: false });
  const scrollRef = useRef<HTMLDivElement>(null);

  const index = Math.max(
    0,
    days.findIndex((candidate) => candidate.date === selected),
  );
  const day = days[index];

  const readEdges = useCallback(() => {
    const box = scrollRef.current;
    if (!box) return;

    setEdges({
      up: box.scrollTop > EDGE_SLACK,
      down: box.scrollHeight - box.clientHeight - box.scrollTop > EDGE_SLACK,
    });
  }, []);

  /*
   * Before paint, not after: `useEffect` would let the browser show the top of
   * the list for a frame and then jump, which on the one panel meant to answer
   * "where am I" is the worst possible first impression.
   */
  useLayoutEffect(() => {
    const box = scrollRef.current;
    if (!box) return;

    /*
     * Land one appointment *above* the anchor rather than on it. The anchor is
     * what is happening now; the row before it is what just finished, and
     * showing both is the difference between "here is your next appointment"
     * and "here is where you are in the day".
     */
    const rows = Array.from(box.querySelectorAll<HTMLElement>('[data-row="true"]'));
    const anchorAt = rows.findIndex((row) => row.dataset.anchor === 'true');
    const target = anchorAt > 0 ? rows[anchorAt - 1] : rows[anchorAt];
    const head = box.querySelector('thead');

    if (!target) {
      box.scrollTop = 0;
      readEdges();
      return;
    }

    /*
     * Measured rectangles, not `offsetTop`.
     *
     * ⚠ This was `target.offsetTop - head.offsetHeight`, and it landed **8px
     * short** on every render — enough to leave the bottom padding of the row
     * *above* the target sitting under the sticky header. It read as a white gap
     * between the column names and the first appointment, and it was the tail of
     * an appointment you were not meant to be looking at.
     *
     * `offsetTop` resolves against `offsetParent`, and inside a
     * `border-separate` table with sticky header cells the row's offset parent
     * and the box that actually scrolls are not the same origin — the two
     * disagreed by exactly the amount the header overhangs. Rectangles are
     * measured in one coordinate space (the viewport), so the difference between
     * two of them is exact whatever the table model is doing, and adjusting
     * `scrollTop` by a delta needs no origin at all.
     */
    /*
     * Re-measured after each scroll, up to three times.
     *
     * Setting `scrollTop` to a fractional value gets snapped to a whole device
     * pixel, so one pass can leave a residue — and a few pixels of residue is a
     * white seam under the column names. Measuring again after the box has moved
     * and correcting settles it.
     *
     * The loop also has to *stop* when the box cannot move: on a short day the
     * target row is already as close to the top as the scroll range allows, the
     * delta does not shrink, and re-applying it would spin. Three passes is the
     * ceiling for both cases — this is layout arithmetic, not an animation.
     */
    for (let pass = 0; pass < 3; pass += 1) {
      const delta =
        target.getBoundingClientRect().top -
        box.getBoundingClientRect().top -
        (head?.getBoundingClientRect().height ?? 0);

      if (Math.abs(delta) < 0.5) break;
      box.scrollTop = Math.max(0, box.scrollTop + delta);
    }

    readEdges();
  }, [selected, readEdges]);

  if (!day) return null;

  const dayHref = (date: string) => ({ pathname: '/app/calendar/day' as const, query: { date } });

  const step = (by: number) => {
    const next = days[index + by];
    if (next) setSelected(next.date);
  };

  /*
   * The row the panel opens on: the one running now, or failing that the one
   * about to. Both are computed on the server (`status`, `isNext`); this only
   * decides which of the two the scroll lands on.
   */
  const anchorId =
    day.rows.find((row) => row.status === 'live')?.id ?? day.rows.find((row) => row.isNext)?.id;

  return (
    <Card className="min-w-0 xl:h-full">
      <CardHeader className="shrink-0">
        <div className="grid items-center gap-x-4 gap-y-2 md:grid-cols-[1fr_auto_1fr]">
          <div className="flex min-w-0 items-center">{title}</div>

          {/*
            The stepper. `gap-[0.125em]` in a `text-body-sm` context, the same
            hairline the calendar's toolbar sets between its carets and its
            date: the gap is measured in the label's own type size, so the frame
            stays the same distance from a short weekday and a long one.
          */}
          <div className="flex min-w-0 items-center justify-center gap-[0.125em] text-body-sm">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              // `rounded-lg`, not `icon-sm`'s default circle: these two sit tight
              // against a rectangular label and mark a step, so a disc under the
              // pointer would be a third shape in a three-item row. The calendar's
              // toolbar makes the same call for the same reason.
              className="w-8 rounded-lg"
              aria-label={labels.previousDay}
              disabled={index === 0}
              onClick={() => step(-1)}
            >
              <Caret direction="start" className="size-5" />
            </Button>

            <span className="truncate px-1.5 font-heading text-body-md font-semibold">
              {day.weekday} {day.dayNumber}
            </span>

            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="w-8 rounded-lg"
              aria-label={labels.nextDay}
              disabled={index === days.length - 1}
              onClick={() => step(1)}
            >
              <Caret direction="end" className="size-5" />
            </Button>

            {/*
              A way back to today, and **only** when you are not on it.

              It was a badge on today and a button off it, one slot doing two
              jobs. The badge went with the header's other chips: on today it
              restated what the stepper beside it already says, and a control
              that is sometimes a label is one you have to read before you know
              whether it can be pressed. Off today the button is the only way
              home that is not counting caret presses backwards, so that half
              stays.
            */}
            {/*
              One slot, two readings of the same question — "am I on today?".
              On today it is the clock; off it, the way back. They can never both
              be needed, and neither one ever moves the carets beside it.
            */}
            {day.isToday ? (
              <span className="ms-1">
                <NowClock label={labels.now} />
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setSelected(initialDate)}
                className={cn(
                  buttonVariants({ variant: 'ghost', size: 'sm' }),
                  'ms-1 h-7 px-2 text-label',
                )}
              >
                {labels.today}
              </button>
            )}
          </div>

          {/*
            The count, at the header's inline-end — top-left in Arabic, top-right
            in English.

            It is the one number in this header worth reading from across a
            desk, so it is set at body size rather than as a 12px caption, and it
            is a link: the day it counts is a click away in the calendar. That
            also replaced the "open the calendar" link that used to sit here,
            which went to the *week* and said nothing about which day you were
            looking at — this one is the same destination, aimed.

            Muted at rest and full strength under the pointer, the same response
            `CardTitle tone="muted"` gives the heading opposite it, so the two
            ends of the row answer the pointer the same way.
          */}
          <div className="flex min-w-0 items-center justify-end">
            <Link
              href={dayHref(day.date)}
              className="truncate rounded-sm text-body-md font-semibold text-muted-foreground underline-offset-4 transition-colors duration-(--duration-label) hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {day.countLabel}
            </Link>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex min-w-0 flex-col xl:min-h-0 xl:flex-1">
        {day.rows.length === 0 ? (
          /*
           * The panel's own empty state rather than `EmptyState`, which renders
           * a `Card` — nesting one inside this card would stack two rings and
           * two shadows. Same shape at panel scale, as the agenda drew before
           * it.
           */
          <div className="flex shrink-0 flex-col items-center gap-3 rounded-lg border border-dashed border-border p-6 text-center">
            <Icon name="calendar" className="size-6 text-muted-foreground" />
            <p className="text-body-md text-muted-foreground">{labels.empty}</p>
            <Link
              href={dayHref(day.date)}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <Icon name="bookAppointment" />
              {labels.emptyCta}
            </Link>
          </div>
        ) : (
          <div className="relative flex min-w-0 flex-col xl:min-h-0 xl:flex-1">
            <TableRoot
              ref={scrollRef}
              onScroll={readEdges}
              /*
                `flex-1` **and** the ceiling, not one or the other: the table
                takes what the card's header leaves and stops at
                {@link TABLE_HEIGHT}. Growing without a bound is what let a tall
                screen show the whole finished morning; a fixed height without
                `flex-1` is what pushed the card past the bottom of a short one.
              */
              className={cn(TABLE_HEIGHT, 'overflow-y-auto xl:min-h-0 xl:flex-1')}
            >
              {/*
                `table-fixed` so one long reason cannot squeeze the time column —
                the same call `ClientTable` and the register card make.
              */}
              {/*
                **Four columns from `md`, two below it — and no sideways scroll
                on a phone at all.**

                `table-fixed` divides the *available* width by the declared
                tracks: `w-44` (176px) for the time, `w-1/4` for the reason and
                `w-24` (96px) for the status. The one column with no declared
                width — the client's name — is handed what is left. On a phone
                what was left was nothing: the name column measured 0px, and the
                row showed a time, an empty gap and a status with no clue whose
                appointment it was.

                The first fix for that was `min-w-[34rem]` on every screen: keep
                all four columns at their designed widths and let `TableRoot`,
                which is `overflow-x-auto`, scroll. It was honest but it was the
                bottom rung of the Rearrange → Stack → Internal-scroll ladder.
                A phone gives this card about 263px of content — the staff rail
                is locked to its 56px icon column at every width — so 34rem
                meant looking at 48% of a row and swiping for the rest, on the
                page that is meant to be read at a glance.

                So the phone *rearranges* instead. The reason and the status
                stand down (`hidden md:table-cell`, on the heads and the cells
                alike, so `table-fixed` stops counting their tracks), the time
                column drops to the start alone, and the two that are left
                divide the width with no floor under them. From `md` the floor
                and all four columns come back, and there the card is 632px wide
                so the floor never engages either.

                **Nothing that stood down was the only way to read a state.**
                Live is the olive fill behind the whole row, done is the muted
                text, next is the amber caret in front of the time — the words
                in the status column name what those three already say. The
                reason is the one thing genuinely left behind, and it is one tap
                away on the day the row links to.
              */}
              <Table className="table-fixed text-body-sm md:min-w-[34rem]">
                {/* A header that scrolls away with the rows it names is not a header.
                    The hairline is the "there is more above" mark, drawn on the
                    header's own block-end edge rather than as a wash over the
                    row beneath it — see the fade below. */}
                <TableHeader
                  sticky
                  className={cn(
                    edges.up && '[&>tr>th]:shadow-[0_1px_0_0_var(--color-border)]',
                  )}
                >
                  <TableRow>
                    {/*
                      Wide enough for the longest range the Latin formatter
                      produces — `10:30 – 11:15 AM` — plus the pointer in front
                      of it. At `w-36` it wrapped onto two lines and took the row
                      height with it. That only showed up in the English build,
                      which is the tell worth remembering: both locales draw the
                      same Latin digits here, so a width tuned by eye on the
                      Arabic page is tuned on the shorter of the two layouts.
                    */}
                    {/*
                      `w-32` on a phone, where the cell holds `9:15 AM` and the
                      caret in front of it; `w-44` from `md`, wide enough for
                      the longest range the Latin formatter produces —
                      `10:30 – 11:15 AM` — plus the pointer. At `w-36` the range
                      wrapped onto two lines and took the row height with it.
                      That only showed up in the English build, which is the
                      tell worth remembering: both locales draw the same Latin
                      digits here, so a width tuned by eye on the Arabic page is
                      tuned on the shorter of the two layouts.
                    */}
                    <TableHead className="w-32 md:w-44">{labels.time}</TableHead>
                    <TableHead>{labels.client}</TableHead>
                    <TableHead className="hidden w-1/4 md:table-cell">{labels.reason}</TableHead>
                    <TableHead className="hidden w-24 md:table-cell">{labels.status}</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {day.rows.map((row) => (
                    <TableRow
                      key={row.id}
                      linked
                      data-row="true"
                      data-anchor={row.id === anchorId ? 'true' : undefined}
                      className={cn(
                        /*
                          **The pointer is grey; olive means the clock.**

                          The grey hover is now `TableRow`'s own default —
                          `bg-accent/50` painted on the cells as a rounded pill,
                          the same one the client register uses — so this table
                          no longer overrides it. It used to force a stronger
                          `bg-accent` here because this is the only table with a
                          row that is *permanently* olive (the live one), and
                          pointing at any row must not produce the tint that
                          marks the appointment happening now. The cool neutral
                          is what `--accent` exists for and cannot be confused
                          with a status, because nothing in this system says
                          anything in grey.

                          **Fill means happening; the caret means next.** Only
                          the live row is filled; the next one is marked by the
                          amber caret at its start. Under the pointer the live
                          row deepens by one step of its own hue rather than
                          taking the grey, so it keeps saying "now" while it
                          answers you. Both fills are set on `[&>td]` so they
                          round with the shared pill and out-rank the grey the
                          base row paints on the same cells.
                        */
                        row.status === 'live' &&
                          '[&>td]:bg-secondary hover:[&>td]:bg-primary-subtle',
                        // Past rows step back rather than disappear: the
                        // morning you have already worked is still information.
                        row.status === 'done' && 'text-muted-foreground',
                      )}
                    >
                      <TableCell className={cn(CELL, 'font-medium')}>
                        {/*
                          `whitespace-nowrap` because `TableCell` deliberately
                          leaves it off — that default is for the name column,
                          where a long name should wrap rather than widen the
                          table. A clock time has no sensible break point.
                        */}
                        <span className="flex items-center gap-1.5 whitespace-nowrap">
                          {/*
                            `Caret` rather than the icon set's chevron, matching
                            the two in the stepper above: it mirrors itself from
                            a logical direction, so it points from the row's
                            inline-start edge into the row in both locales.
                          */}
                          {row.isNext ? (
                            // Amber, following the chip at the far end of the
                            // same row: the caret and the chip mark one state,
                            // and drawing them in two colours would say there
                            // are two.
                            <Caret
                              direction="end"
                              className="size-4 shrink-0 text-status-attention-fg"
                            />
                          ) : null}

                          {/*
                            `after:absolute after:inset-0` stretches this link
                            over the whole row. The focus ring stays on the time
                            rather than on the stretched `::after`, so a keyboard
                            reader can see which row they are on.
                          */}
                          <Link
                            href={dayHref(day.date)}
                            className={cn(
                              'rounded-sm underline-offset-4',
                              'after:absolute after:inset-0 after:content-[""]',
                              'focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2',
                            )}
                          >
                            {/*
                              The digits run left-to-right on an Arabic page,
                              which is how a clock is read in both locales; the
                              cell keeps the page's direction so the column
                              still starts at the inline-start edge.
                            */}
                            {/*
                              Two strings rather than one truncated: a clock
                              time has no sensible break point and an elided
                              `10:30 – 11:1…` is worse than the start on its
                              own. Both are formatted on the server and one is
                              hidden in CSS — same reason as everywhere else on
                              this page, a width read on the client would flash
                              the wrong one on first paint.
                            */}
                            <span dir="ltr" className="tabular md:hidden">
                              {row.timeShort}
                            </span>
                            <span dir="ltr" className="hidden tabular md:inline">
                              {row.time}
                            </span>
                          </Link>
                        </span>
                      </TableCell>

                      <TableCell className={CELL}>
                        {/*
                          The tone goes on the wrapper, not on the `Avatar`.

                          `Avatar` writes `style={{ background: color }}` before
                          it spreads the rest of its props, so a `style` passed
                          in replaces that object outright rather than merging
                          with it — the disc ends up with the right properties
                          and no background at all, which on a white row is an
                          invisible avatar. The calendar and the old agenda both
                          set the tone on an ancestor for this reason;
                          `--tone-mark` then resolves by inheritance, which is
                          what `.patient-tone` is for.

                          `patientToneStyle` rather than a hue written out here:
                          a client's colour is five custom properties now — the
                          hue, and a lightness and chroma per theme — and the
                          one place that knows how to spell them is the module
                          that picks them.
                        */}
                        <span
                          className="patient-tone flex items-center gap-2.5"
                          style={patientToneStyle(row.clientSeq)}
                        >
                          {/*
                            The disc goes on a phone. It is a mark *supporting*
                            a name, and in a 135px column it was taking a
                            quarter of the space from the thing it supports —
                            the name is the answer to "whose", and the avatar
                            only helps once there is room to read both.
                          */}
                          <Avatar
                            name={row.clientName}
                            color="var(--tone-mark)"
                            size="sm"
                            className="hidden md:flex"
                          />
                          <span className="truncate font-medium" dir="auto">
                            {row.clientName}
                          </span>
                        </span>
                      </TableCell>

                      <TableCell
                        className={cn(CELL, 'hidden truncate text-muted-foreground md:table-cell')}
                        dir="auto"
                      >
                        {row.reason ?? (
                          <span aria-hidden className="text-muted-foreground/60">
                            —
                          </span>
                        )}
                      </TableCell>

                      <TableCell className={cn(CELL, 'hidden md:table-cell')}>
                        {/*
                          The live chip is the word alone. It carried a
                          `StatusDot` in front of it, which put a second mark in
                          a row that already has the olive fill behind it and
                          the caret below it — three devices for one state, in a
                          table whose whole job is to be scanned.
                        */}
                        {row.status === 'live' ? (
                          <Badge variant="onTrack" size="sm">
                            {labels.live}
                          </Badge>
                        ) : row.status === 'done' ? (
                          <Badge variant="muted" size="sm">
                            {labels.done}
                          </Badge>
                        ) : row.isNext ? (
                          /*
                            Amber, and amber is the only choice this palette
                            actually leaves.

                            "Next" needed to stop being olive so it could not
                            be mistaken for "now" one row above it, and the
                            system's other two accents are both spoken for:
                            clay is the only true alarm colour and is reserved
                            for a real medical flag, so a clay chip here would
                            read as something being wrong with the
                            appointment; flame means a day the client
                            completed, in the portal. Amber is §Status's
                            "needs follow-up", which is the nearest true thing
                            to "this is the one you are about to do" — and it
                            is the one warm hue that carries no verdict.
                          */
                          <Badge variant="attention" size="sm">
                            {labels.next}
                          </Badge>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableRoot>

            {/*
              The overflow affordance, at the block-end only.

              **There was a matching fade at the top and it had to go.** It was
              a 20px white wash starting at `top-9` — a hardcoded guess at the
              sticky header's height — so on a scrolled panel it painted a pale
              band directly under the column names and the first visible row
              began below it, looking detached from the header it was sitting
              against. A gap that is not there, drawn every time you scroll.

              The header's own hairline says the same thing in one pixel and
              cannot drift out of register with a header whose height changes.
              The block-end fade stays: there is nothing under the last row for
              a line to sit on, and a fade is the only mark available there.

              `pointer-events-none` so it cannot swallow a click on the row
              beneath it, and it is tied to the direction it describes — a fade
              with nothing behind it would claim there is more when there is not.
            */}
            <span
              aria-hidden
              className={cn(
                'pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-linear-to-t from-card to-transparent transition-opacity duration-(--duration-label)',
                edges.down ? 'opacity-100' : 'opacity-0',
              )}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
