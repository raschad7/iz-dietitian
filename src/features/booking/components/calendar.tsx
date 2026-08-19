'use client';

import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from 'react';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useDialogPresenceValue } from '@/components/ui/dialog-motion';
import { useRouter } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { normalizeForSearch } from '@/features/clients/search';
import { cn } from '@/lib/utils';

import {
  createAppointmentAction,
  createClientAndBookAction,
  deleteAppointmentAction,
  repeatWeeklyAction,
  updateAppointmentAction,
} from '../actions';
import { addDays, addMonths, eachDay, endOfMonth, startOfMonth, startOfWeek, toIsoDate } from '../date';
import {
  formatDayNumber,
  formatHour,
  formatLongDate,
  formatLongDateRange,
  formatMinute,
  formatWeekday,
} from '../format';
import { hasEnded, isCompleted, localWallClock } from '../completed';
import { PX_PER_SLOT, minuteToY } from '../geometry';
import { type CalendarView, type NewClientInput } from '../schema';
import { type ActionErrorKey, type CalendarAppointment, type CalendarClient } from '../types';
import { useCalendarClock } from '../use-calendar-clock';
import { useCalendarGestures, type BookingRequest } from '../use-calendar-gestures';
import { useScrollToMatch } from '../use-scroll-to-match';
import { isWorkingDay, type ClinicHours, type ExistingAppointment } from '../validation';
import { AppointmentDialog } from './appointment-dialog';
import { CalendarToolbar } from './calendar-toolbar';
import { CalendarViewGuard } from './calendar-view-guard';
import { ClientPicker, type PendingBooking } from './client-picker';
import { DayColumn } from './day-column';
import { MonthView } from './month-view';
import { NewClientDialog } from './new-client-dialog';

/**
 * The calendar shell: it owns the state the views share and is the only place
 * that talks to the server actions.
 *
 * View and date live in the URL, so a particular week is a shareable address and
 * the server can read the range it needs to load — the same approach the clients
 * list takes with its filters.
 *
 * Writes are optimistic. `useOptimistic` applies the change immediately and
 * discards it when the transition ends: on success `revalidatePath` has already
 * refreshed the real rows underneath, and on failure the discard *is* the
 * rollback, with the returned message key rendered in the current language.
 */

/**
 * Day-header height. Shared by the headers and by the gutter's corner spacer, so
 * the two sticky rows line up — they are siblings, not a table, and nothing else
 * would keep them in step.
 */
const HEADER_HEIGHT = 'h-9';

/**
 * Narrowest a day column may get before the grid starts scrolling sideways.
 *
 * This is the day view's floor, at every width. One column with the whole panel
 * to itself is never near it — the value is only there so a column cannot
 * collapse if the shell ever hands the calendar less than it expects.
 */
const DAY_MIN_WIDTH = 'min-w-28';

/**
 * The hour gutter's width — and the two spacers that stand in for it.
 *
 * It was `w-20` (80px), and it was that wide because the labels read
 * `12:00 PM`: five characters of time, a space and a meridiem, at the label
 * step. They read `09AM` now (`formatHour`), which is about 38px set, so 80px
 * left half a column of nothing between the times and the first day of the
 * week. 64px carries the longest of them with room to spare in either language
 * and hands the 16px back to the columns, which on a tablet is where it is
 * worth the most.
 *
 * ⚠ Three elements divide the same inline space — the header row's corner cell,
 * the gutter itself, and the below-fold marker row's leading spacer — and the
 * first and last exist *only* to be exactly as wide as the second. They must
 * carry the same class or the day columns start at three different offsets.
 */
const GUTTER_WIDTH = 'w-16';

/**
 * The same floor for a week — but only from `lg` up.
 *
 * Seven columns at `min-w-28` plus the 64px hour gutter come to 848px, and the
 * tablet band never has that. The staff rail is locked to its 56px icon column
 * below `lg` (`railOnly`, see `sidebar.tsx`), so a 768px tablet leaves the
 * calendar 712px and the week ran 136px past it — more than a day of it.
 *
 * That overflow is not a scrollbar you can see, either: `globals.css` takes the
 * bars off every scroller in the app, so the last columns were simply cut off
 * the side of the screen with nothing on it to say they were there or how to
 * reach them. A week view that cannot show the end of the week is the one thing
 * it may not do.
 *
 * Dropping the floor in that band lets the seven `flex-1` columns divide
 * whatever there is instead: at the narrowest tablet that comes to ~92px a
 * column, which still carries a compact block, and the week fits exactly — no
 * cut, and no sideways scroll at all. From `lg` the floor comes back, because a
 * desktop has the room and past that width a column should stop shrinking
 * rather than keep dividing.
 *
 * ⚠ The header row, the timeline and the below-fold markers divide the same
 * space and must carry the *same* value, or their columns drift apart and every
 * vertical rule lands somewhere different. That is why all three read it from
 * one place.
 */
const WEEK_DAY_MIN_WIDTH = 'min-w-0 lg:min-w-28';

/**
 * The timeline scroller's block padding, in pixels.
 *
 * **Must match the `py-3` on that element.** It is the offset between the
 * scroller's own coordinates and the grid's, which is what turns a `scrollTop`
 * into "how deep into the day can you currently see" — the question the
 * below-the-fold marker is answering.
 */
const TIMELINE_PADDING_PX = 12;

/**
 * The platform's vertical scrollbar width, measured once from a **detached**
 * probe rather than from the timeline itself.
 *
 * Detached is the whole point. The obvious measurement — `offsetWidth -
 * clientWidth` on the timeline — is read from the very element the answer then
 * resizes: the width is reserved as `paddingInlineEnd` on the day header, the
 * header shares a `min-w-max` box with the timeline, so the padding grows the
 * box and the timeline with it. Measuring a box and then changing that box from
 * the same callback is a feedback edge, and `offsetWidth`/`clientWidth` are
 * integer-rounded, so a fractional panel makes the reading alternate between
 * two values that never compare equal. The guard in `measure` bails on an
 * unchanged value and so never gets the chance to stop it — React does, with
 * "maximum update depth exceeded".
 *
 * It is also simply more accurate. On this machine the timeline reports 16px
 * for a scrollbar that is 15px, because the rounding lands on the far side of a
 * fractional edge — a whole pixel of misalignment in the rules the reserved
 * width exists to line up.
 *
 * A scrollbar's width is a property of the platform, not of any one element, so
 * one probe answers for every scroller and the result is cached. Nothing in the
 * layout can move it, which is exactly what makes it safe to write back.
 */
let platformScrollbarWidth: number | null = null;

function verticalScrollbarWidth(): number {
  if (platformScrollbarWidth !== null) return platformScrollbarWidth;

  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;top:-9999px;width:100px;height:100px;overflow-y:scroll';

  document.body.append(probe);
  platformScrollbarWidth = probe.offsetWidth - probe.clientWidth;
  probe.remove();

  return platformScrollbarWidth;
}

/**
 * The full-bleed root: cancels `main`'s `p-3 md:p-5` at the **inline** edges,
 * so the grid runs the width of the window with no gutter wasted on either
 * side of a day column.
 *
 * **The block-end padding stays.** This used to cancel that too — `-mb-3` plus
 * a matching height increase — so the grid ended exactly on the shell's floor,
 * and the closing hour sat on the bottom edge of the window with the panel's
 * own border as the last thing on screen. No amount of padding *inside* the
 * scroller fixes that: it adds room under the last hour and the panel still
 * ends at the floor. Leaving the shell's block-end padding alone is what puts
 * the calendar on the page rather than against its edge — and it is also the
 * clearance the below-fold marker sits above, which is the other reason it is
 * back: a control glued into the corner of the window has nothing around it.
 *
 * Keep the inline halves in step with the layout's padding.
 */
