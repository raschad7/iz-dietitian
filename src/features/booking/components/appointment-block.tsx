'use client';

import { useTranslations } from 'next-intl';
import { type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';

import { Icon } from '@/components/ui/icon';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

import { formatDuration, formatMinuteRange } from '../format';
import { blockTypeScale } from '../geometry';
import { type CalendarAppointment } from '../types';

/**
 * One appointment, positioned on a day column.
 *
 * The card itself is a fixed, uniform surface — a light olive fill with a
 * slightly darker edge on all four sides — so the grid reads as one calm
 * system rather than a wall of client colours.
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
  /** Live drag feedback: the candidate is valid, invalid, or not being dragged. */
  dragState?: 'valid' | 'invalid' | null;
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
  dragState = null,
  onSelect,
  onOpen,
  onMovePointerDown,
  onResizePointerDown,
}: AppointmentBlockProps) {
  const t = useTranslations('booking');
  const scale = blockTypeScale(height);

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
   * A finished appointment stays where it is.
   *
   * Dragging it would rewrite history — and worse, it is the easiest thing on
   * the grid to catch by accident, because a past morning is exactly the area
   * staff sweep the pointer across on the way to booking the afternoon. It can
   * still be opened with a right-click, so a genuine correction is one deliberate
   * gesture away.
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
    top,
    height,
    background: accent ? `color-mix(in oklch, ${accent} 16%, var(--card))` : undefined,
    borderColor: accent,
    // Desaturated and faded once the appointment is over — derived every render
    // from the shared clock, never stored.
    filter: completed ? 'saturate(0.3)' : undefined,
    opacity: completed ? 0.6 : dimmed ? 0.25 : 1,
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
        'absolute start-2.5 end-2.5 rounded-sm border px-4',
        'text-start transition-[opacity,box-shadow,background-color,border-color] select-none',
        // The block-axis padding the height allows. A short booking cannot
        // spend 12px on air and still show a line of text, so it takes 6px;
        // everything from a half-hour up gets the full gutter.
        scale.inline ? 'py-1.5' : 'py-3',
        /*
          The resting surface is **olive-50** — the palette's quietest tint —
          with the olive-200 edge doing the containing. At olive-100 a column of
          bookings was a solid green wall and the hover step had nowhere to go
          but darker still; starting a step lighter leaves the fill room to
          answer the pointer and lets the grid read through a busy day.
        */
        !accent && 'border-(--olive-200) bg-(--olive-50) hover:bg-(--olive-100)',
        // The cursor is the honest signal that a finished appointment is fixed.
        draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
        selected &&
          'border-(--olive-500) bg-(--olive-100) ring-2 ring-(--olive-500) ring-offset-1 ring-offset-background',
        // Clipped normally so a long name cannot spill into the next slot, but
        // opened up while dragging so the time chip below can escape a block too
        // short to contain it.
        dragState ? 'z-30 overflow-visible shadow-lg' : 'overflow-hidden',
      )}
      style={style}
      onPointerDown={(event) => {
        // Left button only: right-click is the edit gesture and must not start a
        // drag, or the modal would open with the block already moved.
        if (event.button !== 0) return;
        onSelect(appointment.id);
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

        `pe-3` reserves what the client-page arrow reaches past the card's own
        16px of padding, so a long name truncates before it rather than running
        underneath it. It is narrower than it used to be because the card's
        inline padding grew: the two together still clear the same glyph.
      */}
      <div
        className={cn('flex min-w-0 pe-3', scale.inline ? 'flex-row items-baseline' : 'flex-col')}
        style={{ gap: `${scale.gapRem}rem` }}
      >
        <span
          // `min-w-0` is what lets this actually truncate inside a flex row —
          // without it the name would refuse to shrink and push the time out of
          // the block instead.
          className="min-w-0 flex-1 truncate font-semibold text-foreground"
          style={{ fontSize: `${scale.nameRem}rem`, lineHeight: 1.25 }}
        >
          {appointment.clientName}
        </span>

        <span
          /*
            `text-foreground/70`, not `text-muted-foreground`: the block already
            sits on a tinted background, and muted grey on a tint is a low
            contrast pair that is tiring to read all day. A translucent
            foreground keeps the time clearly legible on every client colour.
          */
          className={cn(
            'flex items-center gap-1 font-medium text-foreground/70',
            // Inline, the name gives way first and the time keeps its space —
            // the time is the shorter, more predictable string.
            scale.inline ? 'shrink-0 whitespace-nowrap' : 'truncate',
          )}
          style={{ fontSize: `${scale.timeRem}rem`, lineHeight: 1.25 }}
        >
          <span className="tabular-nums">{timeRange}</span>
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

      {/*
        The client's record, and **the only way to it from the grid**.

        Top corner, opposite the name and time rather than over them. Stops its
        own pointer-down from reaching the card, or the click would first
        register as the start of a select-and-maybe-drag gesture instead of a
        navigation. No hover treatment: it sits in the same tight corner at
        every block size, and a colour shift there reads as noise rather than
        feedback worth having.

        The card around it is deliberately *not* a link. Left-click on the body
        selects and may become a drag, right-click opens the appointment, and a
        stretched link over all of that made every one of those gestures a
        candidate for navigating away — a booking moved by a shaky hand and a
        client page opened by accident are the same slipped pointer. Confining
        navigation to one small, explicit target keeps the two apart by area
        rather than by guessing at intent.
      */}
      <Link
        href={`/app/clients/${appointment.clientId}`}
        aria-label={t('openClientProfile')}
        className="absolute end-0.5 top-0.5 z-10 flex size-6 items-center justify-center rounded-full text-foreground/50"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <Icon name="chevronEnd" className="size-4" />
      </Link>

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
            'pointer-events-none absolute start-1/2 top-1/2 z-40 -translate-x-1/2 -translate-y-1/2 rounded-md border px-2 py-1',
            'bg-popover text-xs font-semibold whitespace-nowrap shadow-md tabular-nums',
            dragState === 'valid' ? 'border-primary/60 text-foreground' : 'border-destructive/60 text-destructive',
          )}
        >
          <span>{timeRange}</span>
          <span className="ms-1.5 font-normal text-muted-foreground">
            {formatDuration(appointment.durationMinutes, {
              hour: (n) => t('duration.hours', { count: n }),
              minute: (n) => t('duration.minutes', { count: n }),
            })}
          </span>
        </span>
      )}

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
          className="absolute start-0 end-0 bottom-0 cursor-ns-resize"
          style={{ height: Math.max(4, Math.min(8, height / 3)) }}
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
