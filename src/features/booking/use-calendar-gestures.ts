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
import {
  DEFAULT_DURATION_MINUTES,
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
  originClientX: number;
  anchorMinute: number;
  moved: boolean;
  /**
   * Whether this gesture is allowed to paint a range yet.
   *
   * `true` from the outset for a mouse or a pen, which is what the grid has
   * always done. On a finger it starts `false` and only a deliberate hold turns
   * it on — see {@link HOLD_TO_PAINT_MS}.
   */
  armed: boolean;
  /** `'mouse' | 'pen' | 'touch'`, as reported by the originating event. */
  pointerType: string;
  /**
   * Whether `pointercancel` has already ended this gesture's pointer stream.
   *
   * Once it fires there are no more `pointermove`s and no `pointerup` for this
   * pointer — the gesture has to be carried, and finished, on the touch events
   * instead. See `handleCancel` for why a cancel no longer means the gesture is
   * over.
   */
  pointerCancelled: boolean;
  /**
   * The last coordinates this gesture actually saw, for the release to fall
   * back on.
   *
   * `pointerup` is not reliably positioned on touch: WebKit has shipped
   * versions where the release event for a finger carries `0, 0` rather than
   * the point the finger left, and the picker is anchored to exactly those
   * coordinates. Anchored to the origin it is clamped to the viewport margin
   * and opens in the corner of the screen instead of under the hand — present
   * and correct, but nowhere near the range just painted.
   */
  lastClientX: number;
  lastClientY: number;
};

/**
 * How long a finger must rest on empty canvas before it is painting a range
 * rather than starting a scroll.
 *
 * ## Why the grid needed this at all
 *
 * Dragging out a booking was impossible on a touch screen, and the reason is
 * structural rather than a missing handler. The day column has to stay
 * pannable — a week that cannot be scrolled is one screen of day — so it cannot
 * claim `touch-action: none` the way the drag and resize grips do. That leaves
 * the browser free to take any finger that travels, and iOS does: it claims the
 * gesture for panning and fires `pointercancel`. `handleCancel` treats that as
 * an abandoned gesture and writes nothing, which is correct — it is what stops
 * *scrolling* the calendar from offering to book — but it also meant every
 * attempt to paint a range was thrown away at the moment it began. On a mouse,
 * where `pointercancel` essentially never fires, the same code worked.
 *
 * ⚠ **This is why the grid books in DevTools and not on the hardware.** Blink's
 * device emulation synthesises a pointer stream from the mouse; it does not
 * reproduce the browser competing for the gesture, so `pointercancel` never
 * arrives and the mouse path runs unchanged. The failure exists only where a
 * real compositor is deciding whether the finger belongs to the page or to the
 * app — which is to say, only on the device.
 *
 * ## The gesture
 *
 * A press that stays still is unambiguous: nobody starts a scroll by holding
 * perfectly still. So a finger arms the paint by resting for this long within
 * {@link HOLD_TOLERANCE_PX}, and from that moment `preventDefault()` on
 * `touchmove` keeps the gesture (see `armTouchGesture`). Move before then and
 * it was a scroll, which is left entirely to the browser.
 *
 * 450ms is the same order as the platform's own long-press and comfortably
 * above dnd-kit's 150ms on the planner board — the board's handle already
 * reserves its gesture with `touch-action`, so it can afford to be quicker;
 * this one is competing with a scroller and has to be certain.
 */
const HOLD_TO_PAINT_MS = 450;

