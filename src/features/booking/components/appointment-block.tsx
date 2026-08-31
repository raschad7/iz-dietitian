'use client';

import { useTranslations } from 'next-intl';
import { type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';

import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

import { formatDuration, formatMinuteRange, formatWeekday } from '../format';
import { blockTypeScale } from '../geometry';
import { patientToneStyle } from '../patient-color';
import { type CalendarAppointment } from '../types';

/**
 * One appointment, positioned on a day column.
 *
 * The card is a light fill with a slightly darker edge on all four sides, in
 * **the client's own colour** — see `../patient-color.ts`. It was a single
 * uniform olive for every booking, on the reasoning that a colour per client
 * turns a busy day into a wall of unrelated hues. What answers that is not
 * fewer colours but quieter ones: the fill is a 2.5%-chroma tint, so a full
 * column still reads as one grid, and the saturated part of the hue is spent
 * on two small things — the hairline, and the avatar.
 *
 * **The avatar is where the colour is actually legible.** A tint that pale is a
 * hint at arm's length; a 20px disc of the same hue carrying the client's
 * initials is the thing you recognise across a week, and it carries the letters
 * that settle it when two clients' hues sit close together.
 *
 * **Hue says who; everything else says what state.** Selection is the olive
 * ring, a valid drop is olive and an invalid one clay, and a finished
 * appointment desaturates and fades. All of those are either a ring, a filter,
 * or a fill this one deliberately overrides, so a block can be "Layla's,
 * selected, and being dragged somewhere legal" and say all three at once
 * without any of them overwriting another.
 *
 * Type scales with the block's height (see `blockTypeScale`) so a two-hour
 * booking reads larger than a half-hour one, and below ~44px there is no room
 * for two lines, so the block collapses to the client's name alone.
 *
 * Direction follows the app's locale, not the client name's script — no
 * `dir="auto"` here. A card in the Arabic build starts from the right even
 * when the name on it is English, matching every other surface in the app.
 */

export type AppointmentBlockProps = {
  appointment: CalendarAppointment;
  locale: Locale;
  /** Pixels from the top of the grid, and pixel height. Both derive from PX_PER_SLOT. */
  top: number;
  height: number;
  completed: boolean;
  selected: boolean;
  /** True when a search is running and this appointment does not match. */
  dimmed: boolean;
  /** Week columns use tighter inline spacing so tablet cards keep a readable name. */
  compact?: boolean;
  /** Live drag feedback: the candidate is valid, invalid, or not being dragged. */
  dragState?: 'valid' | 'invalid' | null;
  /**
   * A finger is resting on this block, mid-hold, before the drag is taken.
   * Coarse pointers only — nothing holds anything on a mouse.
   */
  holding?: boolean;
  /**
   * The slot and day this card would land on if the drag ended now.
   *
   * The block does not move in the layout while it is being carried — see
   * `previewedAppointments` in `./calendar` for why — so this is what the chip
   * on it reports. `null` when nothing is being dragged.
   */
  dragCandidate?: { date: string; startMinute: number; durationMinutes: number } | null;
  onSelect: (id: string) => void;
  onOpen: (appointment: CalendarAppointment, pointer: { x: number; y: number }) => void;
  onMovePointerDown?: (appointment: CalendarAppointment, event: ReactPointerEvent<HTMLElement>) => void;
  onResizePointerDown?: (appointment: CalendarAppointment, event: ReactPointerEvent<HTMLElement>) => void;
};

export function AppointmentBlock({
  appointment,
  locale,
  top,
  height,
  completed,
  selected,
  dimmed,
  compact = false,
  dragState = null,
  holding = false,
  dragCandidate = null,
  onSelect,
  onOpen,
  onMovePointerDown,
  onResizePointerDown,
}: AppointmentBlockProps) {
  const t = useTranslations('booking');
  const scale = blockTypeScale(height);
  const compactStacked = compact && !scale.inline;

  const endMinute = appointment.startMinute + appointment.durationMinutes;
  /**
   * Start *and* end, at every block size.
   *
   * `formatRange` collapses whatever the two times share — "9:00 – 10:30 AM"
   * rather than "9:00 AM – 10:30 AM" — which is what makes a full range fit on
   * one row alongside a name even on a narrow week column.
   */
  const timeRange = formatMinuteRange(locale, appointment.date, appointment.startMinute, endMinute);

  /**
   * The same range for the candidate the drag is currently over, and the day it
   * is on when that is no longer this card's own.
   *
   * Both fall back to the card's own facts, so the chip reads correctly on a
   * resize — where the block itself does grow with the gesture — and in the
   * frame before the first candidate arrives.
   */
  const dragTimeRange = dragCandidate
    ? formatMinuteRange(
        locale,
        dragCandidate.date,
        dragCandidate.startMinute,
        dragCandidate.startMinute + dragCandidate.durationMinutes,
      )
    : timeRange;

  const dragDay =
    dragCandidate && dragCandidate.date !== appointment.date
      ? formatWeekday(locale, dragCandidate.date)
      : null;

  /**
   * A finished appointment stays where it is.
   *
   * Dragging it would rewrite history — and worse, it is the easiest thing on
   * the grid to catch by accident, because a past morning is exactly the area
   * staff sweep the pointer across on the way to booking the afternoon. It can
   * still be opened — from the corner button or a right-click — so a genuine
   * correction is one deliberate gesture away.
   */
  const draggable = !completed;

  /**
   * Drag feedback wins over the resting olive fill: while dragging, "is this
   * legal?" is the only thing the block needs to say. `undefined` when not
   * dragging leaves the Tailwind classes below in charge, instead of an
   * inline style fighting them for the same property.
   */
  const accent =
    dragState === 'valid'
      ? 'var(--status-on-track-fg)'
      : dragState === 'invalid'
        ? 'var(--destructive)'
        : undefined;

  const style: CSSProperties = {
    ...patientToneStyle(appointment.clientSeq),
    top,
    height,
    background: accent ? `color-mix(in oklch, ${accent} 16%, var(--card))` : undefined,
    borderColor: accent,
    // Desaturated and faded once the appointment is over — derived every render
    // from the shared clock, never stored.
    filter: completed ? 'saturate(0.3)' : undefined,
    opacity: completed ? 0.6 : dimmed ? 0.25 : 1,
    /*
      ── No transform here, deliberately ──

      The card follows the pointer freely while it is dragged, and the offset
      that does it is written straight onto this element by the gesture hook
      (`--drag-x` / `--drag-y`, read by `.calendar-dragging`). React must not own
      that property: the offset changes every pointer frame, and a `setState` per
      frame re-renders the whole grid — which is precisely the drag that sticks.

      `top` above stays where the card *started*, untouched for the whole
      gesture: the transform is the entire movement, so there is no second value
      on a second clock for it to disagree with. That is what stopped the shake —
      see `previewedAppointments` in `./calendar`.

      Historical note, since it is the obvious thing to reach back for: `top` was
      the snapped position for a revision, with the transform carrying only the
      remainder. It reads as the tidier arrangement and it is the one that
      shakes — do not restore it without reading that note first.
    */
  };

  return (
    <article
      data-appointment-id={appointment.id}
      data-completed={completed || undefined}
      aria-label={`${appointment.clientName} · ${timeRange}`}
      className={cn(
        /*
          10px of gutter on the inline edges, and `BLOCK_GUTTER_PX` on the
          block edges (applied by `blockCardBox`, since a card's block extent
          is time and belongs to the geometry module).

          The card used to sit 2px off the slot rules and flush against its
          neighbours in time, which made a column of bookings read as one
          striped block reaching the day's edges — no air of its own, and
          nowhere for the grid behind it to show through. Inset on all four
          sides, each appointment reads as a separate card *on* the day rather
          than as the day itself.
        */
        // `patient-tone` builds the four steps below from the hue the style
        // sets. See the note on the class in globals.css.
        'patient-tone',
        /*
          The avatar's disc is a hole in the card rather than a disc the card's
          colour.

          They come to the same thing at rest — the disc defaults to
          `--tone-fill`, which is what this card is painted in — but not on
          hover, where the card moves to `--tone-fill-hover` and a disc holding
          the resting fill would surface as a pale coin under the pointer. Made
          transparent, it is the card underneath at every state, including the
          `saturate()` and `opacity` a completed booking carries.

          Only here. Everywhere else an avatar is drawn — the register, the
          notification feed, the request cards — it sits on a neutral row where
          the disc is the one thing carrying the client's colour and has to be
          filled.
        */
        '[--tone-avatar-fill:transparent]',
        /*
          What a finger needs before it can hold a card: iOS answers a long
          press with its own callout and magnifier, takes the pointer, and fires
          the `pointercancel` the gesture reads as abandoned — so the platform's
          long press would kill ours at about the moment it fired. See
          `.calendar-appointment` in `globals.css`; `touch-action` is
          deliberately not among what it claims, because this card sits on a
          column that has to keep scrolling.
        */
        'calendar-appointment',
        // The press, made visible, for the length of the hold. `:active` would
        // not do: it has no memory of *how long*, so it would fire on every tap
        // and announce a drag that is not coming.
        holding && draggable && 'calendar-holding',
        'absolute rounded-sm border',
        compact ? 'start-1.5 end-1.5 px-2' : 'start-2.5 end-2.5 px-4',
        'text-start transition-[opacity,box-shadow,background-color,border-color] select-none',
        // The block-axis padding the height allows. A short booking cannot
        // spend 12px on air and still show a line of text, so it takes 6px;
        // everything from a half-hour up gets the full gutter.
        scale.inline ? 'py-1.5' : 'py-3',
        /*
          The resting surface is the client's tone: a pale fill, a saturated
          hairline, and a fill one step deeper under the pointer. The tint is
          light enough that a column of bookings still lets the grid read
          through it, and the edge is what actually carries the identity — it
          measures 3.39:1 on the card against the 1.37:1 the olive edge it
          replaces managed, so the colour survives at the 20px a half-hour
          booking is drawn at.
        */
        /*
          **The edge is the selection.** At rest it is the fill, so the card is
          one flat block of the client's colour with no outline at all; selected,
          it becomes the saturated step and a hairline appears around it.

          This is the reverse of what it did a moment ago, and the reverse is
          right: an outline on every card spends a line on a fact — whose
          booking this is — that the fill and the glyph already carry, and forty
          outlined cards on a day make a grid of boxes rather than a schedule.
          Kept for the one card that needs to stand out, the same line says
          something no other card is saying.

          Both border classes are chosen in one expression rather than layered
          as `selected && …` after the resting one: they are the same property at
          the same specificity, so which of them won would come down to the order
          Tailwind happened to emit them in.
        */
        !accent &&
          cn(
            'bg-(--tone-fill) hover:bg-(--tone-fill-hover)',
            selected
              ? 'border-(--tone-edge)'
              : 'border-(--tone-fill) hover:border-(--tone-fill-hover)',
          ),
        // The cursor is the honest signal that a finished appointment is fixed.
        draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
        /*
          Selection is the ring and nothing else. It used to repaint the fill
          and the edge olive too, which meant that selecting a booking erased
          the one thing on it saying whose it was — and on a grid where you
          select a card in order to move it, that is exactly the moment the
          answer matters.

          **No ring.** It was olive, then the card's own colour, and now the
          appearing edge above does the whole job — a ring on top of that would
          be two marks for one state, and the outer one would be the louder of
          the two while saying the less specific thing.

          Left as a comment rather than deleted quietly, because the ring is the
          obvious thing to reach for the next time selection reads as too faint.
          The cheaper move before adding one back is the border's width: the
          card is `border-box`, so going to 2px on the selected state costs no
          layout shift and no second shape.
        */
        // Clipped normally so a long name cannot spill into the next slot, but
        // opened up while dragging so the time chip below can escape a block too
        // short to contain it.
        dragState ? 'z-30 overflow-visible shadow-lg' : 'overflow-hidden',
        /*
          What turns the two custom properties the gesture writes into movement.
          A class rather than an inline transform, because React never touches
          those properties — see the note on `style` above — and because it is
          the one place that can also promote the card to its own layer for the
          length of the drag.
        */
        dragState && 'calendar-dragging',
      )}
      style={style}
      onPointerDown={(event) => {
        // Left button only: right-click is the edit gesture and must not start a
        // drag, or the modal would open with the block already moved.
        if (event.button !== 0) return;
        onSelect(appointment.id);
        /*
          The name is not a drag surface — it is the way into the record, and
          the rest of the card is the way to move the booking. Two gestures on
          one target meant every press on a name was ambiguous until it ended,
          and the way that was resolved (drop the click if the pointer had
          travelled) made an unsteady hand fail to open anything.

          Splitting them by target makes each gesture certain from its first
          frame: press the name, you are opening a client; press anywhere else,
          you are carrying the appointment.
        */
        if ((event.target as HTMLElement).closest('[data-appointment-name]')) return;
        // Selecting still works on a finished appointment; only moving does not.
        if (draggable) onMovePointerDown?.(appointment, event);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onOpen(appointment, { x: event.clientX, y: event.clientY });
      }}
    >
      {/*
        Name and time, at every block size. Stacked when there is room, side by
        side when there is not — but never one without the other: a block showing
        only a name makes staff click it to find out when it is.

        `pe-3` reserves what the corner's action button reaches past the card's
        own 16px of padding, so a long name truncates before it rather than
        running underneath it. It is narrower than it used to be because the
        card's inline padding grew: the two together still clear the same glyph.
      */}
      {/*
        The avatar leads the row, and the name and time stack beside it.

        `items-start` rather than centred: on a two-hour booking the text is two
        lines and a centred disc would float between them instead of marking
        where the block begins. `mt-px` is the optical nudge that lands its
        centre on the name's cap height rather than on its box.

        It is dropped on a collapsed block — below ~44px the card is one line of
        text with 6px of padding, and a 20px disc there would take a third of
        the width the name has to truncate into. The hairline and the fill still
        carry the client's hue at that size; only the initials go.
      */}
      <div
        className={cn(
          'min-w-0',
          compactStacked
            ? 'grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-1.5'
            : cn('flex', compact ? 'gap-1.5' : 'gap-2', scale.inline ? 'items-baseline' : 'items-start'),
        )}
        style={compactStacked ? { rowGap: `${scale.gapRem}rem` } : undefined}
      >
        {!scale.inline && (
          <Avatar
            name={appointment.clientName}
            color="var(--tone-mark)"
            size="xs"
            className="mt-px"
          />
        )}

        <div
          className={cn(
            compactStacked
              ? 'contents'
              : cn(
                  'flex min-w-0 flex-1',
                  compact ? 'pe-2' : 'pe-3',
                  scale.inline ? 'flex-row items-baseline' : 'flex-col',
                ),
          )}
          style={compactStacked ? undefined : { gap: `${scale.gapRem}rem` }}
        >
        {/*
          **The name is the way to the record.** It was the corner arrow, then
          it was a link inside the dialog the corner now opens — two clicks and
          a modal away from a name that is right there on the grid, on the
          screen staff spend the day in. The dialog keeps its link; this is the
          short way.

          `min-w-0` is what lets this actually truncate inside a flex row —
          without it the name would refuse to shrink and push the time out of
          the block instead.
        */}
        <Link
          href={`/app/clients/${appointment.clientId}`}
          data-appointment-name
          className={cn(
            /*
              Sized to the name, not to the row.

              It used to take `flex-1`, which made the link the whole width of
              the card — so the empty space after a short name was still a link,
              and the only place left to grab the card was the time. Now the
              anchor ends where the text does and everything past it is the
              drag surface. `max-w-full` with `truncate` keeps a long name
              inside the card exactly as before; `self-start` stops the stacked
              layout stretching it back across the row.
            */
            'w-fit max-w-full cursor-pointer self-start truncate font-semibold text-foreground underline-offset-2',
            'hover:underline focus-visible:underline focus-visible:outline-none',
            compactStacked && 'col-start-2 pe-2',
          )}
          style={{ fontSize: `${scale.nameRem}rem`, lineHeight: 'var(--lh-label)' }}
        >
          {appointment.clientName}
        </Link>

        <span
          /*
            `text-foreground/70`, not `text-muted-foreground`: the block already
            sits on a tinted background, and muted grey on a tint is a low
            contrast pair that is tiring to read all day. A translucent
            foreground keeps the time clearly legible on every client colour.
          */
          className={cn(
            'flex items-center gap-1 font-medium text-foreground/70',
            // On tablet week cards the avatar and name occupy the first row;
            // the time gets the complete second row instead of inheriting the
            // narrow text column beside the avatar.
            compactStacked && 'col-span-2 min-w-0',
            // Inline, the name gives way first and the time keeps its space —
            // the time is the shorter, more predictable string.
            scale.inline ? 'shrink-0 whitespace-nowrap' : 'truncate',
          )}
          style={{ fontSize: `${scale.timeRem}rem`, lineHeight: 'var(--lh-label)' }}
        >
          <span dir="ltr" className="tabular-nums">
            {timeRange}
          </span>
          {/*
            No `uppercase tracking-wide` on the label below: it is translated,
            and both are neutralised under `:lang(ar)` anyway, so they only
            ever applied to the English build — and tracked-out capitals are
            the worst possible treatment at the smallest size in the scale.
          */}
          {completed && !scale.inline && (
            <span className="shrink-0 rounded-sm bg-foreground/10 px-1 text-label font-semibold">
              {t('completed')}
            </span>
          )}
          {completed && scale.inline && (
            <span aria-label={t('completed')} className="shrink-0">
              ✓
            </span>
          )}
          </span>
        </div>
      </div>

      {/*
        **Right-click, as something you can see.**

        Opening an appointment used to be a right-click and nothing else, which
        is a gesture with no affordance at all: it does not exist on a touch
        screen, and on a desktop nothing on the card said it was there. This
        button runs the same handler the context menu does — same appointment,
        same pointer position, same refusal on a finished booking — so the two
        are one behaviour with two ways in rather than two code paths that have
        to be kept in step.

        It replaces the arrow that used to sit in this corner and jump straight
        to the client's record. That target is the client's name on the card
        itself now, and the dialog this opens keeps one beside the client field
        — neither of them a 24px glyph in a corner shared with a menu.

        Stops its own pointer-down from reaching the card, or the click would
        first register as the start of a select-and-maybe-drag gesture.

        **It answers the pointer the way Cancel does** — the warm neutral
        `accent` fill under the glyph, which is `Button variant="ghost"`'s whole
        hover state. Darkening the glyph alone was the quietest possible answer
        on a card that is itself tinted and already darkens under the pointer,
        so the one control on the block was the hardest thing on it to tell you
        had found. The fill is the same shape as the target.

        The card around it stays deliberately unclickable as a whole — the name
        above is a link and this corner is a menu, and everything between them
        selects and may become a drag. A stretched target over all of that made
        every one of those gestures a candidate for opening something, and a
        booking moved by a shaky hand and a dialog opened by accident are the
        same slipped pointer.
      */}
      <button
        type="button"
        aria-label={t('openActions')}
        aria-haspopup="dialog"
        className={cn(
          'absolute end-0.5 top-0.5 z-10 flex size-6 items-center justify-center rounded-full',
          'text-foreground/50 transition-colors hover:bg-accent hover:text-accent-foreground',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          /*
            On a touch screen this is not a convenience, it is the only way in.
            Opening an appointment otherwise takes a right-click, which a finger
            does not have — so on a phone every appointment action (open, edit,
            delete, reschedule) sits behind this one 24px target.

            `before:` rather than a bigger button: the visible disc stays 24px,
            so the block looks identical on every device, and an invisible
            pseudo-element widens the *hit* area to 40px. Growing the button
            itself would cover the name on a 30-minute block.

            8px and not the 10px that would reach the 44px floor exactly, and
            only on coarse pointers. The note below this block is explicit that a
            target stretched over the card was tried and reverted — "a booking
            moved by a shaky hand and a dialog opened by accident are the same
            slipped pointer" — and a 44px pad in the corner of a 30-minute block
            *is* that stretched target, because the block is barely taller than
            the pad. 40px is the most that can be taken here without turning a
            tap meant for the card into a dialog.
          */
          'pointer-coarse:before:absolute pointer-coarse:before:-inset-2 pointer-coarse:before:content-[""]',
        )}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onOpen(appointment, { x: event.clientX, y: event.clientY });
        }}
      >
        <Icon name="moreActions" className="size-4" />
      </button>

      {/*
        The live times while this block is being moved or resized.

        Shown as a floating chip rather than relying on the block's own second
        line, because that line disappears on short blocks — and a 30-minute
        appointment being dragged is exactly when the times need to be readable.
        It escapes the block through the `overflow-visible` above.
      */}
      {dragState && (
        <span
          aria-hidden
          className={cn(
            /*
              `start-1/2` is logical and `-translate-x-1/2` is physical, so the
              pair only centred in English. In Arabic `start-1/2` resolves to
              `right: 50%` — the chip hangs leftwards from the column's midline —
              and pulling it left again by half its own width put it a full width
              off centre, outside the 112px column it belongs to. `rtl:` flips
              the compensation to match the edge the inset actually set.
            */
            'pointer-events-none absolute start-1/2 top-1/2 z-40 -translate-x-1/2 -translate-y-1/2 rounded-md border px-2 py-1 rtl:translate-x-1/2',
            'bg-popover text-xs font-semibold whitespace-nowrap shadow-md tabular-nums',
            dragState === 'valid' ? 'border-primary/60 text-foreground' : 'border-destructive/60 text-destructive',
          )}
        >
          {/*
            The *candidate* time, not the card's own — and on a move they are
            not the same thing any more. The block stays in its own slot for the
            length of the gesture, so this chip is the only thing on screen
            saying what the drop would do, which is why it names the day as well
            whenever the drag has left the one it started on.
          */}
          <span>{dragTimeRange}</span>
          {dragDay && <span className="ms-1.5 font-normal">{dragDay}</span>}
          <span className="ms-1.5 font-normal text-muted-foreground">
            {formatDuration(dragCandidate?.durationMinutes ?? appointment.durationMinutes, {
              hour: (n) => t('duration.hours', { count: n }),
              minute: (n) => t('duration.minutes', { count: n }),
            })}
          </span>
        </span>
      )}

      {/*
        ── There is no move grip any more ──

        There was one: a 28px column down the block's inline-start edge, shown
        only on coarse pointers, and it existed because it was the one surface
        here that could claim `touch-action: none`. The block cannot — it fills a
        column that has to stay pannable — so on glass the gesture had to be
        reserved by a piece of chrome, and on a 30-minute booking that chrome
        took a quarter of the card away from the client's name.

        The gesture changed, so the bargain is off. A press and hold anywhere on
        the block picks it up (`HOLD_TO_DRAG_MS` in `use-calendar-gestures.ts`),
        which means the whole card is the handle and there is nothing left for a
        strip to promise. The same move the planner board made — see
        `.planner-holding` in `globals.css`.
      */}

      {/*
        Resize handle — lengthen the appointment by dragging its bottom edge.
        Sits on the block's end edge in the *block* axis, which is vertical and
        so does not mirror in RTL.

        Rendered on every block, including collapsed ones. It used to be hidden
        below the two-line threshold, which meant that once the grid was fitted
        to the screen and blocks got shorter, the shortest appointments — the
        ones most likely to need lengthening — were the ones that could not be
        resized. Its height is capped at a third of the block so it can never
        swallow the whole surface and block the move gesture.
      */}
      {onResizePointerDown && draggable && (
        <span
          role="presentation"
          aria-hidden
          className="calendar-resize-grip absolute start-0 end-0 bottom-0 cursor-ns-resize"
          /*
            Both depths are computed and CSS picks one — no `matchMedia`, no
            hydration mismatch, and the pointer question stays in the stylesheet
            where the rest of it lives.

            A finger cannot find an 8px edge, so a coarse pointer gets a deeper
            one; both stay bounded by a third of the block, so neither can
            swallow the surface the move gesture needs. That cap is why this
            cannot be a static class: the bound is a fraction of *this* block.
          */
          style={
            {
              '--resize-grip-fine': `${Math.max(4, Math.min(8, height / 3))}px`,
              '--resize-grip-coarse': `${Math.max(8, Math.min(20, height / 3))}px`,
            } as CSSProperties
          }
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            // Without this the block's own handler would start a move at the
            // same time and the appointment would slide instead of resize.
            event.stopPropagation();
            onSelect(appointment.id);
            onResizePointerDown(appointment, event);
          }}
        />
      )}
    </article>
  );
}
