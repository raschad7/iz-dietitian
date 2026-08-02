'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { SLOT_MINUTES } from '@/lib/time-constants';

import { nowLineMinute } from '../completed';
import { formatDuration, formatMinute, formatMinuteRange } from '../format';
import {
  SUBDIVISION_MIN_PX_PER_SLOT,
  blockBox,
  floorToSlot,
  gridHeight,
  minuteToY,
  pointerToMinute,
} from '../geometry';
import { type CalendarAppointment } from '../types';
import { type ClinicHours } from '../validation';
import { AppointmentBlock } from './appointment-block';

/**
 * One day's canvas: the slot rules, the appointments on it, the now-line, and
 * the gestures that create and move bookings.
 *
 * Every pixel here comes from `../geometry`, computed from the `pxPerSlot` the
 * calendar measured for the panel. There is no hardcoded height in this file, so
 * the column rescales to whatever space it is given.
 */

export type PendingRange = { date: string; startMinute: number; durationMinutes: number; valid: boolean };

export type DayColumnProps = {
  date: string;
  locale: Locale;
  hours: ClinicHours;
  /** Slot height for this render — fitted to the panel, not the module default. */
  pxPerSlot: number;
  appointments: CalendarAppointment[];
  now: Date | null;
  selectedId: string | null;
  highlightId: string | null;
  /** Ids that do not match the current search, drawn dimmed. */
  dimmedIds: ReadonlySet<string>;
  completedIds: ReadonlySet<string>;
  /** The range currently being dragged out on *this* date, if any. */
  pending: PendingRange | null;
  isClosed: boolean;
  /**
   * The date has already gone, so nothing can be booked on it.
   *
   * Kept separate from `isClosed` even though the two look alike: a past
   * *working* day is not a day the clinic is shut, and conflating them would
   * make the column claim something untrue about the clinic's hours.
   */
  isPast: boolean;
  onCreateGesture: (date: string, event: ReactPointerEvent<HTMLDivElement>) => void;
  onSelect: (id: string) => void;
  onOpen: (appointment: CalendarAppointment, pointer: { x: number; y: number }) => void;
  onMovePointerDown: (appointment: CalendarAppointment, event: ReactPointerEvent<HTMLElement>) => void;
  onResizePointerDown: (appointment: CalendarAppointment, event: ReactPointerEvent<HTMLElement>) => void;
  /** Appointment being dragged, and whether its candidate currently validates. */
  dragging: { id: string; valid: boolean } | null;
};

