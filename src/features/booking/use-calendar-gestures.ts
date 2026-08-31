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

/**
 * The custom properties the free part of a drag is written to, straight onto the
 * card's own element.
 *
 * ## Why this is not React state
 *
 * It was, for one revision, and it stuttered. A pointer frame that goes through
 * `setState` re-renders the calendar: seven columns, every block on them, the
 * preview memo, and the validity check over every appointment on screen — sixty
 * times a second, for a value whose only job is to move one card a few pixels.
 * The grid could not keep up with the finger, which is exactly the "it got
 * stuck" that a drag must never do.
 *
 * So the two halves of the drag are split by how often they change. The
 * *snapped* half — the slot, the day, whether the drop is legal — is React
 * state, and it changes once per slot crossed, which is rare enough to render
 * properly. The *free* half is these two custom properties, written directly to
 * the element and read by `.calendar-dragging` in `globals.css`. No render, no
 * diff, no reconciliation: a composited transform and nothing else.
 *
 * React never sets them, which is what keeps the two from fighting. A re-render
 * for a snap change leaves whatever the pointer last wrote untouched, so the
 * card cannot flick back to a stale offset for a frame at the very moment it
 * crosses a slot boundary.
 */
const DRAG_X = '--drag-x';
const DRAG_Y = '--drag-y';

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

/**
 * How long a finger must rest on an appointment before it is carrying it.
 *
 * ## Why a hold, and why the grip is gone
 *
 * Moving a booking on glass used to mean finding a 28px strip down the block's
 * leading edge — the one surface on the card that could claim
 * `touch-action: none`, because the block itself cannot: it fills a grid that
 * has to stay pannable, and a week that cannot be scrolled is one screen of
 * day. So the gesture was reserved by a piece of chrome, and on a 30-minute
 * booking that chrome took a quarter of the card away from the client's name.
 *
 * The planner already answered this — see `.planner-holding` and
 * `HOLD_TO_DRAG_MS` in `board-dnd.tsx` — and the answer is that a hold needs no
 * strip. A finger resting still is not scrolling anything, so nothing has to be
 * taken from the browser until the hold is met; from that moment
 * `preventDefault()` on `touchmove` keeps the gesture, exactly as it does for a
 * range painted on empty canvas. The whole card is the handle, which is what
 * the request "hold on the appointment to move it" describes and what a finger
 * expects of a card it can move.
 *
 * The same 450ms as {@link HOLD_TO_PAINT_MS}, and deliberately the same number
 * rather than a shared constant: these are two gestures on one grid that a
 * reader will compare by feel, and if either is ever tuned it should be tuned
 * on its own evidence.
 *
 * A mouse and a pen are untouched — the block has always been draggable outright
 * on both, and making a pointer that cannot be confused with a scroll wait
 * 450ms would be a regression invented for no one.
 */
const HOLD_TO_DRAG_MS = 450;

