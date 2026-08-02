'use client';

import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useOptimistic, useRef, useState, useTransition } from 'react';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useRouter } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { normalizeForSearch } from '@/features/clients/search';
import { cn } from '@/lib/utils';

import {
  createAppointmentAction,
  createClientAndBookAction,
  deleteAppointmentAction,
  updateAppointmentAction,
} from '../actions';
import { addDays, addMonths, eachDay, startOfWeek, toIsoDate } from '../date';
import { formatDayNumber, formatLongDate, formatMinute, formatMonthYear, formatWeekday } from '../format';
import { isCompleted, localWallClock } from '../completed';
import { minuteToY } from '../geometry';
import { type CalendarView } from '../schema';
import { type ActionErrorKey, type CalendarAppointment, type CalendarClient } from '../types';
import { useCalendarClock } from '../use-calendar-clock';
import { useCalendarGestures, type BookingRequest } from '../use-calendar-gestures';
import { useFittedSlotHeight } from '../use-fitted-grid';
import { isWorkingDay, movesIntoThePast, type ClinicHours, type ExistingAppointment } from '../validation';
import { AppointmentDialog } from './appointment-dialog';
import { CalendarToolbar } from './calendar-toolbar';
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
 * Seven of these plus the hour gutter come to well under a typical content
 * width, so a week fits without a horizontal scrollbar; a day view simply lets
 * its single column take the rest of the space.
 */
const DAY_MIN_WIDTH = 'min-w-28';