export function DayColumn({
  date,
  locale,
  hours,
  pxPerSlot,
  appointments,
  now,
  selectedId,
  highlightId,
  dimmedIds,
  completedIds,
  pending,
  isClosed,
  isPast,
  onCreateGesture,
  onSelect,
  onOpen,
  onMovePointerDown,
  onResizePointerDown,
  dragging,
}: DayColumnProps) {
  const t = useTranslations('booking');
  const canvasRef = useRef<HTMLDivElement>(null);

  /**
   * The faint `⊕ 9:15 AM` label that shows which slot a click would land on.
   * Suppressed while any drag is running — during a drag the pending block is
   * already saying where the pointer is, and two answers is one too many.
   */
  const [hoverMinute, setHoverMinute] = useState<number | null>(null);
  const isDragging = pending !== null || dragging !== null;

  /**
   * Nothing new can be created here — the clinic is shut, or the day has gone.
   * Existing appointments still render and still open, because a past day is a
   * record worth reading even when it cannot be added to.
   */
  const unbookable = isClosed || isPast;

  const height = gridHeight(hours.openMinute, hours.closeMinute, pxPerSlot);
  const nowMinute = nowLineMinute(date, now);

  /**
   * True when a slot already has an appointment in it.
   *
   * Half-open on both sides, the same rule the validator uses, so the slot that
   * begins exactly where an appointment ends counts as free.
   */
  function isSlotBooked(minute: number): boolean {
    const end = minute + SLOT_MINUTES;
    return appointments.some(
      (row) => minute < row.startMinute + row.durationMinutes && row.startMinute < end,
    );
  }

  function readHoverMinute(event: ReactPointerEvent<HTMLDivElement>): void {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Nothing to advertise over an existing booking: a click there selects the
    // appointment, it does not create one, so a `⊕ 9:15 AM` label would be
    // promising something that will not happen — and it would sit on top of the
    // client's name.
    if ((event.target as HTMLElement).closest('[data-appointment-id]')) {
      setHoverMinute(null);
      return;
    }

    const minute = floorToSlot(
      pointerToMinute(event.clientY, canvas.getBoundingClientRect().top, hours.openMinute, hours.closeMinute, pxPerSlot),
    );

    // Also checked by occupancy, not only by what is under the pointer: the
    // label is drawn at the top of the slot, which can reach into a block even
    // when the pointer itself is in the gap beside one.
    setHoverMinute(isSlotBooked(minute) ? null : minute);
  }

  return (
    <div
      ref={canvasRef}
      data-day={date}
      className={cn('relative flex-1 select-none border-s border-border', unbookable && 'bg-muted/40')}
      style={{ height }}
      onPointerDown={(event) => {
        // Only a press on empty canvas creates. A press that started on a block
        // has already been stopped by the block's own handler.
        if (event.button !== 0 || unbookable) return;
        if ((event.target as HTMLElement).closest('[data-appointment-id]')) return;
        onCreateGesture(date, event);
      }}
      onPointerMove={(event) => {
        // Nothing to advertise on a day that cannot be booked, and tracking the
        // pointer across one would re-render on every move to draw nothing.
        if (isDragging || unbookable) {
          setHoverMinute(null);
          return;
        }
        readHoverMinute(event);
      }}
      onPointerLeave={() => setHoverMinute(null)}
    >
      {/*
        Slot rules. Solid on the hour, hairline on the quarter — and once the
        grid is compressed, the quarters are dropped entirely. A line every 15
        minutes at 20px a slot reads as grey corduroy and buries the hours; with
        only the hours drawn, the same geometry looks far more open.
      */}
      {Array.from({ length: Math.ceil((hours.closeMinute - hours.openMinute) / SLOT_MINUTES) }, (_, index) => {
        const minute = hours.openMinute + index * SLOT_MINUTES;
        const onTheHour = minute % 60 === 0;
        const onTheHalf = minute % 30 === 0;

        if (!onTheHour && pxPerSlot < SUBDIVISION_MIN_PX_PER_SLOT && !onTheHalf) return null;

        return (
          <div
            key={minute}
            aria-hidden
            className={cn(
              'absolute start-0 end-0 border-t',
              onTheHour ? 'border-border' : 'border-border/25',
            )}
            style={{ top: minuteToY(minute, hours.openMinute, pxPerSlot) }}
          />
        );
      })}

      {/* Hover affordance: the time a click here would book. */}
      {hoverMinute !== null && !unbookable && (
        <div
          aria-hidden
          className="pointer-events-none absolute start-1 z-10 flex items-center gap-1 text-xs font-medium text-muted-foreground"
          style={{ top: minuteToY(hoverMinute, hours.openMinute, pxPerSlot), height: pxPerSlot }}
        >
          <span aria-hidden>⊕</span>
          <span dir="auto" className="tabular-nums">
            {formatMinute(locale, date, hoverMinute)}
          </span>
        </div>
      )}

      {appointments.map((appointment) => {
        const box = blockBox(appointment, hours.openMinute, pxPerSlot);

        return (
          <AppointmentBlock
            key={appointment.id}
            appointment={appointment}
            locale={locale}
            top={box.top}
            height={box.height}
            completed={completedIds.has(appointment.id)}
            selected={selectedId === appointment.id || highlightId === appointment.id}
            dimmed={dimmedIds.has(appointment.id)}
            dragState={dragging?.id === appointment.id ? (dragging.valid ? 'valid' : 'invalid') : null}
            onSelect={onSelect}
            onOpen={onOpen}
            onMovePointerDown={onMovePointerDown}
            onResizePointerDown={onResizePointerDown}
          />
        );
      })}

      {/*
        The drag-to-create preview. Rendered only once the pointer has actually
        travelled — see the threshold in `useCalendarGestures`, which keeps a
        plain click from flashing a block.
      */}
      {pending && pending.date === date && (
        <>
          <div
            aria-hidden
            className={cn(
              'pointer-events-none absolute start-0.5 end-0.5 z-20 rounded-md border-2 border-dashed',
              pending.valid ? 'border-emerald-500 bg-emerald-500/15' : 'border-destructive bg-destructive/15',
            )}
            style={{
              top: minuteToY(pending.startMinute, hours.openMinute, pxPerSlot),
              height: Math.max(blockBox(pending, hours.openMinute, pxPerSlot).height, 2),
            }}
          />

          {/*
            The times being dragged out, as a floating chip rather than text
            inside the preview.

            A quarter-hour drag is barely twenty pixels tall, so a label placed
            inside it would be clipped away at exactly the moment the times
            matter most — the beginning of every drag. Sitting outside the block
            and centred on it, the chip stays legible at any length, and its
            solid background keeps it readable over the rules and any
            neighbouring appointment.
          */}
          <div
            aria-hidden
            className={cn(
              'pointer-events-none absolute start-1/2 z-30 -translate-x-1/2 -translate-y-1/2 rounded-md border px-2 py-1',
              'bg-popover text-xs font-semibold whitespace-nowrap shadow-md tabular-nums',
              pending.valid ? 'border-emerald-500/60 text-foreground' : 'border-destructive/60 text-destructive',
            )}
            style={{
              top:
                minuteToY(pending.startMinute, hours.openMinute, pxPerSlot) +
                blockBox(pending, hours.openMinute, pxPerSlot).height / 2,
            }}
          >
            <span dir="auto">
              {formatMinuteRange(locale, date, pending.startMinute, pending.startMinute + pending.durationMinutes)}
            </span>
            <span className="ms-1.5 font-normal text-muted-foreground">
              {formatDuration(pending.durationMinutes, {
                hour: (n) => t('duration.hours', { count: n }),
                minute: (n) => t('duration.minutes', { count: n }),
              })}
            </span>
          </div>
        </>
      )}

      {/* Now-line, drawn only on today. */}
      {nowMinute !== null && nowMinute >= hours.openMinute && nowMinute <= hours.closeMinute && (
        <div
          aria-label={t('now')}
          className="pointer-events-none absolute start-0 end-0 z-20 border-t-2 border-red-500"
          style={{ top: minuteToY(nowMinute, hours.openMinute, pxPerSlot) }}
        >
          <span className="absolute -top-1 start-0 size-2 rounded-full bg-red-500" />
        </div>
      )}
    </div>
  );
}