type MoveGesture = {
  appointment: CalendarAppointment;
  mode: 'move' | 'resize';
  gridTop: number;
  originClientY: number;
  originClientX: number;
  /**
   * Whether this gesture may move the appointment yet. `true` from the outset
   * for a mouse or a pen; on a finger only the hold turns it on.
   */
  armed: boolean;
  /** `'mouse' | 'pen' | 'touch'`, as reported by the originating event. */
  pointerType: string;
  /**
   * Whether `pointercancel` has already ended this gesture's pointer stream, so
   * the rest of it has to run on the touch events. Same iOS behaviour
   * `beginCreate` documents at length on its own `pointerCancelled`.
   */
  pointerCancelled: boolean;
  /** The last point this gesture actually saw, for the release to fall back on. */
  lastClientX: number;
  lastClientY: number;
  /**
   * The card being dragged, so the free part of the movement can be written
   * straight to it — see {@link DRAG_X}. Held rather than looked up each frame:
   * a `querySelector` per pointer event is the kind of work this whole split
   * exists to avoid.
   *
   * ⚠ **It does not survive a change of day**, which is why nothing may assume
   * it is still the card on screen — see {@link cardOf}.
   */
  element: HTMLElement | null;
  /**
   * The snapped position last pushed to React, as one comparable string. What
   * keeps a drag inside a single slot from re-rendering the grid sixty times.
   */
  previewKey: string | null;
  /**
   * The element the press landed on, and the pointer that made it — what
   * `captureOnce` needs, kept because capture is now taken later than the event
   * that carries them.
   */
  origin: HTMLElement;
  pointerId: number;
  /** Whether capture has already been taken, so it is taken exactly once. */
  captured: boolean;
  /**
   * The timeline's own box and the card's resting box, both measured at
   * pointer-down, so the free movement can be held inside the grid — see
   * `paintDrag`. Measured once: they cannot change mid-gesture without a scroll,
   * and stopping the scroll is the point.
   */
  bounds: DOMRect | null;
  cardRect: DOMRect | null;
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
  /**
   * The appointment under a finger that is mid-hold, so the block can answer the
   * press while it is being made. State rather than a ref precisely because it
   * has to re-render: the whole point is that the card moves.
   */
  const [holdingId, setHoldingId] = useState<string | null>(null);

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

      /**
       * The scrollers this gesture is sitting inside, held still for as long as
       * it lasts.
       *
       * ## Why `preventDefault` is not the whole answer
       *
       * `handleTouchMove` stops the scroll on every move from the first one, and
       * on WebKit that is enough. It is not enough everywhere: a compositor is
       * entitled to decide a touch belongs to a scroller from `touchstart` and
       * the element's `touch-action` alone, before a single `touchmove` has been
       * delivered to anybody — and a scroll decided there cannot be prevented
       * afterwards. That is a pan starting under a card the reader is holding,
       * which is the one thing a hold must not allow.
       *
       * So the property is set on the scrollers themselves, which is the only
       * statement made early enough to be binding. Both are needed and neither
       * is redundant: this one keeps the gesture from ever being claimed, and
       * `preventDefault` keeps the browser from acting on it if it was.
       *
       * Every scrollable ancestor, not the timeline alone: the week sits in a
       * horizontal scroller inside a vertical one, and a lock on one of the two
       * would leave a booking dragged across days sliding the columns under
       * itself.
       *
       * Restored from what was actually there rather than to an empty string, so
       * a scroller that had its own inline value keeps it.
       */
      const locked: { element: HTMLElement; touchAction: string; overscroll: string }[] = [];

      const lockScrollers = (from: HTMLElement | null) => {
        for (let node = from; node && node !== document.body; node = node.parentElement) {
          const { overflowX, overflowY } = getComputedStyle(node);
          const scrolls = /auto|scroll/.test(overflowX) || /auto|scroll/.test(overflowY);
          if (!scrolls) continue;

          locked.push({
            element: node,
            touchAction: node.style.touchAction,
            overscroll: node.style.overscrollBehavior,
          });

          node.style.touchAction = 'none';
          // A locked scroller must not hand the gesture to the one above it —
          // or to the browser's own pull-to-refresh, which is the same swipe
          // downwards a booking is dragged with.
          node.style.overscrollBehavior = 'contain';
        }
      };

      const unlockScrollers = () => {
        for (const entry of locked) {
          entry.element.style.touchAction = entry.touchAction;
          entry.element.style.overscrollBehavior = entry.overscroll;
        }
        locked.length = 0;
      };

      /*
        A finger has to hold before it carries anything; a mouse and a pen are
        armed from the outset, which is what the grid has always done. A resize
        is exempt: that grip is a few pixels of the block's own bottom edge, it
        claims `touch-action: none` for itself, and it is not somewhere anybody
        starts a scroll — so there is no gesture to be confused with and nothing
        to wait for.
      */
      const isFinger = event.pointerType === 'touch' && mode === 'move';

      moveRef.current = {
        appointment,
        mode,
        gridTop,
        originClientY: event.clientY,
        originClientX: event.clientX,
        columns,
        moved: false,
        armed: !isFinger,
        pointerType: event.pointerType,
        pointerCancelled: false,
        lastClientX: event.clientX,
        lastClientY: event.clientY,
        /*
          The card itself, not whatever part of it the press landed on: the grips
          and the block share this handler, and the transform belongs to the
          block. `closest` rather than `currentTarget` for exactly that reason.
        */
        element: (event.currentTarget as HTMLElement).closest<HTMLElement>('[data-appointment-id]'),
        previewKey: null,
        origin: event.currentTarget as HTMLElement,
        pointerId: event.pointerId,
        captured: false,
        bounds: column.closest('[data-timeline]')?.getBoundingClientRect() ?? null,
        cardRect:
          (event.currentTarget as HTMLElement)
            .closest<HTMLElement>('[data-appointment-id]')
            ?.getBoundingClientRect() ?? null,
      };

      /*
        The press, made visible. A hold that gives nothing back until it fires
        is a gesture nobody discovers and nobody trusts — the finger is down,
        the grid is still, and there is no telling whether this card does that
        at all. The block settles under the finger for exactly the length of the
        hold; see `.calendar-holding`.
      */
      if (isFinger) {
        setHoldingId(appointment.id);
        /*
          From the press, not from the hold. The decision this forestalls is
          made at `touchstart`, so a lock applied 450ms later would be applied
          after the only moment it could have mattered — and by then the grid is
          already sliding under a finger that meant to hold a card still.

          It is lifted the instant the gesture ends, which includes the drift
          teardown: a finger that was scrolling all along loses the first few
          pixels of its swipe and has the week back from there. That is the same
          touch slop every scroller on the platform already spends.
        */
        lockScrollers(column as HTMLElement);
      }

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

      /**
       * How far the pointer has travelled beyond what the snap has already
       * moved the card — see {@link DragPreview.offsetX}.
       *
       * Both axes are the same subtraction: the pointer's own delta, less the
       * delta the snapped preview accounts for. Vertically that is the
       * difference in start times, in pixels at the scale currently on screen;
       * horizontally it is the distance between the two columns' leading edges,
       * measured rather than computed, so RTL needs no special case — the
       * browser laid the week out and the rects say where it put it.
       *
       * A resize moves nothing, so it carries no remainder: the block's start
       * stays where it is and only its height follows the pointer.
       */
      /**
       * The element the card is *currently* drawn as.
       *
       * ## Why this cannot just be the one the press landed on
       *
       * A block lives inside its day's column, so the moment a drag crosses into
       * the next day React unmounts it from the column it came from and mounts a
       * new element in the one it went to. Same appointment, same key, different
       * node — and the node the gesture was holding is now detached from the
       * document.
       *
       * Everything kept working except the one thing that mattered: the free
       * offset was being written to a node nobody could see, so the card stopped
       * following the finger the instant it left its own column and sat there
       * snapping from slot to slot. Which is exactly "it got stuck when I move
       * the appointment to the next column".
       *
       * So the held element is a cache, checked for being connected and
       * re-acquired when it is not. The query runs on the frame after a day
       * change and no others — a `querySelector` sixty times a second is the
       * work this whole split exists to avoid, and once per column crossed is
       * nothing.
       */

      /**
       * Capture the pointer on the element the gesture started from.
       *
       * ## Why this is not done at pointer-down
       *
       * ⚠ **It was, and it broke the client's name.** The name on a block is a
       * link to the record, and clicking it on a desktop did nothing at all.
       * Chromium dispatches the `click` that follows a captured pointer to the
       * *capturing* element rather than to the one under the cursor — so the
       * click landed on the `<article>`, the anchor inside it never received one,
       * and the browser never navigated. Nothing in the anchor's own handler was
       * at fault, which is why it looked like a routing bug.
       *
       * Capture exists for the drag, and a click is not a drag. So it is taken at
       * the first moment the gesture actually becomes one — past the threshold on
       * a mouse, at the hold on a finger — and by then there is no click left to
       * misdeliver: a press that travels far enough to capture is a press the
       * browser will not report as a click on the link anyway.
       *
       * What capture is *for*: without it the browser may reinterpret a
       * travelling finger as a pan and cancel the move halfway through; with it,
       * every subsequent event for this pointer is delivered here until release.
       * `preventDefault()` on `touchmove` is the other half — capture decides
       * where the events go, that decides whether the browser competes for them.
       *
       * Wrapped because capture throws if the pointer has already been released,
       * a race a fast gesture can win. Losing it is not fatal — the window
       * listeners carry the drag regardless — so it must not take the gesture
       * down with it.
       */
      const captureOnce = (gesture: MoveGesture) => {
        if (gesture.captured) return;
        gesture.captured = true;

        try {
          gesture.origin.setPointerCapture(gesture.pointerId);
        } catch {
          // Nothing to do: the gesture proceeds uncaptured, as it always did.
        }
      };

      const cardOf = (gesture: MoveGesture): HTMLElement | null => {
        if (gesture.element?.isConnected) return gesture.element;

        gesture.element = document.querySelector<HTMLElement>(
          `[data-appointment-id="${appointment.id}"]`,
        );

        return gesture.element;
      };

      const paintDrag = (clientX: number, clientY: number, gesture: MoveGesture) => {
        if (gesture.mode === 'resize') return;

        const card = cardOf(gesture);
        if (!card) return;

        /*
          The pointer's own travel, whole and unmodified.

          ⚠ It used to be the travel *minus* whatever the snapped re-render had
          already moved the card by, and that is what shook. The two halves were
          applied by different machines on different clocks: this style write
          lands during the event, and the `top` it was compensating for lands
          whenever React commits. Whenever those fell in different frames — which
          near a slot boundary is most of them — the card was drawn for a frame
          with one half applied and not the other, which is a jump of a whole
          slot, and a finger resting on a boundary flips across it many times a
          second. Hence a shake whose amplitude was exactly `pxPerSlot`.

          There is nothing to subtract now, because the card no longer moves in
          the layout at all while it is being dragged: the grid keeps drawing it
          where it started and this transform is the entire movement. One value,
          one clock, no second opinion — see `previewedAppointments` in
          `./components/calendar`, which is what stopped repositioning it.
        */
        /*
          ── Held inside the grid, sideways ──

          ⚠ A transform counts towards its scroller's **scrollable overflow**.
          The timeline sits in a horizontal scroller, so a card translated past
          the last column grew that scroller's content: the week slid under the
          hand, and the time gutter — which is `sticky start-0` against exactly
          that scroller (see the note on the gutter in `./components/calendar`) —
          slid with it. The frame of the calendar is not supposed to move at all
          while a booking is being carried, and it was moving the wrong way,
          because what the reader was actually seeing was the page scrolling
          itself towards the card.

          Clamping the card to the timeline's own box removes the cause rather
          than the symptom: it can never translate to a place there is no grid,
          so the scrollable area never grows and there is nothing to slide.

          On the day view this is also the whole of the sideways travel — one
          column, as wide as the timeline, so a card that must stay inside it
          barely moves across. That is the honest drawing of what a sideways drag
          does there, which is nothing.

          Only the inline axis is clamped. The block axis scrolls a grid that is
          already taller than its port, so the card is moving *within* existing
          content and grows nothing — and pinning it to the visible top and
          bottom would tear it away from the pointer at both edges of an
          ordinary drag.
        */
        const dx = clientX - gesture.originClientX;
        const { bounds, cardRect } = gesture;

        const heldX =
          bounds && cardRect
            ? Math.min(Math.max(dx, bounds.left - cardRect.left), bounds.right - cardRect.right)
            : dx;

        card.style.setProperty(DRAG_X, `${heldX}px`);
        card.style.setProperty(DRAG_Y, `${clientY - gesture.originClientY}px`);
      };

      /**
       * Detach everything this gesture registered and forget it.
       *
       * One function, for the same reason `beginCreate` has one: the listeners
       * come in two families now, and a release path that forgot the `touchmove`
       * one would leave a live `preventDefault()` on the window — which is a
       * calendar that has stopped scrolling.
       */
      function teardown() {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
        window.removeEventListener('pointercancel', handleCancel);
        window.removeEventListener('touchmove', handleTouchMove);
        window.removeEventListener('touchend', handleTouchEnd);
        window.removeEventListener('touchcancel', handleTouchCancel);
        if (holdTimer !== null) window.clearTimeout(holdTimer);

        // The week scrolls again the moment nothing is being held.
        unlockScrollers();

        /*
          The card lands by the offset going away. Cleared here rather than left
          to React, which never set these and so would never think to remove
          them — and a card that kept the last frame's offset would sit a few
          pixels off its own slot until something else re-rendered it.
        */
        const gesture = moveRef.current;
        const card = gesture ? cardOf(gesture) : null;
        if (card) {
          card.style.removeProperty(DRAG_X);
          card.style.removeProperty(DRAG_Y);
        }

        moveRef.current = null;
        setDragPreview(null);
        setHoldingId(null);
      }

      /**
       * Advance the gesture to a point, whichever stream that point came from.
       *
       * A `function` declaration so it is hoisted above `handleTouchMove`, which
       * is defined first and calls it.
       */
      function advance(clientX: number, clientY: number) {
        const gesture = moveRef.current;
        if (!gesture) return;

        gesture.lastClientX = clientX;
        gesture.lastClientY = clientY;

        /*
          Before the hold is met, travel means the finger was scrolling the week
          all along: drop the hold and let the browser have the gesture, exactly
          as an unarmed create gesture does.
        */
        if (!gesture.armed) {
          const drift = Math.hypot(clientX - gesture.originClientX, clientY - gesture.originClientY);
          if (drift > HOLD_TOLERANCE_PX) teardown();
          return;
        }

        // Distance in *either* axis, not just vertical. A drag straight across
        // to the next day changes no y at all, and a vertical-only threshold
        // would never let that gesture start.
        const travelled = Math.max(
          Math.abs(clientY - gesture.originClientY),
          Math.abs(clientX - gesture.originClientX),
        );

        if (!gesture.moved && travelled < DRAG_THRESHOLD_PX) return;
        gesture.moved = true;

        // Past the threshold this is a drag, and a drag is what capture is for.
        captureOnce(gesture);

        const next = compute(clientY, clientX, gesture);

        // The free half of the drag: a style write on one element, every frame.
        paintDrag(clientX, clientY, gesture);

        /*
          The snapped half, and only when it has actually changed.

          This used to run on every frame, and it is what made the drag stick: a
          `setState` here re-renders seven columns, every block on them, the
          preview memo and a validity check over the whole day — work the finger
          then has to wait for. Between one slot and the next none of that
          produces a different pixel, because the card's position in those frames
          is the custom properties above and nothing else.

          Keyed on the three fields that are rendered from, so a gesture that
          wanders around inside one slot renders once, and crossing into the next
          one renders once more.
        */
        const key = `${next.date}|${next.startMinute}|${next.durationMinutes}`;
        if (key === gesture.previewKey) return;
        gesture.previewKey = key;

        /*
          Nothing here moves the card any more — this render changes the times on
          its chip and whether it is drawn as a legal drop, and that is all. The
          re-parenting dance a day change used to require is gone with it: the
          block stays mounted in the column it started in for the whole gesture,
          so there is no element to lose and none to re-acquire mid-drag.
        */
        setDragPreview({
          id: appointment.id,
          ...next,
          // An hour of today that has already gone is a legitimate drop — the
          // clinic rearranges the morning in the afternoon. Only a closed day, a
          // date that has gone and a clash still paint red.
          valid: isValid({ ...next, practitionerId: appointment.practitionerId }, appointment.id),
        });
      }

      const handleMove = (moveEvent: PointerEvent) => {
        advance(moveEvent.clientX, moveEvent.clientY);
      };

      /*
        ── Taking the gesture back from the browser ──

        `preventDefault()` on `touchmove` is the only thing that stops iOS
        panning the grid mid-drag, and `touch-action` is not available to the
        block: it fills a column that has to stay pannable. Registered at
        pointer-down rather than when the hold succeeds, because a listener added
        after the browser has begun scrolling is too late — and inert until
        `armed`, so an ordinary scroll that starts on a booking passes straight
        through.

        ⚠ `{ passive: false }` is load-bearing: a passive listener's
        `preventDefault()` is a silent no-op.
      */
      const handleTouchMove = (touchEvent: TouchEvent) => {
        const gesture = moveRef.current;
        if (!gesture) return;

        /*
          ── Nothing scrolls while a booking is being held ──

          This used to wait for `armed`, and the wait was visible: through the
          whole 450ms hold the grid was still the browser's to scroll, so the
          smallest tremor slid the calendar under the finger. The card the reader
          was deliberately holding on to moved away from them, and on a phone the
          hold usually died with it — the browser claims a gesture it has started
          scrolling.

          So a finger that has landed on an appointment stops the scroll from its
          very first move, before the hold has been met and whether or not it
          will be. What that costs is bounded and deliberate: it is only true
          while this gesture exists, and a finger that travels more than
          {@link HOLD_TOLERANCE_PX} is read as a scroll — `advance` tears the
          gesture down, this listener goes with it, and the browser has the
          week back. That is one prevented frame at the start of a swipe that
          begins on a card, which is the same touch slop every scroller on the
          platform already spends.

          A booking is the right surface to take this on and empty canvas is not:
          `beginCreate` still arms on `armed` alone, because the canvas *is* the
          calendar and a grid that resists the first 10px of every pan would be
          worse than the problem.
        */
        if (touchEvent.cancelable) touchEvent.preventDefault();

        /*
          After a `pointercancel` this is the only movement this gesture will
          ever see — the pointer stream is finished — so the drift test and the
          preview have to run from here instead.
        */
        if (gesture.pointerCancelled) {
          const touch = touchEvent.touches[0];
          if (touch) advance(touch.clientX, touch.clientY);
        }
      };

      /*
        The hold. Picking the block up paints its preview at the position it
        already occupies, so the card visibly lifts at the instant the gesture is
        taken rather than at the first 15 minutes of travel.
      */
      const holdTimer = isFinger
        ? window.setTimeout(() => {
            const gesture = moveRef.current;
            if (!gesture || gesture.moved) return;

            gesture.armed = true;
            setHoldingId(null);

            // The card has been picked up, so the pointer belongs to this
            // gesture from here — including the events the browser would
            // otherwise reclaim for a pan.
            captureOnce(gesture);

            const next = compute(gesture.lastClientY, gesture.lastClientX, gesture);
            // The pickup happens where the card already is, so there is nothing
            // to carry yet — but the key is recorded, or the first frame of
            // travel would render this same position a second time.
            gesture.previewKey = `${next.date}|${next.startMinute}|${next.durationMinutes}`;
            setDragPreview({
              id: appointment.id,
              ...next,
              valid: isValid({ ...next, practitionerId: appointment.practitionerId }, appointment.id),
            });
          }, HOLD_TO_DRAG_MS)
        : null;

      /**
       * A gesture the browser took away is not a move: it tears down and commits
       * nothing.
       *
       * ⚠ **Except a finger, at any stage of the gesture.**
       *
       * Unarmed, for the reason `beginCreate.handleCancel` sets out in full: iOS
       * fires `pointercancel` speculatively, the moment it starts considering
       * the touch for a scroller, which on a pannable grid is well inside the
       * 450ms hold. Tearing down there would clear the timer and the hold could
       * never once reach the line that arms it.
       *
       * And armed, because a card that is being carried must not be put down by
       * anything except the hand carrying it. A cancel mid-drag dropped the
       * appointment where it stood and snapped the card back — the gesture ended
       * without anybody ending it, which on a touch screen is the one thing a
       * drag must never do. Nothing is lost by staying: the finger is still on
       * the glass, `touchmove` is still reporting where, and the release is
       * still the only thing that writes. If the touch really is gone, its own
       * `touchcancel` says so and *that* is what abandons the gesture.
       *
       * What the cancel does cost either way is the pointer stream: no further
       * `pointermove` and no `pointerup`. From here the gesture runs on
       * `touchmove` and finishes on `touchend`.
       */
      const handleCancel = () => {
        const gesture = moveRef.current;

        if (!gesture || gesture.pointerType !== 'touch') {
          teardown();
          return;
        }

        gesture.pointerCancelled = true;
      };

      /**
       * Finish the gesture and commit the move, if it is one.
       *
       * Takes the release point rather than an event, because there are two ways
       * this can end — `pointerup` ordinarily, and `touchend` once
       * `pointercancel` has killed the pointer stream. Safe to reach twice: an
       * uncancelled touch fires both, and whichever arrives first clears the ref.
       */
      function completeMove(release: { x: number; y: number } | null) {
        const gesture = moveRef.current;

        teardown();

        // Below the threshold this was a tap, which only selects — and an
        // unarmed finger never even became a drag. Committing here would write
        // an identical row on every single press.
        if (!gesture?.moved) return;

        /*
          Where the gesture actually ended. `0, 0` is a mis-reported WebKit touch
          release rather than a real point — see `lastClientX` on the create
          gesture — and a `touchend` with no `changedTouches` falls back the same
          way.
        */
        const usable = release !== null && !(release.x === 0 && release.y === 0);
        const releaseX = usable ? release.x : gesture.lastClientX;
        const releaseY = usable ? release.y : gesture.lastClientY;

        const next = compute(releaseY, releaseX, gesture);

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
      }

      const handleUp = (upEvent: PointerEvent) => {
        completeMove({ x: upEvent.clientX, y: upEvent.clientY });
      };

      /**
       * The touch stream's own release, for the gesture whose pointer stream
       * `pointercancel` already ended. Registered for every touch gesture, since
       * by the time a cancel arrives it is too late to start listening — and it
       * costs nothing: on an uncancelled touch `pointerup` gets there first.
       */
      const handleTouchEnd = (touchEvent: TouchEvent) => {
        const touch = touchEvent.changedTouches[0];
        completeMove(touch ? { x: touch.clientX, y: touch.clientY } : null);
      };

      /** A touch the system took away — a second finger, a call, the app backgrounded. */
      const handleTouchCancel = () => {
        teardown();
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
      window.addEventListener('pointercancel', handleCancel);
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleTouchEnd);
      window.addEventListener('touchcancel', handleTouchCancel);
    },
    [isValid, minuteAt],
  );

  return {
    pending,
    dragPreview,
    /** The appointment a finger is currently resting on, mid-hold. */
    holdingId,
    beginCreate,
    beginMovePointerDown: beginMove('move'),
    beginResizePointerDown: beginMove('resize'),
  };
}