const FULL_BLEED = '-mx-3 h-full md:-mx-5';

/**
 * Puts that page gutter back on everything *above* the grid.
 *
 * The root cancels the shell's padding so the grid can run edge to edge; the
 * toolbar and the one-line hints are ordinary page content and still want it.
 */
const TOOLBAR_INSET = 'px-3 md:px-5';

export type CalendarProps = {
  locale: Locale;
  view: CalendarView;
  /** The date the view is built around, `YYYY-MM-DD`. */
  anchorDate: string;
  hours: ClinicHours;
  appointments: CalendarAppointment[];
  clients: CalendarClient[];
  /**
   * The route family `day`/`week`/`month` hang off. Defaults to the main
   * calendar's own address; a client's Visit History tab mounts this same
   * component under `/app/clients/{id}/visits` instead, so its view switch
   * and date navigation stay inside that client's page rather than jumping
   * to the clinic-wide calendar.
   */
  basePath?: string;
  /**
   * Whether the booking picker offers "add a new client". Defaults to true on
   * any view that opens a picker at all. A client-scoped calendar passes
   * `false`: every booking made there is already for the one person the page is
   * about, so an "add someone else" button would be a false offer.
   */
  allowNewClient?: boolean;
  /** Hides the toolbar's search field — see the note on `CalendarToolbarProps`. */
  hideSearch?: boolean;
  /**
   * Whether the grid reaches past the app shell's page padding — see
   * `FULL_BLEED`.
   *
   * Defaults to true, like `basePath`: an unqualified `Calendar` is the
   * clinic's calendar page, where the grid *is* the page. A calendar mounted
   * inside another screen — the client record's Visit History tab — passes
   * false, because the padding it would be cancelling belongs to a container
   * several levels up and is not its to reclaim.
   */
  fullBleed?: boolean;
};

type OptimisticAction =
  | { type: 'add'; appointment: CalendarAppointment }
  | { type: 'move'; id: string; date: string; startMinute: number; durationMinutes: number }
  | { type: 'remove'; id: string };

/** A finished drag, waiting on the doctor to confirm it before anything is written. */
type PendingMove = { appointment: CalendarAppointment; next: BookingRequest };