/** How far a finger may drift during the hold and still be holding still. */
const HOLD_TOLERANCE_PX = 10;

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
  const latest = useRef({ hours, existing, practitionerId, pxPerSlot, onRequestBooking, onCommitMove });

  useEffect(() => {
    latest.current = { hours, existing, practitionerId, pxPerSlot, onRequestBooking, onCommitMove };
  });

  const isValid = useCallback(
    (candidate: { practitionerId: string; date: string; startMinute: number; durationMinutes: number }, excludeId?: string) => {
      const { hours: currentHours, existing: rows } = latest.current;
      // No floor: staff may draw a booking on any date, so the only things that
      // paint a drag clay are a closed day, the clinic's hours and a clash.
      return validateBooking({ ...candidate, excludeId, earliestDate: null }, rows, currentHours) === null;
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

      /*
        A finger is not allowed to paint until it has held still; anything else
        keeps the behaviour the grid has always had. `pen` sits with `mouse`
        rather than with `touch`: a stylus is aimed, so it has no scroll gesture
        to be confused with, and making an Apple Pencil wait 450ms to draw a
        range would be a regression invented for no one.
      */
      const isFinger = event.pointerType === 'touch';

      createRef.current = {
        date,
        gridTop,
        originClientY: event.clientY,
        originClientX: event.clientX,
        // Floor, not round: a click books the slot the pointer is *inside*.
        anchorMinute: minuteAt(event.clientY, gridTop, floorToSlot),
        moved: false,
        armed: !isFinger,
        lastClientX: event.clientX,
        lastClientY: event.clientY,
        pointerType: event.pointerType,
        pointerCancelled: false,
      };

      /*
        ── Taking the gesture back from the browser ──

        `preventDefault()` on `touchmove` is the only thing that stops iOS
        panning a scroller mid-gesture; `touch-action` cannot be used here
        because the column has to stay pannable, and `setPointerCapture` decides
        where events are *delivered*, not whether the compositor scrolls.

        ⚠ **`{ passive: false }` is load-bearing.** Browsers default
        `touchmove` listeners on window and document to passive, and a passive
        listener's `preventDefault()` is a silent no-op — no error, no warning
        in normal use, the page simply keeps scrolling. Registering without it
        would look exactly like this fix while changing nothing.

        Registered at pointer-down rather than when the hold succeeds, because a
        listener added after the browser has already begun scrolling is too
        late to stop it. It is inert until `armed`, so an ordinary scroll that
        starts on the grid passes through untouched.
      */
      const handleTouchMove = (touchEvent: TouchEvent) => {
        const gesture = createRef.current;
        if (!gesture) return;

        if (gesture.armed && touchEvent.cancelable) touchEvent.preventDefault();

        /*
          After a `pointercancel` this is the only movement this gesture will
          ever see again — the pointer stream is finished for good — so the
          drift test and the range painting have to run from here instead. While
          the pointer stream is alive `handleMove` is doing it and this would
          only be duplicating the work.
        */
        if (gesture.pointerCancelled) {
          const touch = touchEvent.touches[0];
          if (touch) advance(touch.clientX, touch.clientY);
        }
      };
      window.addEventListener('touchmove', handleTouchMove, { passive: false });

      /*
        The hold. Arming paints the anchor slot straight away, so the range
        appears under the finger at the instant the gesture is taken — without
        it the hold succeeds invisibly and the first 15 minutes of the drag look
        like nothing is happening.
      */
      const holdTimer = isFinger
        ? window.setTimeout(() => {
            const gesture = createRef.current;
            if (!gesture || gesture.moved) return;

            gesture.armed = true;

            const range = {
              date: gesture.date,
              startMinute: gesture.anchorMinute,
              durationMinutes: SLOT_MINUTES,
            };
            setPending({
              ...range,
              valid: isValid({ ...range, practitionerId: latest.current.practitionerId }),
            });
          }, HOLD_TO_PAINT_MS)
        : null;

      /**
       * Advance the gesture to a point, whichever stream that point came from.
       *
       * A `function` declaration rather than a `const`, so it is hoisted above
       * `handleTouchMove`, which is defined earlier and calls it.
       */
      function advance(clientX: number, clientY: number) {
        const gesture = createRef.current;
        if (!gesture) return;

        // Recorded on every move, armed or not, so the release always has a real
        // point to fall back on. See `lastClientX` on the gesture type.
        gesture.lastClientX = clientX;
        gesture.lastClientY = clientY;

        /*
          Before a finger has armed, travel means this was a scroll all along:
          drop the hold and let the browser have the gesture. Measured on both
          axes, because a horizontal swipe across the week is a scroll too and
          the vertical-only test below would not see it.
        */
        if (!gesture.armed) {
          const drift = Math.hypot(clientX - gesture.originClientX, clientY - gesture.originClientY);
          if (drift > HOLD_TOLERANCE_PX) {
            if (holdTimer !== null) window.clearTimeout(holdTimer);
            teardown();
          }
          return;
        }

        // Still a click until the pointer has actually travelled.
        if (!gesture.moved && Math.abs(clientY - gesture.originClientY) < DRAG_THRESHOLD_PX) return;
        gesture.moved = true;

        const current = minuteAt(clientY, gesture.gridTop, snapToSlot);
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
      }

      const handleMove = (moveEvent: PointerEvent) => {
        advance(moveEvent.clientX, moveEvent.clientY);
      };

      /**
       * Detach everything this gesture registered and forget it.
       *
       * One function because the listeners now come in two families — pointer
       * and touch — and a release path that forgot the `touchmove` one would
       * leave a live `preventDefault()` on the window, which is a calendar that
       * has stopped scrolling.
       */
      function teardown() {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
        window.removeEventListener('pointercancel', handleCancel);
        window.removeEventListener('touchmove', handleTouchMove);
        window.removeEventListener('touchend', handleTouchEnd);
        window.removeEventListener('touchcancel', handleTouchCancel);
        if (holdTimer !== null) window.clearTimeout(holdTimer);

        createRef.current = null;
        setPending(null);
      }

      /**
       * The gesture the browser took away from us, which is not a booking.
       *
       * ⚠ This used to be `handleUp` itself, and on a touch screen that made the
       * calendar unusable. A finger that starts on empty grid and scrolls the day
       * fires `pointercancel` the moment the browser claims the gesture for
       * panning — with `moved` still false, because the move handler bails below
       * the drag threshold and never gets another event. `handleUp` reads that as
       * a plain click and opens the booking picker. So on a phone, *scrolling the
       * calendar* offered to book an appointment.
       *
       * A cancelled gesture is one the user did not finish. It tears down and
       * writes nothing. Nothing changes for a mouse, where `pointercancel`
       * essentially never fires.
       *
       * ⚠ **But it must not tear down an unarmed *finger*, and that is what
       * made hold-to-book impossible on the hardware.**
       *
       * `teardown` clears the hold timer. On iOS the compositor fires
       * `pointercancel` speculatively — the moment it starts considering the
       * touch for a scroller, which on a pannable grid is almost immediately and
       * well inside the 450ms hold. The finger has not moved and nothing has
       * scrolled, but the timer is already gone, so the hold could never once
       * reach the line that arms it. Blink's device emulation never fires this,
       * which is the whole of why the gesture worked in DevTools and not on an
       * iPad.
       *
       * So an unarmed touch keeps its hold. Nothing is lost by waiting: if this
       * really was a scroll the finger travels, and the drift test in `advance`
       * ends the gesture then, exactly as it did before. If the finger never
       * travels, nothing scrolls — a still finger cannot pan anything — and the
       * hold is precisely what the reader meant by holding still.
       *
       * What the cancel does cost is the pointer stream: there will be no
       * further `pointermove` and no `pointerup` for this pointer, ever. From
       * here the gesture runs on `touchmove` and finishes on `touchend`, which
       * is what `pointerCancelled` switches on.
       *
       * Once *armed*, a cancel is still a teardown, unchanged: `handleTouchMove`
       * is holding the gesture with `preventDefault()` by then, so the browser
       * has no reason to claim it and a cancel that arrives anyway — a second
       * finger, a system gesture, a call coming in — really is an interruption.
       */
      const handleCancel = () => {
        const gesture = createRef.current;

        if (!gesture || gesture.armed || gesture.pointerType !== 'touch') {
          teardown();
          return;
        }

        gesture.pointerCancelled = true;
      };

      /**
       * Finish the gesture and ask for the booking.
       *
       * Takes the release point rather than an event, because there are now two
       * ways a create gesture can end: `pointerup` in the ordinary case, and
       * `touchend` when `pointercancel` has already killed the pointer stream
       * (see `handleCancel`). Both land here so the two paths cannot drift.
       *
       * Safe to reach twice. An uncancelled touch fires *both* `pointerup` and
       * `touchend`; whichever arrives first tears down and clears `createRef`,
       * and the second finds nothing and returns below.
       */
      function completeGesture(release: { x: number; y: number } | null) {
        const gesture = createRef.current;

        /*
          Read before the teardown clears it, since `teardown` is what now owns
          forgetting the gesture.
        */
        teardown();

        if (!gesture) return;

        const { hours: currentHours } = latest.current;

        /*
          Where the gesture actually ended.

          The release event's own coordinates where they are real, and the last
          point the gesture saw where they are not — see `lastClientX` on the
          gesture type for the WebKit behaviour this guards. `0, 0` is the
          sentinel because it is both the value a mis-reported touch release
          carries and a point no real release inside the grid can produce: the
          grid never reaches the very corner of the viewport, since the shell's
          rail and the calendar's own toolbar are always above and beside it.

          `null` — a `touchend` that carried no `changedTouches` — falls back the
          same way.
        */
        const usable = release !== null && !(release.x === 0 && release.y === 0);
        const releaseX = usable ? release.x : gesture.lastClientX;
        const releaseY = usable ? release.y : gesture.lastClientY;

        let request: BookingRequest;

        if (gesture.moved) {
          const current = minuteAt(releaseY, gesture.gridTop, snapToSlot);
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
        latest.current.onRequestBooking(request, { x: releaseX, y: releaseY });
      }

      const handleUp = (upEvent: PointerEvent) => {
        completeGesture({ x: upEvent.clientX, y: upEvent.clientY });
      };

      /**
       * The touch stream's own release, for the gesture whose pointer stream
       * `pointercancel` already ended.
       *
       * Registered for every touch gesture rather than only the cancelled ones,
       * because by the time a cancel arrives it is too late to start listening —
       * and it costs nothing: on an uncancelled touch `pointerup` gets there
       * first, tears down, and this finds no gesture to finish.
       */
      const handleTouchEnd = (touchEvent: TouchEvent) => {
        const touch = touchEvent.changedTouches[0];
        completeGesture(touch ? { x: touch.clientX, y: touch.clientY } : null);
      };

      /**
       * A touch the system took away — a second finger, a call, the app going
       * to the background. Unlike `pointercancel` this one is genuine, so it
       * abandons the gesture and writes nothing.
       */
      const handleTouchCancel = () => {
        teardown();
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
      window.addEventListener('pointercancel', handleCancel);
      window.addEventListener('touchend', handleTouchEnd);
      window.addEventListener('touchcancel', handleTouchCancel);
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
          // An hour of today that has already gone is a legitimate drop — the
          // clinic rearranges the morning in the afternoon. Only a closed day, a
          // date that has gone and a clash still paint red.
          valid: isValid({ ...next, practitionerId: appointment.practitionerId }, appointment.id),
        });
      };

      /**
       * Same split as `beginCreate`: a gesture the browser took away is not a
       * move, so it tears down and commits nothing.
       *
       * This path was already safe by accident — `handleUp` returns early unless
       * the pointer travelled, and a cancel usually arrives before that — but it
       * was safe for the wrong reason, and a cancel *after* the threshold would
       * have written a move the user never finished. Saying it explicitly costs
       * one function and makes both gestures read the same way.
       */
      const handleCancel = () => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
        window.removeEventListener('pointercancel', handleCancel);

        moveRef.current = null;
        setDragPreview(null);
      };

      const handleUp = (upEvent: PointerEvent) => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
        window.removeEventListener('pointercancel', handleCancel);

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

      /*
        Capture the pointer on the element that started the gesture.

        On touch this is what keeps a drag a drag. Without it the browser is free
        to reinterpret the finger as a pan the moment it travels, which cancels
        the move halfway through; with it, every subsequent event for this
        pointer is delivered here until it is released. `touch-action: none` on
        the grip (see `AppointmentBlock`) is the other half — capture decides
        where the events go, `touch-action` decides whether the browser competes
        for them at all.

        Wrapped because capture throws if the pointer has already been released,
        which is a race a fast tap can win. Losing capture is not fatal — the
        window listeners still work for a mouse — so it must not take the gesture
        down with it.
      */
      try {
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      } catch {
        // Nothing to do: the gesture proceeds uncaptured, as it always did.
      }

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
      window.addEventListener('pointercancel', handleCancel);
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