export type CalendarProps = {
  locale: Locale;
  view: CalendarView;
  /** The date the view is built around, `YYYY-MM-DD`. */
  anchorDate: string;
  hours: ClinicHours;
  appointments: CalendarAppointment[];
  clients: CalendarClient[];
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
   * is the courtesy answer that keeps a past day from being offered at all.
   */
  const today = now ? toIsoDate(now) : null;

  /**
   * The same instant, to the minute. `today` bounds *creating* a booking to
   * whole dates; this bounds *moving* one, which is finer — an appointment may
   * not be dragged to nine this morning at three this afternoon.
   */
  const nowClock = now ? localWallClock(now) : null;

  /**
   * The measured timeline body. Its height decides the slot height, which is
   * what makes the whole clinic day fit without a scrollbar.
   */
  const gridAreaRef = useRef<HTMLDivElement>(null);
  const pxPerSlot = useFittedSlotHeight(gridAreaRef, hours);

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

  const [pendingBooking, setPendingBooking] = useState<PendingBooking | null>(null);
  const [newClientFor, setNewClientFor] = useState<PendingBooking | null>(null);
  const [editing, setEditing] = useState<CalendarAppointment | null>(null);
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
   * Day, week and month are separate routes, so switching view is a navigation,
   * not a query-string flip. The date rides along as a search param because it
   * is a position within a view rather than a different page.
   */
  function navigate(next: { view?: CalendarView; date?: string }): void {
    const params = new URLSearchParams(searchParams.toString());
    params.set('date', next.date ?? anchorDate);
    router.push(`/app/calendar/${next.view ?? view}?${params.toString()}`);
  }

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
      // Refused here rather than after the confirmation: asking "are you sure?"
      // and then rejecting the answer wastes the doctor's time and a round trip.
      // The server refuses it independently — this is the courtesy half.
      if (movesIntoThePast(next, appointment, nowClock)) {
        // The same precedence the server uses: a drop on an earlier day is a
        // date that has gone, and only an earlier hour of today is a time.
        setMessage(today !== null && next.date < today ? 'errors.pastDate' : 'errors.pastTime');
        return;
      }

      if (next.date !== appointment.date || next.startMinute !== appointment.startMinute) {
        setPendingMove({ appointment, next });
        return;
      }

      commitMove(appointment, next);
    },
    [commitMove, nowClock, today],
  );

  const gestures = useCalendarGestures({
    hours,
    existing,
    practitionerId,
    today,
    now: nowClock,
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

  function book(clientId: string): void {
    const pending = pendingBooking;
    if (!pending) return;

    setPendingBooking(null);
    setMessage(null);

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
            clientColor: client.color,
          },
        });
      }

      const result = await createAppointmentAction(locale, {
        clientId,
        date: pending.date,
        startMinute: pending.startMinute,
        durationMinutes: pending.durationMinutes,
      });

      if (!result.ok) {
        setMessage(result.error);
        return;
      }

      // Highlighted, and nothing else. Creating an appointment does not open the
      // edit dialog — staff asked to book someone, not to edit a booking.
      setHighlightId(result.data.id);
      setSelectedId(result.data.id);
    });
  }

  function createClientAndBook(client: { fullName: string; phone?: string }): void {
    const pending = newClientFor;
    if (!pending) return;

    setNewClientFor(null);
    setMessage(null);

    startTransition(async () => {
      const result = await createClientAndBookAction(locale, {
        client,
        booking: {
          date: pending.date,
          startMinute: pending.startMinute,
          durationMinutes: pending.durationMinutes,
        },
      });

      if (!result.ok) {
        setMessage(result.error);
        return;
      }

      setHighlightId(result.data.id);
      setSelectedId(result.data.id);
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
   * Right-click opens the editor — unless the appointment has finished.
   *
   * A finished appointment is a record of what happened, so the editor does not
   * open for one at all. It still selects and still says why, because a
   * right-click that does nothing reads as a broken calendar rather than a rule.
   *
   * The policy lives here rather than in the block, because this is where
   * `completedIds` is derived; the block would have to be told twice.
   */
  function openAppointment(appointment: CalendarAppointment): void {
    if (completedIds.has(appointment.id)) {
      setSelectedId(appointment.id);
      setMessage('errors.completedLocked');
      return;
    }

    setMessage(null);
    setEditing(appointment);
  }

  const rangeLabel =
    view === 'month'
      ? formatMonthYear(locale, anchorDate)
      : view === 'day'
        ? formatLongDate(locale, anchorDate)
        : `${formatLongDate(locale, days[0] ?? anchorDate)} – ${formatLongDate(locale, days[days.length - 1] ?? anchorDate)}`;

  return (
    // `h-full` and `min-h-0`: the calendar fills the area the app shell gives it
    // and never grows past it, which is what leaves the scrolling to the grid
    // rather than to the page.
    <div className="flex h-full min-h-0 flex-col gap-3">
      <CalendarToolbar
        locale={locale}
        view={view}
        rangeLabel={rangeLabel}
        query={query}
        onQueryChange={setQuery}
        onViewChange={(next) => navigate({ view: next })}
        onToday={() => navigate({ date: today ?? anchorDate })}
        onPrevious={() => shift(-1)}
        onNext={() => shift(1)}
      />

      {message && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(message)}
        </p>
      )}

      {/*
        A one-line hint rather than a full empty state: the grid itself is the
        thing to look at, and the point worth making is only that clicking it
        does something.
      */}
      {view === 'month' ? (
        // Says why nothing here can be edited, so a doctor who tries to drag a
        // chip knows where to go rather than assuming it is broken.
        <p className="text-sm text-muted-foreground">{t('monthReadOnly')}</p>
      ) : (
        optimisticAppointments.length === 0 && <p className="text-sm text-muted-foreground">{t('empty')}</p>
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
          The whole clinic day fits the panel — no vertical scrollbar, and every
          hour label on screen at once. `gridAreaRef` is measured, the slot
          height is divided out of that height, and the columns are drawn to
          exactly it. `overflow-y-auto` is a safety net for a viewport so short
          that a slot would fall under `MIN_PX_PER_SLOT`; in normal use nothing
          overflows, so no bar appears.

          The day headers are a separate, non-scrolling row above the measured
          area rather than sticky inside it — with nothing scrolling, sticky had
          no work left to do.
        */
        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border',
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
            <div className="flex min-h-0 min-w-max flex-1 flex-col">
              <div className="flex shrink-0">
                {/* Sticky, so the hour gutter keeps its corner when scrolled. */}
                <div
                  className={cn(
                    'sticky start-0 z-30 w-16 shrink-0 border-b border-border bg-background',
                    HEADER_HEIGHT,
                  )}
                />

                {days.map((date) => (
                  <div
                    key={date}
                    className={cn(
                      'flex flex-1 items-center justify-center gap-1.5 border-b border-s border-border bg-background',
                      DAY_MIN_WIDTH,
                      HEADER_HEIGHT,
                      // Muted for a day nothing can be booked on, whether that
                      // is because the clinic is shut or because it has gone.
                      (!isWorkingDay(date, hours) || (today !== null && date < today)) && 'text-muted-foreground',
                    )}
                  >
                    <span className="text-xs font-medium" dir="auto">
                      {formatWeekday(locale, date)}
                    </span>
                    <span
                      className={cn(
                        'flex size-5 items-center justify-center rounded-full text-xs',
                        date === today && 'bg-primary font-semibold text-primary-foreground',
                      )}
                      dir="auto"
                    >
                      {formatDayNumber(locale, date)}
                    </span>
                  </div>
                ))}
              </div>

              {/*
                `overflow-y-auto` is kept as the safety net it always was — a
                window too short for the clinic day at a readable slot height
                still scrolls rather than clipping the afternoon away — but the
                bar itself is hidden. In normal use the grid is fitted to this
                panel exactly and there is nothing to scroll.

                `py-3` is what gives the opening and closing hours room to
                breathe. Without it the first label sits hard against the day
                headers and the last against the panel's bottom edge, both of
                them touching a border and neither easy to read.

                It costs nothing to keep in step: this is the element the
                `ResizeObserver` measures, and `contentRect` reports the *content*
                box — so the fitted slot height already excludes this padding and
                the grid still ends exactly where the padding begins.
              */}
              <div ref={gridAreaRef} className="no-scrollbar flex min-h-0 flex-1 overflow-y-auto py-3">
                {/* Hour gutter. Its labels use the same geometry as the blocks. */}
                <div className="sticky start-0 z-30 w-16 shrink-0 bg-background">
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
                        className={cn(
                          'absolute end-2 text-xs font-medium whitespace-nowrap text-muted-foreground tabular-nums',
                          first ? 'translate-y-0' : last ? '-translate-y-full' : '-translate-y-1/2',
                        )}
                        style={{ top: minuteToY(minute, hours.openMinute, pxPerSlot) }}
                        dir="auto"
                      >
                        {formatMinute(locale, anchorDate, minute)}
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
                    <div key={date} className={cn('flex-1', DAY_MIN_WIDTH)}>
                      <DayColumn
                        date={date}
                        locale={locale}
                        hours={hours}
                        pxPerSlot={pxPerSlot}
                        appointments={dayAppointments}
                        now={now}
                        selectedId={selectedId}
                        highlightId={highlightId}
                        dimmedIds={dimmedIds}
                        completedIds={completedIds}
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
          // Only the day view takes someone's details; the week books people
          // already on the register.
          allowNewClient={view === 'day'}
          onPick={book}
          onNewClient={() => {
            setNewClientFor(pendingBooking);
            setPendingBooking(null);
          }}
          onCancel={() => setPendingBooking(null)}
        />
      )}

      {newClientFor && (
        <NewClientDialog
          pending={newClientFor}
          locale={locale}
          onCreate={createClientAndBook}
          onCancel={() => setNewClientFor(null)}
        />
      )}

      {editing && (
        <AppointmentDialog
          appointment={editing}
          locale={locale}
          hours={hours}
          clients={clients}
          existingByDate={existingByDate}
          today={today}
          now={nowClock}
          completed={completedIds.has(editing.id)}
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
            setPendingDelete(editing);
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