export function Calendar({
  locale,
  view,
  anchorDate,
  hours,
  appointments,
  clients,
  basePath = '/app/calendar',
  allowNewClient: allowNewClientProp,
  hideSearch = false,
  fullBleed = true,
}: CalendarProps) {
  const t = useTranslations('booking');
  const router = useRouter();
  const searchParams = useSearchParams();

  const [isPending, startTransition] = useTransition();
  const now = useCalendarClock();

  /**
   * Today, as the browser's local calendar day — null until the shared clock
   * ticks after hydration, because the server cannot know it.
   *
   * Read once here and passed down, so the grid, the gestures and the edit
   * dialog all judge "has that date gone?" against the same instant. The server
   * asks the same question of the *clinic's* zone and has the final say; this
   * is the courtesy answer, and it now decides only how a day is *drawn* — the
   * marker on today, the quieter tint on the days behind it. No date is refused
   * for being past any more; see `earliestDate` in `../validation`.
   */
  const today = now ? toIsoDate(now) : null;

  /**
   * The same instant, to the minute — and the one question the date alone
   * cannot answer: has the slot an appointment is being dragged onto already
   * finished, which freezes that appointment the moment it lands.
   */
  const nowClock = now ? localWallClock(now) : null;

  /**
   * The timeline draws every slot at this fixed height regardless of how much
   * vertical space the panel has — a working day usually needs more room than
   * that to stay readable, and the body scrolls to it instead of the grid
   * shrinking to avoid a scrollbar.
   */
  const pxPerSlot = PX_PER_SLOT;

  const [optimisticAppointments, applyOptimistic] = useOptimistic(
    appointments,
    (current: CalendarAppointment[], action: OptimisticAction) => {
      if (action.type === 'add') return [...current, action.appointment];
      if (action.type === 'remove') return current.filter((row) => row.id !== action.id);

      return current.map((row) =>
        row.id === action.id
          ? { ...row, date: action.date, startMinute: action.startMinute, durationMinutes: action.durationMinutes }
          : row,
      );
    },
  );

  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** The freshly created booking, highlighted briefly. Creating never opens the dialog. */
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [message, setMessage] = useState<ActionErrorKey | null>(null);
  /**
   * Something that went right, said in words the grid cannot: how many of the
   * requested weekly repeats were actually booked. Kept apart from `message`,
   * which is only ever a refusal and is drawn in clay.
   */
  const [notice, setNotice] = useState<string | null>(null);

  const [pendingBooking, setPendingBooking] = useState<PendingBooking | null>(null);
  /** The pending slot plus the repeat span already chosen for it in the picker. */
  const [newClientFor, setNewClientFor] = useState<{ pending: PendingBooking; weeks: number } | null>(
    null,
  );
  const [editing, setEditing] = useState<CalendarAppointment | null>(null);
  const presentedNewClientFor = useDialogPresenceValue(newClientFor);
  const presentedEditing = useDialogPresenceValue(editing);
  /** The two writes that ask first: rescheduling by drag, and deleting. */
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CalendarAppointment | null>(null);

  /**
   * The clinic's single practitioner, taken from whatever is already booked.
   *
   * The server owns this — it resolves the practitioner from the session on
   * every write — but the *client-side* preview still needs it, because the
   * overlap rule is keyed on it and a drag paints itself green or red before any
   * request is made. With no appointments loaded there is nothing to overlap
   * with, so the sentinel below can never produce a wrong answer.
   */
  const practitionerId = appointments[0]?.practitionerId ?? 'unresolved-practitioner';

  /**
   * The column floor the view on screen draws with — a week gives its up on a
   * tablet so seven columns fit the width. See `WEEK_DAY_MIN_WIDTH`.
   */
  const dayMinWidth = view === 'week' ? WEEK_DAY_MIN_WIDTH : DAY_MIN_WIDTH;

  /** The days this view draws. */
  const days = useMemo(() => {
    if (view === 'day') return [anchorDate];
    if (view === 'week') return eachDay(startOfWeek(anchorDate), 7);
    return [];
  }, [anchorDate, view]);

  /** The rule inputs: every appointment currently loaded, in validator shape. */
  const existing: ExistingAppointment[] = useMemo(
    () =>
      optimisticAppointments.map((row) => ({
        id: row.id,
        practitionerId: row.practitionerId,
        clientId: row.clientId,
        date: row.date,
        startMinute: row.startMinute,
        durationMinutes: row.durationMinutes,
      })),
    [optimisticAppointments],
  );

  const existingByDate = useCallback((date: string) => existing.filter((row) => row.date === date), [existing]);

  /** Derived every render from the one shared clock — never stored. */
  const completedIds = useMemo(
    () => new Set(optimisticAppointments.filter((row) => isCompleted(row, now)).map((row) => row.id)),
    [now, optimisticAppointments],
  );

  /** Search dims rather than hides, so the day's shape stays recognisable. */
  const dimmedIds = useMemo(() => {
    const needle = normalizeForSearch(query);
    if (!needle) return new Set<string>();

    return new Set(
      optimisticAppointments
        .filter((row) => !normalizeForSearch(row.clientName).includes(needle))
        .map((row) => row.id),
    );
  }, [optimisticAppointments, query]);

  /**
   * …and then goes to the one it found. Dimming answers "who else is here?";
   * this answers "where is she?", which on a grid taller than its panel — or a
   * week scrolled sideways — the dimming cannot.
   */
  const matchId = useScrollToMatch(query, optimisticAppointments, days);

  /**
   * Day, week and month are separate routes, so switching view is a navigation,
   * not a query-string flip. The date rides along as a search param because it
   * is a position within a view rather than a different page.
   */
  function navigate(next: { view?: CalendarView; date?: string }): void {
    const params = new URLSearchParams(searchParams.toString());
    params.set('date', next.date ?? anchorDate);
    router.push(`${basePath}/${next.view ?? view}?${params.toString()}`);
  }

  /**
   * The same move, without a history entry — for the view guard.
   *
   * A view the screen cannot show must not be somewhere Back can return to: on a
   * phone that opened a shared month link, `push` would leave the month one
   * press behind the day view, and pressing Back would land on it and be bounced
   * forward again. `replace` swaps the entry instead, so Back leaves the
   * calendar the way it would have if the month had never been mounted.
   *
   * `useCallback`, because the guard takes it as an effect dependency.
   */
  const replaceView = useCallback(
    (next: CalendarView) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('date', anchorDate);
      router.replace(`${basePath}/${next}?${params.toString()}`);
    },
    [anchorDate, basePath, router, searchParams],
  );

  const step = view === 'month' ? 'month' : view === 'week' ? 7 : 1;

  function shift(direction: 1 | -1): void {
    navigate({ date: step === 'month' ? addMonths(anchorDate, direction) : addDays(anchorDate, step * direction) });
  }

  /** A create gesture finished. Open the picker; write nothing yet. */
  const handleRequestBooking = useCallback((request: BookingRequest, pointer: { x: number; y: number }) => {
    setPendingBooking({ ...request, pointer });
  }, []);

  /** Writes the move. Any confirmation has already been given by this point. */
  const commitMove = useCallback(
    (appointment: CalendarAppointment, next: BookingRequest) => {
      setMessage(null);

      startTransition(async () => {
        applyOptimistic({ type: 'move', id: appointment.id, ...next });

        const result = await updateAppointmentAction(locale, {
          id: appointment.id,
          clientId: appointment.clientId,
          date: next.date,
          startMinute: next.startMinute,
          durationMinutes: next.durationMinutes,
          reason: appointment.reason ?? undefined,
        });

        // Nothing to undo by hand: the optimistic entry is discarded when this
        // transition ends, which restores the row the server still has.
        if (!result.ok) setMessage(result.error);
      });
    },
    [applyOptimistic, locale],
  );

  /**
   * A drag has finished. Ask first when it changed *when* the appointment
   * happens — a patient being moved to another time or another day is worth a
   * question, and a slipped pointer is a real way to reschedule someone by
   * accident.
   *
   * The test is on what changed, not on which gesture ran. A resize fixes both
   * `date` and `startMinute` and varies only the duration (see `compute` in
   * `../use-calendar-gestures`), so it can never match this and stays a
   * one-gesture adjustment. That also means `onCommitMove` needs no mode flag.
   *
   * Nothing is written here, and nothing is applied optimistically: the gesture
   * has already cleared its preview, so the block is drawn where it started and
   * cancelling needs no rollback.
   */
  const handleCommitMove = useCallback(
    (appointment: CalendarAppointment, next: BookingRequest) => {
      if (next.date !== appointment.date || next.startMinute !== appointment.startMinute) {
        setPendingMove({ appointment, next });
        return;
      }

      commitMove(appointment, next);
    },
    [commitMove],
  );

  const gestures = useCalendarGestures({
    hours,
    existing,
    practitionerId,
    pxPerSlot,
    onRequestBooking: handleRequestBooking,
    onCommitMove: handleCommitMove,
  });

  /**
   * The appointments with any in-flight drag applied.
   *
   * Computed once for the whole grid rather than per column, because a move can
   * change the *date*: the block has to leave the column it came from and appear
   * in the one under the pointer. A per-column map cannot express that — it
   * would leave the original in place and never draw it in its new day.
   */
  const previewedAppointments = useMemo(() => {
    const preview = gestures.dragPreview;
    if (!preview) return optimisticAppointments;

    return optimisticAppointments.map((row) =>
      row.id === preview.id
        ? {
            ...row,
            date: preview.date,
            startMinute: preview.startMinute,
            durationMinutes: preview.durationMinutes,
          }
        : row,
    );
  }, [gestures.dragPreview, optimisticAppointments]);

  /**
   * The dates whose next appointment starts below the fold, and how many each is
   * hiding — the bookings a doctor would have to scroll to find.
   *
   * A *summary per date* rather than the raw scroll offset, deliberately:
   * storing the offset would re-render seven columns and every block on them on
   * each scroll frame, whereas this only changes when a column actually crosses
   * the threshold or the number under it changes. It is compared before it is
   * stored, so a scroll that changes nothing renders nothing.
   */
  const timelineRef = useRef<HTMLDivElement>(null);
  const [datesBelowFold, setDatesBelowFold] = useState<readonly { date: string; count: number }[]>(
    [],
  );

  /**
   * How wide the timeline's own vertical scrollbar is, in pixels.
   *
   * The day headers and the day columns are two sibling rows, not a table, and
   * only the second one scrolls — so the scrollbar came out of the columns'
   * width and not out of the headers', and every vertical rule below the header
   * row sat a little further off than the last. Reserving the same width at the
   * header row's inline end makes the two rows divide identical space, which is
   * what actually lines the rules up.
   *
   * Measured rather than assumed: it is 0 on an overlay-scrollbar platform
   * (macOS, most touch devices) and 15–17px on a classic one, and hardcoding
   * either would misalign the other. Measured from a detached probe rather than
   * from the timeline, though — see `verticalScrollbarWidth` for why reading it
   * off the element it then resizes is what made this loop.
   */
  const [scrollbarWidth, setScrollbarWidth] = useState(0);

  /**
   * What `read` needs to know, kept current without making it re-subscribe.
   *
   * This used to be a dependency array, and that is what made the effect run
   * away: `previewedAppointments` is a fresh array on every pointer move of a
   * drag, so the effect tore itself down and rebuilt on every render — and its
   * body calls `read` synchronously, which sets state, which renders, which
   * re-runs the effect. React said so plainly ("one of the dependencies changes
   * on every render"); the guards inside `read` could not help, because the
   * problem was the effect firing again rather than the values it wrote.
   *
   * Same device as `latest` in `useCalendarGestures`, for the same reason and
   * with the same caveat: written in an effect rather than during render,
   * because a ref is mutable state and touching it mid-render is unsafe under
   * concurrent rendering.
   */
  const readInputs = useRef({ days, previewedAppointments, openMinute: hours.openMinute, pxPerSlot });

  /** Lets the render below ask for a measurement without owning the listeners. */
  const scheduleRead = useRef<() => void>(() => {});

  useEffect(() => {
    const node = timelineRef.current;
    // The month view has no timeline. `view` is in the deps, so this re-runs
    // and clears the marks when it mounts or unmounts.
    if (!node) {
      setDatesBelowFold((previous) => (previous.length === 0 ? previous : []));
      return;
    }

    function read(): void {
      const element = timelineRef.current;
      if (!element) return;

      const { days, previewedAppointments, openMinute, pxPerSlot } = readInputs.current;

      /*
        Whether the timeline is currently scrolling is a question about
        *heights* — and the answer this produces is written as inline padding,
        which cannot change a height. That is what keeps this from feeding back
        into itself; see `verticalScrollbarWidth`.
      */
      const gutter = element.scrollHeight > element.clientHeight ? verticalScrollbarWidth() : 0;

      setScrollbarWidth((previous) => (previous === gutter ? previous : gutter));

      // In the grid's own coordinates: the timeline starts `TIMELINE_PADDING_PX`
      // into the scroller, so the deepest visible minute is that much shallower
      // than the raw scroll offset would suggest.
      const fold = element.scrollTop + element.clientHeight - TIMELINE_PADDING_PX;

      // Measured against each block's *top*, not its bottom. A booking whose
      // header row is on screen has already been seen; one that starts below
      // the fold is the one there is no way to know about.
      const next = days
        .map((date) => ({
          date,
          count: previewedAppointments.filter(
            (row) => row.date === date && minuteToY(row.startMinute, openMinute, pxPerSlot) >= fold,
          ).length,
        }))
        .filter((entry) => entry.count > 0);

      setDatesBelowFold((previous) =>
        previous.length === next.length &&
        previous.every(
          (entry, index) => entry.date === next[index]?.date && entry.count === next[index]?.count,
        )
          ? previous
          : next,
      );
    }

    let frame = 0;

    /**
     * One read per frame, and never inside the callback that asked for it.
     *
     * `read` writes `scrollbarWidth`, which is reserved as padding on the day
     * header — a layout change. A `ResizeObserver` callback runs *inside* the
     * browser's resize-observation loop, after layout and before paint, so
     * setting React state there renders synchronously, changes layout again,
     * and is re-observed within the same delivery. Deferring to the next frame
     * takes the write out of that loop, and collapses a burst of scroll and
     * resize notifications into a single read.
     */
    function schedule(): void {
      if (frame) return;

      frame = requestAnimationFrame(() => {
        frame = 0;
        read();
      });
    }

    scheduleRead.current = schedule;

    // The first read stays synchronous: it runs after commit like any effect,
    // nothing has been written yet for it to feed back into, and waiting a
    // frame would show the grid with the marker missing.
    read();

    node.addEventListener('scroll', schedule, { passive: true });

    /*
      The panel resizes with the window and with the app shell; both change how
      much of the day fits without changing what is booked on it.

      Height only. Nothing this effect produces depends on the width — `fold` is
      built from `scrollTop` and `clientHeight`, and whether a vertical scrollbar
      is needed is the content's height against the panel's, since block
      positions come from minutes and a wider column is never a shorter one.
      Meanwhile the one thing this effect *writes* is inline padding, which
      changes width and not height. Ignoring width notifications therefore costs
      no correctness and removes the only edge by which the output can provoke
      another read.
    */
    let lastHeight = -1;

    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height ?? 0;
      if (height === lastHeight) return;

      lastHeight = height;
      schedule();
    });

    observer.observe(node);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      scheduleRead.current = () => {};
      node.removeEventListener('scroll', schedule);
      observer.disconnect();
    };
    // `view` alone: the listeners follow the timeline coming and going, and
    // nothing else. Everything `read` needs arrives through `readInputs`,
    // precisely so that data changing cannot tear this down and rebuild it.
  }, [view]);

  /**
   * Refresh what `read` sees, and ask for a fresh measurement.
   *
   * Runs after every render, which is the honest signal: an appointment can be
   * booked, dragged to another hour or rolled back without resizing anything at
   * all — blocks are absolutely positioned — so neither observer above can see
   * it, but the calendar always re-renders for it.
   *
   * Safe to run unconditionally because `schedule` coalesces to one read a
   * frame and both setters bail on an unchanged value: a render that moves
   * nothing measures once more and stops, rather than scheduling another render.
   */
  useEffect(() => {
    readInputs.current = { days, previewedAppointments, openMinute: hours.openMinute, pxPerSlot };
    scheduleRead.current();
  });

  const belowFold = useMemo(
    () => new Map(datesBelowFold.map((entry) => [entry.date, entry.count])),
    [datesBelowFold],
  );

  /**
   * Takes the timeline to its last appointment, which is what the marker at the
   * foot of a column promises when it is pressed.
   *
   * To the end of the scroller rather than to the first hidden block: the marker
   * says how many are down there, and stopping at the first of them would leave
   * the rest still hidden and the marker still showing — a control that does
   * *some* of what it just offered. The scroller's own bottom padding keeps the
   * last block clear of the edge once it arrives.
   *
   * `smooth`, and deliberately: the point of the animation is that the reader
   * keeps their bearings — a grid that jumps to a different set of hours has to
   * be re-read from scratch to work out where it landed. `matchMedia` is checked
   * rather than left to CSS, because `scroll-behavior` in a stylesheet does not
   * reach a programmatic `scrollTo` with an explicit `behavior`.
   */
  const revealBelowFold = useCallback(() => {
    const element = timelineRef.current;
    if (!element) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    element.scrollTo({ top: element.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  }, []);

  function book(clientId: string, weeks: number): void {
    const pending = pendingBooking;
    if (!pending) return;

    setPendingBooking(null);
    setMessage(null);
    setNotice(null);

    const client = clients.find((row) => row.id === clientId);

    startTransition(async () => {
      // Drawn immediately, under a temporary id. If the server rejects it, the
      // optimistic entry is discarded when this transition ends and the block
      // disappears again — that discard is the rollback.
      if (client) {
        applyOptimistic({
          type: 'add',
          appointment: {
            id: `optimistic-${crypto.randomUUID()}`,
            practitionerId,
            clientId: client.id,
            date: pending.date,
            startMinute: pending.startMinute,
            durationMinutes: pending.durationMinutes,
            reason: null,
            clientName: client.name,
            // Carried on `CalendarClient` for exactly this: the optimistic
            // block is drawn in the client's own colour, so it does not change
            // colour a moment later when the real row arrives.
            clientSeq: client.seq,
          },
        });
      }

      const result = await createAppointmentAction(locale, {
        clientId,
        date: pending.date,
        startMinute: pending.startMinute,
        durationMinutes: pending.durationMinutes,
        // Told up front that a repeat is coming, so it holds the patient's
        // confirmation back and `runRepeat` sends one message covering the
        // whole course — this appointment included.
        repeats: weeks > 0,
      });

      if (!result.ok) {
        setMessage(result.error);
        return;
      }

      // Highlighted, and nothing else. Creating an appointment does not open the
      // edit dialog — staff asked to book someone, not to edit a booking.
      setHighlightId(result.data.id);
      setSelectedId(result.data.id);

      if (weeks > 0) {
        await runRepeat({
          appointmentId: result.data.id,
          clientId: result.data.clientId,
          date: pending.date,
          startMinute: pending.startMinute,
          durationMinutes: pending.durationMinutes,
          weeks,
        });
      }
    });
  }

  /**
   * Books the same slot every week for the span chosen alongside the booking,
   * and reports what took.
   *
   * The span used to be asked for in a modal that opened on every save. It is
   * a field on the create surfaces now — see `RepeatField` — so this runs only
   * when someone actually asked for a repeat, and it runs inside the same
   * transition as the booking it follows.
   *
   * It also carries the patient's message for the *whole* course, the booking
   * above included — which is why `appointmentId` is passed and why the create
   * was told to stay quiet. Awaited inside the same transition rather than left
   * to float: if this never reaches the server, nobody has been told about an
   * appointment that exists.
   */
  async function runRepeat(input: {
    /** The booking the repeat counts forward from — the first of the course. */
    appointmentId: string;
    clientId: string;
    date: string;
    startMinute: number;
    durationMinutes: number;
    weeks: number;
  }): Promise<void> {
    const result = await repeatWeeklyAction(locale, input);

    if (!result.ok) {
      setMessage(result.error);
      return;
    }

    // Three answers, not one: every week took, some weeks were refused, or none
    // were. A repeat that silently booked two of three would leave the doctor
    // believing in a month of appointments that is not there.
    const { created, skipped } = result.data;

    if (created === 0) setNotice(t('repeatBooking.none'));
    else if (skipped > 0) setNotice(t('repeatBooking.partial', { count: created, skipped }));
    else setNotice(t('repeatBooking.created', { count: created }));
  }

  /**
   * `NewClientInput`, not a hand-written shape.
   *
   * This was `{ fullName, phone? }` while the dialog asked for those two. It
   * still compiled when the dialog grew — parameter bivariance lets a narrower
   * handler satisfy a wider callback — so the date of birth and sex travelled
   * through at runtime while the types said they did not exist. Naming the
   * schema's own type is what makes the next field either arrive here or fail
   * the build, rather than arriving silently.
   */
  function createClientAndBook(client: NewClientInput, weeks: number): void {
    const pending = newClientFor?.pending;
    if (!pending) return;

    setNewClientFor(null);
    setMessage(null);
    setNotice(null);

    startTransition(async () => {
      const result = await createClientAndBookAction(locale, {
        client,
        booking: {
          date: pending.date,
          startMinute: pending.startMinute,
          durationMinutes: pending.durationMinutes,
        },
        repeats: weeks > 0,
      });

      if (!result.ok) {
        setMessage(result.error);
        return;
      }

      setHighlightId(result.data.id);
      setSelectedId(result.data.id);

      if (weeks > 0) {
        await runRepeat({
          appointmentId: result.data.id,
          clientId: result.data.clientId,
          date: pending.date,
          startMinute: pending.startMinute,
          durationMinutes: pending.durationMinutes,
          weeks,
        });
      }
    });
  }

  function save(next: Parameters<typeof updateAppointmentAction>[1] & { id: string }): void {
    setEditing(null);
    setMessage(null);

    startTransition(async () => {
      const result = await updateAppointmentAction(locale, next);
      if (!result.ok) setMessage(result.error);
    });
  }

  /** Writes the deletion. Only reached once the doctor has confirmed it. */
  function commitRemove(id: string): void {
    setMessage(null);

    startTransition(async () => {
      applyOptimistic({ type: 'remove', id });
      const result = await deleteAppointmentAction(locale, { id });
      if (!result.ok) setMessage(result.error);
    });
  }

  /** "Wednesday 5 August · 10:00", for naming an appointment in a question. */
  function whenLabel(at: { date: string; startMinute: number }): string {
    return `${formatLongDate(locale, at.date)} · ${formatMinute(locale, at.date, at.startMinute)}`;
  }

  /**
   * Right-click opens the editor, for a finished appointment too.
   *
   * It used to refuse outright — select the block, say "completed", and stop —
   * which locked away the one thing a finished appointment *can* still do.
   * `AppointmentDialog` is built for exactly this case: every field disabled,
   * no Save at all, and Delete the only live control, because deleting is the
   * sole way to remove a record entered by mistake. Refusing to open it meant
   * an appointment booked on the wrong client at the wrong hour became
   * permanent the moment it ended.
   *
   * The rule it was enforcing is not weakened by this. Editing is still
   * impossible — the dialog offers nothing to edit with, and
   * `updateAppointment` refuses the write independently, against the clinic's
   * own clock rather than the caller's.
   */
  function openAppointment(appointment: CalendarAppointment): void {
    setMessage(null);
    setEditing(appointment);
  }

  /** The gutter the grid gives up and everything above it keeps. Nothing to put back when embedded. */
  const contentInset = fullBleed ? TOOLBAR_INSET : undefined;

  /**
   * The span currently on screen, inclusive — what the picker marks.
   *
   * `days` already is that span for day and week; the month view draws no
   * columns, so its range comes from the anchor's own month.
   */
  const visibleRange =
    view === 'month'
      ? { from: startOfMonth(anchorDate), to: endOfMonth(anchorDate) }
      : { from: days[0] ?? anchorDate, to: days[days.length - 1] ?? anchorDate };

  /**
   * The picker's label: the first day on screen and the last, both in full.
   *
   * It is built from `visibleRange` rather than from the view, so the label and
   * the days the picker tints as "on screen" are read off one value and cannot
   * disagree. The month view says `1 August 2026 – 31 August 2026` for the same
   * reason the week view says `10 August 2026 – 16 August 2026`: the control
   * names the span it moves, and a month is a span like any other.
   *
   * It used to say `August 2026` there — the month named, not bounded. That is
   * shorter, and it is a different claim: it tells you which month you are in
   * without saying what the view actually covers, which is the question the
   * picker beside it answers.
   *
   * The day view keeps a single date, because a span of one day printed at both
   * ends would say the same thing twice.
   */
  const rangeLabel =
    view === 'day'
      ? formatLongDate(locale, anchorDate)
      : formatLongDateRange(locale, visibleRange.from, visibleRange.to);

  return (
    /*
      `min-h-0`: the calendar fills the area the app shell gives it and never
      grows past it, which is what leaves the scrolling to the grid rather than
      to the page.

      **It reaches past the shell's padding at the inline edges** (see
      `FULL_BLEED`). The grid is not a card sitting on a page — it *is* the
      page, and a working day boxed inside a rounded panel wasted a gutter on
      either side of every day column.

      The block padding stays at both ends. At the start because the toolbar is
      a row of controls and a control flush against the top of the viewport
      reads as clipped; at the end because the grid's own border is the last
      thing on screen, and a panel that stops exactly on the floor of the window
      reads as cut off rather than as finished. `TOOLBAR_INSET` puts the inline
      gutter back on everything above the grid, so only the grid is full-bleed.
    */
    /*
      `min-w-0 max-w-full`, so the calendar is never wider than the column it is
      given.

      Everything inside it that can exceed the viewport already scrolls inside
      its own panel — the week grid at its per-column floor, the month grid at
      its own — but a flex child defaults to `min-width: auto`, which
      is its *content*. Without this the widest of those grids could push this
      box past the shell rather than scrolling within it, which is the one thing
      the page-level rule forbids: the calendar may scroll sideways, the app may
      not.

      `max-w-full` states the ceiling the same way for the block: whatever the
      shell hands it is the most it takes.
    */
    <div
      className={cn(
        'flex min-h-0 min-w-0 max-w-full flex-col gap-3',
        fullBleed ? FULL_BLEED : 'h-full',
      )}
    >
      {/*
        `pt-4 md:pt-6` above the toolbar. The shell's own padding puts the row
        below the top of the viewport, but not by enough: the toolbar carries
        the tallest controls on the page — a 40px field and a segmented switch —
        and with only the shell's gutter above them they read as pinned to the
        edge rather than sitting on the page. The grid below is full-bleed, so
        this is the only breathing room anything above it gets, which is why it
        is a step deeper than the gap between the toolbar and the grid.
      */}
      {/*
        Moves a reader off a view their screen does not offer — a bookmarked
        month opened on a phone, or a tablet turned to portrait with the month
        grid up. The toolbar hides those segments; this is what stops the URL
        from disagreeing with it. See `CalendarViewGuard`.

        `replaceView` rather than `navigate`, so a view the screen cannot show
        never becomes a history entry the Back button bounces off.
      */}
      <CalendarViewGuard view={view} onFallback={replaceView} />

      <div className={cn('pt-4 md:pt-6', contentInset)}>
        <CalendarToolbar
          locale={locale}
          view={view}
          rangeLabel={rangeLabel}
          anchorDate={anchorDate}
          range={visibleRange}
          today={today}
          query={query}
          onQueryChange={setQuery}
          hideSearch={hideSearch}
          onViewChange={(next) => navigate({ view: next })}
          onPrevious={() => shift(-1)}
          onNext={() => shift(1)}
          // Picking a date keeps the current view and moves it there — the
          // picker answers "when", not "how much of it do I want to see".
          onDateChange={(date) => navigate({ date })}
        />
      </div>

      {message && (
        <div className={contentInset}>
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {t(message)}
          </p>
        </div>
      )}

      {notice && (
        <div className={contentInset}>
          {/*
            `status`, not `alert`: nothing is wrong, and an assertive live
            region would interrupt whatever a screen reader was saying to
            announce a success.
          */}
          <p role="status" className="rounded-lg bg-secondary px-3 py-2 text-sm text-secondary-foreground" dir="auto">
            {notice}
          </p>
        </div>
      )}

      {/*
        **A quiet day gets no message.** There used to be a "nothing booked in
        this range" line above the grid whenever a day or week was empty, and
        it was the one piece of furniture that moved: the grid jumped down a
        row the moment a booking was made and back up when it was deleted. An
        empty calendar is also not a state worth narrating — the columns are
        visibly empty, and clicking one to book is the same gesture whether
        there is anything on it or not.

        The month view's note stays, because it says something the grid cannot:
        that nothing here can be edited.
      */}
      {view === 'month' && (
        <p className={cn('text-sm text-muted-foreground', contentInset)}>{t('monthReadOnly')}</p>
      )}

      {view === 'month' ? (
        <MonthView
          anchorDate={anchorDate}
          locale={locale}
          hours={hours}
          appointments={optimisticAppointments}
          today={today}
          selectedId={selectedId}
          highlightId={highlightId}
          dimmedIds={dimmedIds}
          completedIds={completedIds}
          // Read only. A click opens that day where there is room to work.
          onOpenDay={(date) => navigate({ view: 'day', date })}
        />
      ) : (
        /*
          The clinic day is drawn at a fixed, readable slot height rather than
          squeezed to fit whatever the panel measures — a working day is
          usually taller than that, and shrinking it to avoid a scrollbar is
          what used to make every hour cramped. The body scrolls instead, and
          the bar is left visible: with scrolling as the normal case here
          rather than the exception, hiding the signal that there is more
          below would just cost someone a missed afternoon slot.

          The day headers are a separate, non-scrolling row above the
          scrolling area rather than sticky inside it — they never move, so
          sticky positioning has no work left to do.
        */
        <div
          className={cn(
            // One rule across the top and nothing else — no radius, no side or
            // block-end edge. The grid runs into the shell on three sides, so
            // the only boundary left to draw is the one between it and the
            // toolbar.
            //
            // `relative` on top of that is the positioning context for the
            // overflow cue pinned to this panel's bottom edge.
            'relative flex min-h-0 flex-1 flex-col overflow-hidden border-t border-border',
            isPending && 'opacity-90',
          )}
        >
          {/*
            One horizontal scroller wrapping both rows. They used to be two, and
            two scroll independently — so scrolling the columns left the day
            headers behind and every column sat under the wrong date. Sharing a
            single scrolling box makes that desync impossible, and leaves one
            scrollbar instead of two.
          */}
          <div className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-x-auto">
            {/*
              `relative` for the below-fold markers at the end of this block.
              They belong to this box rather than to the timeline inside it —
              this one does not scroll vertically, which is the whole point, and
              it *does* scroll horizontally, which keeps each marker under its
              own day.
            */}
            <div className="relative flex min-h-0 min-w-max flex-1 flex-col">
              {/*
                `paddingInlineEnd` reserves exactly the width the timeline's
                scrollbar takes out of the row below — see `scrollbarWidth`.
                Without it the headers divide a wider box than the columns do
                and every vertical rule drifts further out of line across the
                week.
              */}
              <div className="flex shrink-0" style={{ paddingInlineEnd: scrollbarWidth }}>
                {/* Sticky, so the hour gutter keeps its corner when scrolled. */}
                <div
                  className={cn(
                    'sticky start-0 z-30 shrink-0 border-b border-border bg-background',
                    GUTTER_WIDTH,
                    HEADER_HEIGHT,
                  )}
                />

                {days.map((date) => {
                  /*
                    Today is the whole cell tinted green-50, not a filled pip
                    behind the number. The pip marked the *date* when what is
                    current is the *column*, and at 20px across it was also the
                    one place in the shell carrying white on green-500 (3.47:1)
                    for no reason — the tint reads at a glance, runs the full
                    width of the day it belongs to, and puts green-700 on it at
                    7.37:1.
                  */
                  const isToday = date === today;
                  const muted = !isWorkingDay(date, hours) || (today !== null && date < today);

                  /*
                    ⚠ **Both of these were `text-xs`, which is the scale's
                    12px floor** — a step the design system reserves for
                    timestamps and helper text with the standing rule that
                    nothing a reader *needs* may live there. The weekday and
                    the date are how someone finds the right column before they
                    can read anything in it; they are the most needed text on
                    the screen, and they were the smallest.

                    The weekday takes the label step (13px/600 — the extra
                    weight is what keeps Arabic legible below 14px, see the
                    scale's own note) and the date takes body-sm, a step above
                    it. That size difference is also the hierarchy: the number
                    is what you scan for, the weekday is what confirms it.
                  */
                  const header = (
                    <>
                      <span className="text-label" dir="auto">
                        {formatWeekday(locale, date)}
                      </span>
                      <span
                        className={cn('text-body-sm', isToday ? 'font-bold' : 'font-semibold')}
                        dir="auto"
                      >
                        {formatDayNumber(locale, date)}
                      </span>
                    </>
                  );

                  const className = cn(
                    'flex flex-1 items-center justify-center gap-1.5 border-b border-s border-border',
                    dayMinWidth,
                    HEADER_HEIGHT,
                    // Muted for a day nothing can be booked on, whether that
                    // is because the clinic is shut or because it has gone.
                    muted && 'text-muted-foreground',
                    isToday ? 'bg-secondary text-secondary-foreground' : 'bg-background',
                  );

                  /*
                    In the week view each header is a real button that opens
                    that day — seven columns is the overview, and the moment
                    one of them is the day you care about, the day view is
                    where there is room to work. The day view's own header is
                    left inert: it would navigate to the page it is already on.
                  */
                  return view === 'week' ? (
                    <button
                      key={date}
                      type="button"
                      aria-label={formatLongDate(locale, date)}
                      onClick={() => navigate({ view: 'day', date })}
                      className={cn(
                        className,
                        'transition-colors duration-200 ease-[cubic-bezier(.2,.6,.2,1)]',
                        'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none',
                        // The same "hover fills" language the fields speak, one
                        // tint deeper on today so the current column never loses
                        // its mark by being pointed at.
                        isToday
                          ? 'hover:bg-primary-subtle'
                          : 'hover:bg-secondary hover:text-secondary-foreground',
                      )}
                    >
                      {header}
                    </button>
                  ) : (
                    <div key={date} className={className}>
                      {header}
                    </div>
                  );
                })}
              </div>

              {/*
                Padding at both ends of the scroller is what gives the opening
                and closing hours room to breathe: without it the first label
                sits hard against the day headers and the last against the
                panel's bottom edge, both touching a border and neither easy to
                read.

                **The block-end is much deeper than the block-start.** 12px is
                enough above the opening hour, which has the header row over it
                as a natural lid. The closing hour has nothing under it, so the
                same 12px left the clinic's last appointment of the day sitting
                on the floor of the window — and an appointment block that ends
                *at* closing has its bottom edge, its label and the grid's last
                rule all inside those 12px. `pb-16` gives that hour a margin of
                its own and the last block somewhere to cast a shadow.

                It was briefly four times this, chasing a gap that padding here
                could never produce: the panel itself ended on the floor of the
                window, so every pixel added inside it only moved the last hour
                further from a border that was still the last thing on screen.
                That is fixed where it belonged, in `FULL_BLEED`.

                It is scrolled space, not layout: the scroller is
                `overflow-y-auto`, so this deepens what the grid can scroll to
                rather than pushing the grid past the shell's floor.
              */}
              {/*
                `overflow-x-clip` beside the block-axis scroll, and it is what
                makes the hour gutter below actually stick.

                `overflow-y: auto` alone computes `overflow-x` from `visible` to
                `auto`, which quietly made this element a scrollport in *both*
                axes. The gutter's `sticky start-0` then resolved against this
                box rather than against the horizontal scroller two levels up —
                and since this box's content exactly fills it, it never scrolls
                sideways and the sticky offset never engaged. So on any screen
                narrower than the width the week wants — 848px, from `lg` up,
                where the column floor applies — the time labels slid away with
                the columns, and the one thing telling you which hour you were
                looking at left the screen exactly when the week had to scroll.
                The header row's corner spacer carries the identical classes and
                *does* pin, because it sits outside this box — which is the
                asymmetry that gave it away.

                `clip` rather than `hidden`: unlike `hidden` it does not force
                the other axis to become a scroll container, so this stays a
                block-axis scroller and the inline axis passes up to the one
                scroller that owns it. `plan-board.tsx` documents the same pair
                for the same reason. Nothing is clipped in practice — the
                ancestor is `min-w-max`, so this box is already as wide as its
                content and there is no inline overflow here to cut.
              */}
              <div ref={timelineRef} className="flex min-h-0 flex-1 overflow-x-clip overflow-y-auto pt-3 pb-16">
                {/* Hour gutter. Its labels use the same geometry as the blocks. */}
                <div className={cn('sticky start-0 z-30 shrink-0 bg-background', GUTTER_WIDTH)}>
                  {Array.from(
                    { length: Math.floor((hours.closeMinute - hours.openMinute) / 60) + 1 },
                    (_, index) => hours.openMinute + index * 60,
                  ).map((minute) => {
                    /*
                      The two end labels hang inwards rather than being centred
                      on their rule.

                      Every label used to be centred, which works for the hours
                      in the middle and fails at both ends: the opening hour sits
                      at y=0, so half of it was pulled above the top edge and
                      clipped, and the closing hour sits at the full grid height,
                      so half of it hung below — and a transformed box below the
                      content edge *is* scrollable overflow, which is what put a
                      scrollbar on a grid already sized to fit exactly.
                    */
                    const first = minute === hours.openMinute;
                    const last = minute >= hours.closeMinute;

                    return (
                      <span
                        key={minute}
                        /*
                          The label step, not the 12px floor. Every position on
                          this grid is read against these — a block means
                          nothing until you know which hour it is beside — so
                          the gutter is load-bearing text, not a caption. The
                          gutter is sized to hold it at that step; see
                          `GUTTER_WIDTH`, which the header's corner cell and the
                          marker row's spacer carry too.
                        */
                        className={cn(
                          'absolute end-2 text-label whitespace-nowrap text-muted-foreground tabular-nums',
                          first ? 'translate-y-0' : last ? '-translate-y-full' : '-translate-y-1/2',
                        )}
                        style={{ top: minuteToY(minute, hours.openMinute, pxPerSlot) }}
                        dir="auto"
                      >
                        {formatHour(locale, anchorDate, minute)}
                      </span>
                    );
                  })}
                </div>

              <div className="flex flex-1" data-timeline>
                {days.map((date) => {
                  const closed = !isWorkingDay(date, hours);
                  // Filtered from the *previewed* list, not the stored one, so a
                  // block dragged to another day leaves its old column and
                  // appears in the new one instead of being drawn twice.
                  const dayAppointments = previewedAppointments.filter((row) => row.date === date);

                  return (
                    <div key={date} className={cn('flex-1', dayMinWidth)}>
                      <DayColumn
                        date={date}
                        locale={locale}
                        hours={hours}
                        pxPerSlot={pxPerSlot}
                        appointments={dayAppointments}
                        now={now}
                        selectedId={selectedId}
                        highlightId={highlightId}
                        matchId={matchId}
                        dimmedIds={dimmedIds}
                        completedIds={completedIds}
                        compactAppointments={view === 'week'}
                        pending={gestures.pending}
                        isClosed={closed}
                        isPast={today !== null && date < today}
                        onCreateGesture={gestures.beginCreate}
                        onSelect={setSelectedId}
                        onOpen={openAppointment}
                        onMovePointerDown={gestures.beginMovePointerDown}
                        onResizePointerDown={gestures.beginResizePointerDown}
                        dragging={
                          gestures.dragPreview
                            ? { id: gestures.dragPreview.id, valid: gestures.dragPreview.valid }
                            : null
                        }
                      />
                    </div>
                  );
                })}
                </div>
              </div>

              {/*
                The below-fold markers: one per day that is hiding bookings,
                each under its own column, all on one line at the foot of the
                panel.

                **They sit outside the timeline, not inside it.** They were
                `sticky` chips inside each `DayColumn`, which put them at the
                mercy of the scroller they were marking: a sticky element can
                only travel inside its own containing block, so a column whose
                grid ran out early released its chip and let it ride up with the
                content while its neighbours stayed pinned — a row of markers at
                three different heights, none of them reliably the bottom of the
                screen. Out here there is no vertical scrolling to be at the
                mercy of. The row is positioned against the box that holds the
                header and the timeline, so it is on the last line of the panel
                from the first paint, before anything has been scrolled, and it
                does not move afterwards.

                It stays *inside* the horizontal scroller, though, which is what
                keeps each marker over the day it counts as the week is scrolled
                sideways. The leading spacer matches the hour gutter, and the
                `paddingInlineEnd` the timeline's scrollbar, for the same reason
                the header row carries both: three rows dividing identical space
                is what lines their columns up.

                `bottom-3` is the shell's own gutter — the marker keeps the same
                clearance from the floor of the window that the rest of the page
                does, rather than being glued into the corner.

                `pointer-events-none` on the row, restored per chip: it spans the
                full width of the grid, and a transparent strip across the bottom
                of the calendar would otherwise swallow every drag-to-book
                gesture that reached the last hour on screen.
              */}
              <div
                className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex"
                style={{ paddingInlineEnd: scrollbarWidth }}
              >
                <div className={cn('shrink-0', GUTTER_WIDTH)} />

                {days.map((date) => (
                  <div key={date} className={cn('flex flex-1 justify-center', dayMinWidth)}>
                    <BelowFoldMarker
                      count={belowFold.get(date) ?? 0}
                      onClick={revealBelowFold}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {pendingBooking && (
        <ClientPicker
          pending={pendingBooking}
          locale={locale}
          clients={clients}
          existing={existingByDate(pendingBooking.date)}
          /*
            Wherever a slot can be dragged out, the person in it can be new.

            The week used to book only from the register, on the reasoning that
            taking someone's details belonged in the day view where there was
            room to do it properly. The room turned out not to be the issue —
            the dialog is the same size either way — and the restriction landed
            on the view staff actually plan in, so the common case was: drag the
            slot, find they are not listed, throw the slot away, change view,
            drag it again.

            `month` is excluded because it opens no picker at all; naming it
            keeps that true if the month view ever gains one. A client-scoped
            calendar still overrides this outright — see `allowNewClient` on
            `CalendarProps`.
          */
          allowNewClient={allowNewClientProp ?? view !== 'month'}
          onPick={book}
          // The repeat chosen in the picker travels with the slot, so stepping
          // aside to add the person does not quietly reset it.
          onNewClient={(weeks) => {
            setNewClientFor({ pending: pendingBooking, weeks });
            setPendingBooking(null);
          }}
          onCancel={() => setPendingBooking(null)}
        />
      )}

      {presentedNewClientFor && (
        <NewClientDialog
          open={newClientFor !== null}
          pending={presentedNewClientFor.pending}
          weeks={presentedNewClientFor.weeks}
          locale={locale}
          onCreate={createClientAndBook}
          onCancel={() => setNewClientFor(null)}
        />
      )}

      {presentedEditing && (
        <AppointmentDialog
          open={editing !== null}
          appointment={presentedEditing}
          locale={locale}
          hours={hours}
          clients={clients}
          existingByDate={existingByDate}
          completed={completedIds.has(presentedEditing.id)}
          onSave={(next) => {
            // Changing the date must move the view too, or the appointment
            // vanishes from a calendar still showing the old week.
            if (next.date !== anchorDate && view === 'day') navigate({ date: next.date });
            else if (!days.includes(next.date) && view === 'week') navigate({ date: next.date });
            save(next);
          }}
          // Closes the editor and hands the decision to the confirmation below,
          // rather than opening a second modal inside the one already open.
          onDelete={() => {
            setPendingDelete(presentedEditing);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {pendingMove && (
        <ConfirmDialog
          locale={locale}
          title={t('confirmMove.title')}
          description={t('confirmMove.body', {
            name: pendingMove.appointment.clientName,
            from: whenLabel(pendingMove.appointment),
            to: whenLabel(pendingMove.next),
          })}
          /*
            A drop into a slot that has already finished is allowed — that is
            the whole point of letting a morning be rearranged in the afternoon
            — but it is a one-way door: the appointment counts as completed the
            moment it lands, and a completed appointment can only be deleted.

            Said before the write rather than discovered after it. The test is
            `hasEnded`, the same function the lock itself is built on, so the
            warning cannot drift from the rule it is warning about.
          */
          note={nowClock && hasEnded(pendingMove.next, nowClock) ? t('confirmMove.landsInPast') : undefined}
          confirmLabel={t('confirmMove.confirm')}
          cancelLabel={t('actions.cancel')}
          onConfirm={() => {
            const { appointment, next } = pendingMove;
            setPendingMove(null);
            commitMove(appointment, next);
          }}
          onCancel={() => setPendingMove(null)}
        />
      )}

      {/*
        There is no repeat dialog here any more.

        A modal opened on every single save asking whether to repeat the
        booking. Most appointments do not repeat, so the common path was book →
        dialog → dismiss, and a prompt dismissed nine times in ten stops being
        read — by the tenth it is being clicked away before it renders, which is
        the time it mattered. It also put a modal in front of the calendar at
        the one moment the calendar had just changed. The span is a field on the
        create surfaces now; see `RepeatField`.
      */}

      {pendingDelete && (
        <ConfirmDialog
          locale={locale}
          tone="destructive"
          title={t('confirmDelete.title')}
          description={t(
            // A finished appointment is a record of something that happened, so
            // removing it says more than cancelling a plan does.
            completedIds.has(pendingDelete.id) ? 'confirmDelete.bodyCompleted' : 'confirmDelete.body',
            { name: pendingDelete.clientName, when: whenLabel(pendingDelete) },
          )}
          confirmLabel={t('confirmDelete.confirm')}
          cancelLabel={t('actions.cancel')}
          onConfirm={() => {
            const { id } = pendingDelete;
            setPendingDelete(null);
            commitRemove(id);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

/**
 * "There are 3 more of this day below" — and the way down to them.
 *
 * ⚠ **This is the only cue for that fact.** There were two: a short accent rule
 * at the foot of each column, and a fade with a round chevron button across the
 * panel's bottom edge (`GridOverflowCue`, now deleted). Two marks for one fact
 * left the reader working out whether they were being told the same thing twice,
 * and the panel-wide one could not say the part worth knowing — *which* of seven
 * days was hiding something, and how much, which is the only version of the
 * question a week view raises.
 *
 * **It says how many, and it is pressable.** The rule said neither. That held
 * while it was only a cue; it does not hold for a control, which has to name
 * what it does before it is pressed — and "something is below" leaves the reader
 * to decide whether it is worth the scroll when the answer is entirely in the
 * number. One straggler at six o'clock and four bookings stacked past the fold
 * are different afternoons.
 *
 * Only `+count` is visible: the column is a seventh of a week and the marker's
 * position already says "below". The full sentence remains the accessible name,
 * where there is room for it.
 *
 * The light primary tint keeps this secondary cue visible without making it the
 * strongest control on the calendar.
 *
 * It does not pulse. A marker that animates for as long as the state holds is
 * animating for most of a working afternoon, which is both tiring at the edge of
 * vision and a promise of change from something that is not changing.
 * `animate-pulse` is also the app's skeleton vocabulary — it means "waiting for
 * this", and a booking that exists and is merely out of sight is not waiting for
 * anything.
 */
function BelowFoldMarker({ count, onClick }: { count: number; onClick: () => void }) {
  const t = useTranslations('booking');

  if (count <= 0) return null;

  return (
    <button
      type="button"
      aria-label={t('hiddenBelowAction', { count })}
      onClick={onClick}
      className={cn(
        'pointer-events-auto flex h-6 min-w-6 items-center justify-center rounded-full px-1.5',
        'bg-primary/30 text-label font-semibold text-secondary-foreground tabular-nums shadow-card',
        'transition-transform duration-(--duration-label) ease-(--ease-sweep)',
        'hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-focus-halo focus-visible:outline-none',
        'motion-reduce:transition-none motion-reduce:hover:scale-100',
      )}
    >
      <span dir="ltr">+{count}</span>
    </button>
  );
}
