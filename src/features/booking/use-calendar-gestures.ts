'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { SLOT_MINUTES } from '@/lib/time-constants';

import {
  DRAG_THRESHOLD_PX,
  clampToDay,
  floorToSlot,
  pointerToMinute,
  snapToSlot,
} from './geometry';
import { dateAtX, type ColumnBounds } from './rtl';
import { type CalendarAppointment } from './types';
import { type WallClock } from './completed';
import {
  DEFAULT_DURATION_MINUTES,
  movesIntoThePast,
  validateBooking,
  type ClinicHours,
  type ExistingAppointment,
} from './validation';

/**
 * Every pointer gesture on the grid: drag out a new range, move an appointment,
 * resize one.
 *
 * ## Why the in-flight gesture lives in a ref
 *
 * A press is not a drag. If pointer-down set React state, a plain click would
 * render a preview block for one frame before the picker opened — a visible
 * flash on every single booking — and a hand that trembles two pixels would be
 * read as a drag. So the press is recorded in a ref, which re-renders nothing,
 * and only once the pointer has travelled past {@link DRAG_THRESHOLD_PX} is
 * anything pushed to state. Below the threshold the gesture is still a click and
 * the grid still looks idle.
 *
 * ## Why window listeners
 *
 * A drag routinely leaves the element it started on — off the end of a column,
 * over a neighbouring day, past the edge of the grid. Listening on `window` for
 * the rest of the gesture means the release is caught wherever it happens, so a
 * drag cannot get stuck "held down" because the pointer left the canvas.
 */

/** A range being dragged out on empty canvas, before any client is chosen. */
export type PendingRange = {
  date: string;
  startMinute: number;
  durationMinutes: number;
  valid: boolean;
};

/** Where a booking should be created, once the gesture ends. */
export type BookingRequest = {
  date: string;
  startMinute: number;
  durationMinutes: number;
};

/** An appointment mid-move or mid-resize, as it should currently be drawn. */
export type DragPreview = {
  id: string;
  date: string;
  startMinute: number;
  durationMinutes: number;
  valid: boolean;
};

type CreateGesture = {
  date: string;
  gridTop: number;
  originClientY: number;
  anchorMinute: number;
  moved: boolean;
};

type MoveGesture = {
  appointment: CalendarAppointment;
  mode: 'move' | 'resize';
  gridTop: number;
  originClientY: number;
  originClientX: number;
  /**
   * Every day column on screen, so a move can work out which day the pointer is
   * over. Measured rather than computed, which means RTL needs no special case:
   * the browser has already laid the columns out right-to-left and their rects
   * say so.
   */
  columns: ColumnBounds[];
  moved: boolean;
};

export type CalendarGesturesOptions = {
  hours: ClinicHours;
  /** Everything on screen, used for live valid/invalid feedback during a drag. */
  existing: readonly ExistingAppointment[];
  /**
   * Whose diary a range is checked against. The clinic has one practitioner, so
   * this is the same for every appointment — it exists because the overlap rule
   * is keyed on it, not because anything chooses it.
   */
  practitionerId: string;
  /**
   * Today, so a drag onto a date that has already gone paints red like any
   * other invalid candidate. Null until the shared clock has ticked, which
   * skips the rule rather than guessing at it.
   */
  today: string | null;
  /**
   * The wall clock, for the rule that a move may not land in the past. Finer
   * than `today`, which bounds *creating* to whole dates: dragging a card to
   * nine o'clock this morning at three in the afternoon is a different question
   * from dragging it to yesterday, and both are refused.
   */
  now: WallClock | null;
  /**
   * The slot height currently on screen.
   *
   * The grid is fitted to the panel, so this is not the module default — and if
   * the gestures used the default while the columns were drawn at another
   * scale, every drag would land on a different slot from the one under the
   * pointer.
   */
  pxPerSlot: number;
  /** Called on release of a create gesture — click or drag, both land here. */
  onRequestBooking: (request: BookingRequest, pointer: { x: number; y: number }) => void;
  /** Called on release of a move or resize, only when something actually changed. */
  onCommitMove: (appointment: CalendarAppointment, next: BookingRequest) => void;
};

