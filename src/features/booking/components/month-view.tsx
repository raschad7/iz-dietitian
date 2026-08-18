'use client';

import { useTranslations } from 'next-intl';

import { Icon } from '@/components/ui/icon';

import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

import { isSameMonth, monthGridDays } from '../date';
import { formatDayNumber, formatLongDate, formatMinuteRange, formatWeekday } from '../format';
import { patientToneStyle } from '../patient-color';
import { type CalendarAppointment } from '../types';
import { isWorkingDay, type ClinicHours } from '../validation';

/**
 * The month grid — an overview, and **read only**.
 *
 * Nothing here creates, edits, moves or deletes: a month cell is a few pixels
 * tall per appointment, which is the wrong place to be dragging clinical
 * records around, and a mis-click has no undo. Clicking a day opens that day in
 * the day view, where there is room to work and every gesture is available.
 *
 * That is why this component takes no mutation callbacks at all. It cannot edit
 * because it has nothing to edit with.
 *
 * ## The cell is a div with a stretched button, not a button
 *
 * It used to be a `<button>` wrapped straight around the day number, a `<ul>`
 * of chips and a `<p>`. A button's content model is *phrasing* content, and a
 * list is not — so the browser was laying out flow content inside an
 * inline-block replaced-ish element whose UA styles centre their contents, and
 * the chips inherited the button's own alignment and baseline rules rather than
 * the ones written for them. The whole cell is still one target and still
 * keyboard-reachable; the button is now an overlay stretched across the cell
 * (`absolute inset-0`), which is the same device the client register uses to
 * make a table row a link.
 */

export type MonthViewProps = {
  anchorDate: string;
  locale: Locale;
  hours: ClinicHours;
  appointments: CalendarAppointment[];
  today: string | null;
  selectedId: string | null;
  highlightId: string | null;
  dimmedIds: ReadonlySet<string>;
  completedIds: ReadonlySet<string>;
  /** Opens that date in the day view — the only thing a click does here. */
  onOpenDay: (date: string) => void;
};

/**
 * A cell holds two different things, and which one you get is the width.
 *
 * **Desktop (`lg` and up) — chips.** Up to three lines, each a client's name
 * and the time on their own tone. A desktop column is ~180px, which is enough
 * to read a name in, and a month opened on a desktop is being read rather than
 * glanced at.
 *
 * **Tablet (`md` to `lg`) — one dot and a count.** The column is ~100px there
 * and it is reached by a thumb. Three chips at that width are three ellipses,
 * which is a texture rather than information: it says "busy" and nothing more,
 * which the number says better and in a fraction of the space. One green dot
 * says there is something here at all; "Other 4" says exactly how much else.
 *
 * Both are rendered and one of them is hidden in CSS at `lg`, rather than one
 * being chosen from a measured viewport. The counts are *different numbers* — a
 * tablet counts everything after the first, a desktop only what would not fit
 * in three lines — so this cannot be one element with a responsive class on it.
 * And the month grid is server-rendered like the rest of the calendar: a width
 * read on the client would flash the wrong band on first paint.
 */
const MAX_LINES = 3;

/** The tablet's single dot — see {@link MAX_LINES}. */
const TABLET_DOTS = 1;

