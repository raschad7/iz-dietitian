'use client';

import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useOptimistic, useRef, useState, useTransition } from 'react';

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
import { isCompleted } from '../completed';
import { minuteToY } from '../geometry';
import { type CalendarView } from '../schema';
import { type ActionErrorKey, type CalendarAppointment, type CalendarClient } from '../types';
import { useCalendarClock } from '../use-calendar-clock';
import { useCalendarGestures, type BookingRequest } from '../use-calendar-gestures';
import { useFittedSlotHeight } from '../use-fitted-grid';
import { isWorkingDay, type ClinicHours, type ExistingAppointment } from '../validation';
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

  const handleCommitMove = useCallback(
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

  function remove(id: string): void {
    setEditing(null);
    setMessage(null);

    startTransition(async () => {
      applyOptimistic({ type: 'remove', id });
      const result = await deleteAppointmentAction(locale, { id });
      if (!result.ok) setMessage(result.error);
    });
  }

  const today = now ? toIsoDate(now) : null;

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
          <div className="flex min-h-0 flex-1 flex-col overflow-x-auto">
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
                      !isWorkingDay(date, hours) && 'text-muted-foreground',
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

              <div ref={gridAreaRef} className="flex min-h-0 flex-1 overflow-y-auto">
                {/* Hour gutter. Its labels use the same geometry as the blocks. */}
                <div className="sticky start-0 z-30 w-16 shrink-0 bg-background">
                {Array.from(
                  { length: Math.floor((hours.closeMinute - hours.openMinute) / 60) + 1 },
                  (_, index) => hours.openMinute + index * 60,
                ).map((minute) => (
                  <span
                    key={minute}
                    className="absolute end-2 -translate-y-1/2 text-xs font-medium whitespace-nowrap text-muted-foreground tabular-nums"
                    style={{ top: minuteToY(minute, hours.openMinute, pxPerSlot) }}
                    dir="auto"
                  >
                    {formatMinute(locale, anchorDate, minute)}
                  </span>
                ))}
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
                        onCreateGesture={gestures.beginCreate}
                        onSelect={setSelectedId}
                        onOpen={(appointment) => setEditing(appointment)}
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
          completed={completedIds.has(editing.id)}
          onSave={(next) => {
            // Changing the date must move the view too, or the appointment
            // vanishes from a calendar still showing the old week.
            if (next.date !== anchorDate && view === 'day') navigate({ date: next.date });
            else if (!days.includes(next.date) && view === 'week') navigate({ date: next.date });
            save(next);
          }}
          onDelete={remove}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
