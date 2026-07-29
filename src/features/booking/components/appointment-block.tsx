'use client';

import { useTranslations } from 'next-intl';
import { type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';

import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

import { formatDuration, formatMinute, formatMinuteRange } from '../format';
import { blockTypeScale } from '../geometry';
import { type CalendarAppointment } from '../types';

/**
 * One appointment, positioned on a day column.
 *
 * Colour comes from the client and is applied inline: it is row data, not a
 * design token, so there is no Tailwind class for it. The same hex draws that
 * person's avatar in the picker, so a block and a row in the list read as
 * obviously the same client. The block is a tint of it with a solid edge on the
 * inline-start side — `border-s`, so the edge is on the left in English and the
 * right in Arabic without a second rule.
 *
 * Type scales with the block's height (see `blockTypeScale`) so a two-hour
 * booking reads larger than a half-hour one, and below ~44px there is no room
 * for two lines, so the block collapses to the client's name alone.
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
  const timeRange = formatMinuteRange(locale, appointment.date, appointment.startMinute, endMinute);
  /** On one row there is no room for a range, so the start time stands in. */
  const startTime = formatMinute(locale, appointment.date, appointment.startMinute);

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
   * Drag feedback wins over the client colour: while dragging, "is this legal?"
   * is the only thing the block needs to say.
   */
  const accent = dragState === 'valid' ? '#16a34a' : dragState === 'invalid' ? '#dc2626' : appointment.clientColor;

  const style: CSSProperties = {
    top,
    height,
    // `color-mix` keeps one stored hex driving the fill, the edge and the text.
    background: `color-mix(in oklch, ${accent} 16%, var(--card))`,
    borderInlineStartColor: accent,
    // Desaturated and faded once the appointment is over — derived every render
    // from the shared clock, never stored.
    filter: completed ? 'saturate(0.3)' : undefined,
    opacity: completed ? 0.6 : dimmed ? 0.25 : 1,
  };

  return (
    <article
      dir="auto"
      data-appointment-id={appointment.id}
      data-completed={completed || undefined}
      aria-label={`${appointment.clientName} · ${timeRange}`}
      className={cn(
        'absolute start-0.5 end-0.5 rounded-md border border-border/60 border-s-[3px] px-2',
        'text-start transition-[opacity,box-shadow] select-none',
        scale.inline ? 'py-0.5' : 'py-1',
        // The cursor is the honest signal that a finished appointment is fixed.
        draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
        selected && 'ring-2 ring-ring ring-offset-1 ring-offset-background',
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
      */}
      <div
        className={cn('flex min-w-0', scale.inline ? 'flex-row items-baseline' : 'flex-col')}
        style={{ gap: `${scale.gapRem}rem` }}
      >
        <span
          className="min-w-0 truncate font-semibold text-foreground"
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
          <span dir="auto" className="tabular-nums">
            {scale.inline ? startTime : timeRange}
          </span>
          {completed && !scale.inline && (
            <span className="shrink-0 rounded-sm bg-foreground/10 px-1 text-[0.625rem] font-semibold tracking-wide uppercase">
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
            dragState === 'valid' ? 'border-emerald-500/60 text-foreground' : 'border-destructive/60 text-destructive',
          )}
        >
          <span dir="auto">{timeRange}</span>
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