export function useCalendarGestures({
  hours,
  existing,
  practitionerId,
  today,
  now,
  pxPerSlot,
  onRequestBooking,
  onCommitMove,
}: CalendarGesturesOptions) {
  const [pending, setPending] = useState<PendingRange | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);

  const createRef = useRef<CreateGesture | null>(null);
  const moveRef = useRef<MoveGesture | null>(null);

  /**
   * Latest values, so the window listeners never close over a stale render — an
   * optimistic write landing mid-drag must be visible to the validity check.
   *
   * Written in an effect rather than during render: a ref is mutable state, and
   * touching it while rendering is not safe under concurrent rendering, where a
   * render can be thrown away. The effect runs before any pointer event can fire.
   */
  const latest = useRef({ hours, existing, practitionerId, today, now, pxPerSlot, onRequestBooking, onCommitMove });

  useEffect(() => {
    latest.current = { hours, existing, practitionerId, today, now, pxPerSlot, onRequestBooking, onCommitMove };
  });

  const isValid = useCallback(
    (candidate: { practitionerId: string; date: string; startMinute: number; durationMinutes: number }, excludeId?: string) => {
      const { hours: currentHours, existing: rows, today: currentToday } = latest.current;
      return validateBooking({ ...candidate, excludeId, today: currentToday }, rows, currentHours) === null;
    },
    [],
  );

  /** Reads a pointer's y as a snapped minute-of-day on the gesture's own grid. */
  const minuteAt = useCallback((clientY: number, gridTop: number, snap: (minute: number) => number) => {
    const { hours: currentHours, pxPerSlot: scale } = latest.current;
    return snap(pointerToMinute(clientY, gridTop, currentHours.openMinute, currentHours.closeMinute, scale));
  }, []);

  const beginCreate = useCallback(
    (date: string, event: ReactPointerEvent<HTMLDivElement>) => {
      const gridTop = event.currentTarget.getBoundingClientRect().top;

      createRef.current = {
        date,
        gridTop,
        originClientY: event.clientY,
        // Floor, not round: a click books the slot the pointer is *inside*.
        anchorMinute: minuteAt(event.clientY, gridTop, floorToSlot),
        moved: false,
      };

      const handleMove = (moveEvent: PointerEvent) => {
        const gesture = createRef.current;
        if (!gesture) return;

        // Still a click until the pointer has actually travelled.
        if (!gesture.moved && Math.abs(moveEvent.clientY - gesture.originClientY) < DRAG_THRESHOLD_PX) return;
        gesture.moved = true;

        const current = minuteAt(moveEvent.clientY, gesture.gridTop, snapToSlot);
        const startMinute = Math.min(gesture.anchorMinute, current);
        // At least one slot, so a drag that barely moves is still bookable.
        const endMinute = Math.max(gesture.anchorMinute + SLOT_MINUTES, current);

        const range = { date: gesture.date, startMinute, durationMinutes: endMinute - startMinute };

        setPending({
          ...range,
          // No client yet, so rule 5 is skipped — exactly what `clientId`'s
          // optionality is for.
          valid: isValid({ ...range, practitionerId: latest.current.practitionerId }),
        });
      };

      const handleUp = (upEvent: PointerEvent) => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
        window.removeEventListener('pointercancel', handleUp);

        const gesture = createRef.current;
        createRef.current = null;
        setPending(null);

        if (!gesture) return;

        const { hours: currentHours } = latest.current;

        let request: BookingRequest;

        if (gesture.moved) {
          const current = minuteAt(upEvent.clientY, gesture.gridTop, snapToSlot);
          const startMinute = Math.min(gesture.anchorMinute, current);
          const endMinute = Math.max(gesture.anchorMinute + SLOT_MINUTES, current);
          request = { date: gesture.date, startMinute, durationMinutes: endMinute - startMinute };
        } else {
          // A plain click: the default two-slot booking, tall enough to show the
          // client's name and the time.
          const durationMinutes = DEFAULT_DURATION_MINUTES;
          request = {
            date: gesture.date,
            startMinute: clampToDay(gesture.anchorMinute, durationMinutes, currentHours.openMinute, currentHours.closeMinute),
            durationMinutes,
          };
        }

        // Nothing is written here. The picker opens, and only choosing a client
        // creates anything — so an abandoned gesture leaves no trace.
        latest.current.onRequestBooking(request, { x: upEvent.clientX, y: upEvent.clientY });
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
      window.addEventListener('pointercancel', handleUp);
    },
    [isValid, minuteAt],
  );

  const beginMove = useCallback(
    (mode: 'move' | 'resize') => (appointment: CalendarAppointment, event: ReactPointerEvent<HTMLElement>) => {
      const column = (event.currentTarget as HTMLElement).closest('[data-day]');
      if (!column) return;

      const gridTop = column.getBoundingClientRect().top;

      /**
       * All the columns of *this* timeline, so a move can cross days.
       *
       * Scoped to `[data-timeline]` rather than the whole document: the month
       * grid also marks its cells with `data-day`, and picking those up would
       * let a week drag land on a date that is not even on screen.
       */
      const columns: ColumnBounds[] = Array.from(
        column.closest('[data-timeline]')?.querySelectorAll<HTMLElement>('[data-day]') ?? [],
      ).flatMap((element) => {
        const date = element.dataset.day;
        if (!date) return [];

        const rect = element.getBoundingClientRect();
        return [{ date, start: rect.left, end: rect.right }];
      });

      moveRef.current = {
        appointment,
        mode,
        gridTop,
        originClientY: event.clientY,
        originClientX: event.clientX,
        columns,
        moved: false,
      };

      /**
       * Takes the gesture as an argument rather than reading `moveRef`.
       *
       * It used to read the ref, and `handleUp` clears the ref before computing
       * the final position — so the last call returned the appointment
       * unchanged, the "did anything move?" guard below saw no difference, and
       * every drag silently discarded itself. Passing the gesture in makes that
       * ordering impossible to get wrong.
       */
      const compute = (clientY: number, clientX: number, gesture: MoveGesture): BookingRequest => {
        const { hours: currentHours } = latest.current;

        if (gesture.mode === 'resize') {
          // The start is fixed; the end follows the pointer, never shorter than
          // one slot and never past closing time. A resize stays on its own day —
          // an appointment that ended on a different date from the one it began
          // on is not a thing this calendar can represent.
          const end = Math.min(
            Math.max(minuteAt(clientY, gesture.gridTop, snapToSlot), appointment.startMinute + SLOT_MINUTES),
            currentHours.closeMinute,
          );
          return {
            date: appointment.date,
            startMinute: appointment.startMinute,
            durationMinutes: end - appointment.startMinute,
          };
        }

        // A move keeps the duration, slides the block vertically for the time,
        // and takes its date from whichever column the pointer is over — which
        // is what lets a booking be dragged from Monday to Wednesday. Off the
        // columns entirely, it keeps the day it started on.
        const delta = snapToSlot(
          minuteAt(clientY, gesture.gridTop, snapToSlot) - minuteAt(gesture.originClientY, gesture.gridTop, snapToSlot),
        );

        return {
          date: dateAtX(clientX, gesture.columns) ?? appointment.date,
          startMinute: clampToDay(
            appointment.startMinute + delta,
            appointment.durationMinutes,
            currentHours.openMinute,
            currentHours.closeMinute,
          ),
          durationMinutes: appointment.durationMinutes,
        };
      };

      const handleMove = (moveEvent: PointerEvent) => {
        const gesture = moveRef.current;
        if (!gesture) return;

        // Distance in *either* axis, not just vertical. A drag straight across
        // to the next day changes no y at all, and a vertical-only threshold
        // would never let that gesture start.
        const travelled = Math.max(
          Math.abs(moveEvent.clientY - gesture.originClientY),
          Math.abs(moveEvent.clientX - gesture.originClientX),
        );

        if (!gesture.moved && travelled < DRAG_THRESHOLD_PX) return;
        gesture.moved = true;

        const next = compute(moveEvent.clientY, moveEvent.clientX, gesture);

        setDragPreview({
          id: appointment.id,
          ...next,
          // A drag into an hour that has gone paints red exactly like one onto a
          // closed day or another appointment, so the refusal is visible under
          // the pointer rather than only after the drop.
          valid:
            !movesIntoThePast(next, appointment, latest.current.now) &&
            isValid({ ...next, practitionerId: appointment.practitionerId }, appointment.id),
        });
      };

      const handleUp = (upEvent: PointerEvent) => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
        window.removeEventListener('pointercancel', handleUp);

        const gesture = moveRef.current;
        moveRef.current = null;
        setDragPreview(null);

        // Below the threshold this was a click, which only selects. Committing
        // here would write an identical row on every single click.
        if (!gesture?.moved) return;

        const next = compute(upEvent.clientY, upEvent.clientX, gesture);

        // Nothing actually changed — a drag out and back. Writing here would
        // send an identical row to the server for no reason. The date is part of
        // the comparison now that a move can cross days.
        if (
          next.date === appointment.date &&
          next.startMinute === appointment.startMinute &&
          next.durationMinutes === appointment.durationMinutes
        ) {
          return;
        }

        latest.current.onCommitMove(appointment, next);
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
      window.addEventListener('pointercancel', handleUp);
    },
    [isValid, minuteAt],
  );

  return {
    pending,
    dragPreview,
    beginCreate,
    beginMovePointerDown: beginMove('move'),
    beginResizePointerDown: beginMove('resize'),
  };
}