export function MonthView({
  anchorDate,
  locale,
  hours,
  appointments,
  today,
  selectedId,
  highlightId,
  dimmedIds,
  completedIds,
  onOpenDay,
}: MonthViewProps) {
  const t = useTranslations('booking');

  const days = monthGridDays(anchorDate);
  const weekdayStrip = days.slice(0, 7);

  const byDate = new Map<string, CalendarAppointment[]>();
  for (const appointment of appointments) {
    const list = byDate.get(appointment.date);
    if (list) list.push(appointment);
    else byDate.set(appointment.date, [appointment]);
  }

  return (
    // Full-bleed, like the day and week grids: one rule between it and the
    // toolbar, and no box of its own. See the note on the calendar's root.
    /*
      `overflow-x-auto` here, and a `min-w-[42rem]` floor on the two rows inside
      it — the weekday strip and the month grid, both in this one scroller so a
      column cannot drift out from under its own weekday name.

      The floor is set by the *chips*, which is to say by the widest thing a cell
      ever holds: a client's name with a time beside it needs about 96px before
      it collapses to an ellipsis, and seven of those is 672px. The tablet's dot
      would be happy with a third of that, but the floor has to clear the taller
      of the two — a desktop-width window handed a narrow column (the calendar
      embedded in a client's Visit History rather than full-bleed) is drawing
      chips, and a chip that is all ellipsis says nothing at all.

      It costs nothing from ~672px up, and a tablet has 712px, so the scroller
      never actually engages on any screen the month view is offered on. It is
      the embedded case it is there for.
    */
    <div className="flex min-h-0 flex-1 flex-col overflow-x-auto border-t border-border">
      {/*
        `bg-muted` flat, not `bg-muted/50`. The sunken fill is already the
        quietest surface the palette has; halving it left a strip that was
        neither a fill nor an absence, and the grid had three different muted
        opacities in it (30, 50, 60) doing three jobs nobody could tell apart.
      */}
      <div className="grid min-w-[42rem] grid-cols-7 border-b border-border bg-muted">
        {weekdayStrip.map((date) => (
          <div
            key={date}
            className="px-2 py-2 text-center text-caption font-medium text-muted-foreground"
          >
            {formatWeekday(locale, date)}
          </div>
        ))}
      </div>

      {/*
        The minimum lives on the *rows*, not on the cells. It used to be
        `min-h-36` on each cell inside `grid-rows-6` — and `grid-rows-6` is
        `minmax(0, 1fr)`, which lets a row be shorter than what is in it. So on
        any normal window the rows came out at ~121px while every cell insisted
        on being 144px, and each one hung 23px down over the week below it.
        That is the whole of what looked broken here: the grid scrolled by the
        overhang, the last row was clipped by it, and the invisible 23px lip of
        the *previous* week sat on top of the first three weeks' worth of every
        cell, so hovering near the top of a day lit up the day above it.

        Putting the floor on the track fixes all three at once — the row is
        never smaller than its cell, so nothing overlaps and nothing is clipped;
        and when the panel is taller than six minimum rows, `1fr` spends the
        rest on the cells rather than leaving a gap at the foot.
      */}
      <div className="grid min-h-0 min-w-[42rem] flex-1 grid-cols-7 grid-rows-[repeat(6,minmax(7rem,1fr))] overflow-y-auto">
        {days.map((date) => {
          const inMonth = isSameMonth(date, anchorDate);
          const closed = !isWorkingDay(date, hours);
          const dayAppointments = byDate.get(date) ?? [];
          /*
            The desktop's chips. Over the limit the last line goes to the count
            rather than to a chip: a day with four appointments shows two and
            "+2 more", not three and "+1 more", so the block is always three
            lines high whatever the day holds — which is what lets the row be
            sized once for the worst case instead of overflowing on the busy
            days. The tablet's arithmetic is its own: one dot, and the rest.
          */
          const visibleAppointments =
            dayAppointments.length > MAX_LINES
              ? dayAppointments.slice(0, MAX_LINES - 1)
              : dayAppointments;
          const hiddenCount = dayAppointments.length - visibleAppointments.length;
          // A day already gone reads the same muted way a day outside this
          // month does — neither can be booked from here, so neither earns
          // full-strength text.
          const isPast = today !== null && date < today;
          const isToday = date === today;

          return (
            <div
              key={date}
              data-day={date}
              className={cn(
                /*
                  No `min-h` here — the floor is on the row instead, so the cell
                  is exactly its track and can never lap the week below. See the
                  note on the grid.

                  The vertical rule is dropped on the first column of each row:
                  `border-s` on all seven drew a line down the grid's own
                  leading edge, which in Arabic is the edge the rail is already
                  on, so the month began with a doubled boundary.
                */
                'relative overflow-hidden border-b border-s border-border p-1.5',
                '[&:nth-child(7n+1)]:border-s-0',
                /*
                  Hover is the ambient tint. `has-[:focus-visible]`, not
                  `focus-within`: a click focuses the cell's button, and
                  `focus-within` left that day tinted after the pointer had
                  moved on — two days lit at once, which read as the hover
                  landing somewhere it had not been asked to.
                */
                'transition-colors hover:bg-accent/70 has-[:focus-visible]:bg-accent/70',
                /*
                  Two states, two treatments, and they stack rather than
                  compete: outside this month is quiet *text*, a closed day is a
                  sunken *fill*.

                  Half-strength `muted`, because a closed day is the one thing
                  in this grid that is *not* news. At full strength the clinic's
                  weekend was two solid grey columns down the month and the eye
                  went to them first; at 50% it reads as a shade of the page,
                  which is all "nothing happens here" needs to say.
                */
                (!inMonth || isPast) && 'text-muted-foreground',
                closed && 'bg-muted/50',
              )}
            >
              {/*
                The target. Stretched over the cell rather than wrapped around
                it, so the cell's contents lay out as ordinary flow content —
                see the note at the top of this file. `sr-only` text rather than
                `aria-label` alone keeps it a button with a name in every
                assistive tree.
              */}
              <button
                type="button"
                onClick={() => onOpenDay(date)}
                className="absolute inset-0 z-10 cursor-pointer focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="sr-only">{formatLongDate(locale, date)}</span>
              </button>

              {/*
                Today is a filled pip on the number, not a ring around the cell.
                The ring was drawn `inset` inside a cell that already carries
                two borders, so on the row and column it touched there were
                three lines within two pixels of each other; the pip is the mark
                the rest of the calendar already uses for today.
              */}
              <span
                className={cn(
                  'flex size-6 items-center justify-center text-body-sm font-semibold tabular-nums',
                  isToday && 'rounded-full bg-primary text-primary-foreground',
                )}
              >
                {formatDayNumber(locale, date)}
              </span>

              {/*
                **The tablet's cell: one dot, then a count of the rest.**
                `lg:hidden`, and the chips below are its opposite number — see
                {@link MAX_LINES} for why there are two of these rather than one
                element with a breakpoint on it.

                The dot is `bg-primary`, the brand green, and not the client's
                own tone. A colour per client is what the chips downstairs are
                for; up here there is exactly one mark in the cell, so a hue
                would be saying "this is somebody" to a reader who cannot tell
                which somebody from 8px of colour. The green says the thing a
                month at this width is actually for — *something is booked
                here* — in the ink the rest of the app marks its own state with.
                It is the same fill as the pip on today's date, one shape up.

                The name and the time ride along as `sr-only` text, so a screen
                reader on a tablet still hears whose appointment it is. There is
                deliberately no `title`: the cell's target is a button stretched
                over the whole of it (see the note at the top of this file) and
                it sits above this, so a hover hint would either never fire or
                would need a dead spot punched in the one control this view has.
              */}
              {dayAppointments.length > 0 ? (
                <div className="lg:hidden">
                  <ul className="mt-1.5 flex items-center">
                    {dayAppointments.slice(0, TABLET_DOTS).map((appointment) => {
                      const completed = completedIds.has(appointment.id);
                      const marked =
                        selectedId === appointment.id || highlightId === appointment.id;

                      const time = formatMinuteRange(
                        locale,
                        appointment.date,
                        appointment.startMinute,
                        appointment.startMinute + appointment.durationMinutes,
                      );
                      const label = completed
                        ? `${appointment.clientName} · ${time} · ${t('completed')}`
                        : `${appointment.clientName} · ${time}`;

                      return (
                        <li key={appointment.id} className="flex">
                          <span
                            /*
                              Marked is a ring, as it is on the chip and on the
                              block — but in `foreground` rather than the olive
                              those two use, because the dot is now the olive
                              and a ring one step off its own fill is not a
                              mark, it is a slightly larger dot. `ring-1`: two
                              pixels of ring around eight pixels of dot is a
                              ring with a dot in it.
                            */
                            className={cn(
                              'block size-2 rounded-full bg-primary',
                              marked && 'ring-1 ring-foreground ring-offset-1 ring-offset-card',
                            )}
                            style={{
                              // The same pair the chips carry, for the reasons
                              // set out down there.
                              filter: completed ? 'saturate(0.3)' : undefined,
                              opacity: completed ? 0.6 : dimmedIds.has(appointment.id) ? 0.25 : 1,
                            }}
                          >
                            <span className="sr-only">{label}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  {/*
                    `mt-2`, not the half step the chips keep between themselves.
                    Half a step is the right gap between things of one kind;
                    between a mark and a sentence about it, it read as one
                    broken line rather than as two different kinds of thing.
                  */}
                  {dayAppointments.length > TABLET_DOTS ? (
                    <p className="mt-2 px-1.5 text-label text-muted-foreground">
                      {t('monthOther', { count: dayAppointments.length - TABLET_DOTS })}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {/* **The desktop's cell**, from `lg` — see {@link MAX_LINES}. */}
              <div className="hidden lg:block">
                {/*
                  Plain list items, not buttons. A month chip is read, never acted
                  on — the day view is where an appointment can be changed.
                */}
                {/*
                  Three lines of chip at 13px, the day number above them and the
                  cell's own padding is what sets the row's `7rem` floor. Tighten
                  either and the other has to move — they are one measurement.
                */}
                <ul className="mt-1 space-y-0.5">
                  {visibleAppointments.map((appointment) => {
                    const completed = completedIds.has(appointment.id);
                    const marked = selectedId === appointment.id || highlightId === appointment.id;

                    return (
                      <li key={appointment.id}>
                        <span
                          /*
                            The same surface the day and week cards wear: the
                            client's own tone inside its own hairline.

                            This used to carry no client colour at all, because a
                            tint per person turned a grid of thirty chips into a
                            swatch book. What stops that is the *weight* of the
                            tint, not the number of them: at 2.5% chroma thirty
                            chips read as a month with colour in it rather than as
                            a swatch book, and the hairline is what actually
                            separates one client from the next at this size.

                            No avatar here, unlike the block and the agenda row. A
                            chip is 18px tall and holds a name and a time already;
                            a 20px disc would be the whole row. The name is on
                            every chip, which is what the disc is there to support
                            elsewhere.

                            Marked is the ring, matching `AppointmentBlock`: the
                            chip that is selected keeps saying whose it is.
                          */
                          className={cn(
                            'patient-tone',
                            'flex w-full items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-start text-label',
                            'border-(--tone-edge) bg-(--tone-fill) text-foreground',
                            marked && 'ring-2 ring-(--olive-500) ring-offset-1 ring-offset-card',
                          )}
                          style={{
                            ...patientToneStyle(appointment.clientSeq),
                            /*
                              `saturate(.3)`, not `grayscale`. A completed chip is
                              meant to read as a quieter olive, and `grayscale` is
                              `saturate(0)` — it took *all* the colour out, so on a
                              month where every appointment has already happened
                              the whole grid went grey and the view stopped looking
                              like part of this app.
                            */
                            filter: completed ? 'saturate(0.3)' : undefined,
                            opacity: completed ? 0.6 : dimmedIds.has(appointment.id) ? 0.25 : 1,
                          }}
                        >
                          {/* The system's own glyph, not a `✓` character: the
                              literal renders in whatever fallback font has it,
                              which is not the one every other mark here uses. */}
                          {completed ? (
                            <Icon
                              name="check"
                              aria-label={t('completed')}
                              className="size-3 shrink-0"
                            />
                          ) : null}

                          <span className="min-w-0 truncate" dir="auto">
                            {appointment.clientName}
                          </span>

                          {/*
                            The times hold their space and the name gives way: the
                            range is the shorter, more predictable string, and a
                            chip that says only "Ahmad" answers half the question
                            a calendar is for.
                          */}
                          <span
                            className="ms-auto shrink-0 whitespace-nowrap tabular-nums opacity-80"
                            dir="auto"
                          >
                            {formatMinuteRange(
                              locale,
                              appointment.date,
                              appointment.startMinute,
                              appointment.startMinute + appointment.durationMinutes,
                            )}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>

                {/* What the chips above left off — a count, not a fourth sliver of a chip. */}
                {hiddenCount > 0 ? (
                  <p className="mt-0.5 px-1.5 text-label text-muted-foreground">
                    {t('monthMore', { count: hiddenCount })}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
