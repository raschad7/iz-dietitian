'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Textarea } from '@/components/ui/textarea';
import { Link } from '@/i18n/navigation';
import { getLocaleDirection, type Locale } from '@/i18n/routing';
import { SLOT_MINUTES } from '@/lib/time-constants';

import { minuteToClock, parseDateInput } from '../date';
import { formatDuration, formatLongDate, formatMinute } from '../format';
import { type CalendarAppointment, type CalendarClient } from '../types';
import { validateBooking, type BookingErrorKey, type ClinicHours, type ExistingAppointment } from '../validation';

/**
 * The appointment's details, opened by right-clicking its block.
 *
 * A centred modal over a backdrop rather than a context menu: everything worth
 * doing to an appointment is here, so a menu would only be a list of one item.
 * Left-click is left alone to select.
 *
 * Built on the native `<dialog>` with `showModal()`, which supplies focus
 * trapping, Escape-to-close and the backdrop without a line of our own — all
 * three are easy to get subtly wrong by hand.
 */

export type AppointmentDialogProps = {
  appointment: CalendarAppointment;
  locale: Locale;
  hours: ClinicHours;
  clients: CalendarClient[];
  /** Every appointment on the currently selected date, for the overlap checks. */
  existingByDate: (date: string) => readonly ExistingAppointment[];
  completed: boolean;
  onSave: (next: {
    id: string;
    clientId: string;
    date: string;
    startMinute: number;
    durationMinutes: number;
    reason?: string;
  }) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
};

/** Duration choices: 30 minutes to 4 hours, in half-hour steps. */
const DURATION_STEP_MINUTES = 30;
const MIN_DURATION_CHOICE = 30;
const MAX_DURATION_CHOICE = 4 * 60;

function durationChoices(current: number): number[] {
  const choices: number[] = [];
  for (let minutes = MIN_DURATION_CHOICE; minutes <= MAX_DURATION_CHOICE; minutes += DURATION_STEP_MINUTES) {
    choices.push(minutes);
  }

  // Dragging snaps to 15 minutes, so an appointment can legitimately be 45
  // minutes long — a value absent from this list. Without adding it, the select
  // renders blank and the first change silently rewrites the duration.
  if (!choices.includes(current)) {
    choices.push(current);
    choices.sort((a, b) => a - b);
  }

  return choices;
}

/** Start choices: whole hours inside the clinic day. */
function startChoices(hours: ClinicHours, current: number): number[] {
  const choices: number[] = [];
  const firstHour = Math.ceil(hours.openMinute / 60) * 60;

  for (let minute = firstHour; minute < hours.closeMinute; minute += 60) {
    choices.push(minute);
  }

  // Same reasoning as durations: a block dragged to 11:30 must keep its own
  // value in the list, or opening this dialog would corrupt it.
  if (!choices.includes(current)) {
    choices.push(current);
    choices.sort((a, b) => a - b);
  }

  return choices;
}

export function AppointmentDialog({
  appointment,
  locale,
  hours,
  clients,
  existingByDate,
  completed,
  onSave,
  onDelete,
  onClose,
}: AppointmentDialogProps) {
  const t = useTranslations('booking');
  const direction = getLocaleDirection(locale);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const nativeDateRef = useRef<HTMLInputElement>(null);

  const [date, setDate] = useState(appointment.date);
  const [dateText, setDateText] = useState(appointment.date);
  const [startMinute, setStartMinute] = useState(appointment.startMinute);
  const [durationMinutes, setDurationMinutes] = useState(appointment.durationMinutes);
  /**
   * Not editable, and not sent back — the server reads it from the stored row.
   * It is still needed here because the overlap rule is keyed on it, so the live
   * validity check below has to know whose diary it is checking.
   */
  const practitionerId = appointment.practitionerId;
  const [clientId, setClientId] = useState(appointment.clientId);
  const [reason, setReason] = useState(appointment.reason ?? '');
  const [error, setError] = useState<BookingErrorKey | 'errors.invalidDate' | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog?.open) dialog?.showModal();
  }, []);

  const existing = existingByDate(date);

  const candidate = { practitionerId, clientId, date, startMinute, durationMinutes, excludeId: appointment.id };
  const liveError = validateBooking(candidate, existing, hours);

  /** Which whole-hour starts would collide, so they can be marked unavailable. */
  const unavailableStarts = useMemo(() => {
    const blocked = new Set<number>();

    for (const minute of startChoices(hours, startMinute)) {
      const failure = validateBooking(
        { practitionerId, clientId, date, startMinute: minute, durationMinutes, excludeId: appointment.id },
        existing,
        hours,
      );
      // Only overlap and closing time make a *start* unavailable; a closed day
      // disables every option and is reported once, on the date field.
      if (failure === 'errors.overlap' || failure === 'errors.outsideHours') blocked.add(minute);
    }

    return blocked;
  }, [appointment.id, clientId, date, durationMinutes, existing, hours, practitionerId, startMinute]);

  function commitDateText(raw: string): void {
    const parsed = parseDateInput(raw);

    if (!parsed) {
      // Snap back to the value that is actually stored, and say why.
      setDateText(date);
      setError('errors.invalidDate');
      return;
    }

    setDate(parsed);
    setDateText(parsed);
    setError(null);
  }

  function save(): void {
    if (liveError) {
      setError(liveError);
      return;
    }

    onSave({
      id: appointment.id,
      clientId,
      date,
      startMinute,
      durationMinutes,
      reason: reason.trim() === '' ? undefined : reason.trim(),
    });
  }

  const message = error ?? liveError;

  return (
    <dialog
      ref={dialogRef}
      dir={direction}
      aria-label={t('dialog.title')}
      className={[
        // Bottom sheet on small screens, centred card from `sm` up.
        'w-full max-w-none rounded-t-2xl p-0 backdrop:bg-black/40',
        'mt-auto mb-0 sm:m-auto sm:w-[min(28rem,calc(100vw-2rem))] sm:rounded-2xl',
        'bg-popover text-popover-foreground border border-border shadow-xl',
      ].join(' ')}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop targets the dialog element itself.
        if (event.target === dialogRef.current) dialogRef.current?.close();
      }}
    >
      <form method="dialog" className="flex flex-col gap-3 p-4 text-start" onSubmit={(event) => event.preventDefault()}>
        <header className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold" dir="auto">
              {appointment.clientName}
            </h2>
            <p className="text-xs text-muted-foreground" dir="auto">
              {formatLongDate(locale, date)} · {formatMinute(locale, date, startMinute)}
            </p>
          </div>

          {completed && (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[0.625rem] font-semibold tracking-wide uppercase text-muted-foreground">
              {t('completed')}
            </span>
          )}
        </header>

        {/* 1. Date — typed, or picked from the browser's own calendar. */}
        <div className="space-y-1">
          <Label htmlFor="appointment-date">{t('fields.date')}</Label>
          <div className="flex items-center gap-1.5">
            <Input
              id="appointment-date"
              value={dateText}
              dir="ltr"
              inputMode="numeric"
              placeholder={t('fields.datePlaceholder')}
              onChange={(event) => setDateText(event.target.value)}
              onBlur={(event) => commitDateText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                commitDateText(event.currentTarget.value);
              }}
            />

            <div className="relative shrink-0">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={t('fields.openDatePicker')}
                onClick={() => {
                  const input = nativeDateRef.current;
                  if (!input) return;
                  // `showPicker()` throws on an element that is not rendered, so
                  // the input below is kept in the layout and made invisible
                  // rather than hidden with `display: none`.
                  input.showPicker();
                }}
              >
                <CalendarDays />
              </Button>

              <input
                ref={nativeDateRef}
                type="date"
                tabIndex={-1}
                aria-hidden
                value={date}
                onChange={(event) => commitDateText(event.target.value)}
                className="pointer-events-none absolute inset-0 size-full opacity-0"
              />
            </div>
          </div>
        </div>

        {/* 2. Start — whole hours only. */}
        <div className="space-y-1">
          <Label htmlFor="appointment-start">{t('fields.start')}</Label>
          <SelectField
            id="appointment-start"
            value={String(startMinute)}
            onChange={(event) => setStartMinute(Number(event.target.value))}
          >
            {startChoices(hours, startMinute).map((minute) => (
              <option key={minute} value={minute} disabled={unavailableStarts.has(minute)}>
                {minuteToClock(minute)}
                {unavailableStarts.has(minute) ? ` — ${t('fields.unavailable')}` : ''}
              </option>
            ))}
          </SelectField>
        </div>

        {/* 3. Duration — half-hour steps. */}
        <div className="space-y-1">
          <Label htmlFor="appointment-duration">{t('fields.duration')}</Label>
          <SelectField
            id="appointment-duration"
            value={String(durationMinutes)}
            onChange={(event) => setDurationMinutes(Number(event.target.value))}
          >
            {durationChoices(durationMinutes).map((minutes) => (
              <option key={minutes} value={minutes}>
                {formatDuration(minutes, {
                  hour: (n) => t('duration.hours', { count: n }),
                  minute: (n) => t('duration.minutes', { count: n }),
                })}
                {minutes % DURATION_STEP_MINUTES !== 0 ? ` (${minutes / SLOT_MINUTES}×${SLOT_MINUTES})` : ''}
              </option>
            ))}
          </SelectField>
        </div>

        {/* 4. Client, with a way through to the full record. */}
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="appointment-client">{t('fields.client')}</Label>
            <Link
              href={`/app/clients/${clientId}/edit`}
              className="text-xs text-primary underline-offset-4 hover:underline"
            >
              {t('fields.editClient')}
            </Link>
          </div>
          <SelectField
            id="appointment-client"
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
          >
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
            {/* The booked client may be archived and so absent from the list. */}
            {!clients.some((client) => client.id === appointment.clientId) && (
              <option value={appointment.clientId}>{appointment.clientName}</option>
            )}
          </SelectField>
        </div>

        {/* 5. Reason — optional, and empty unless someone types something. */}
        <div className="space-y-1">
          <Label htmlFor="appointment-reason">
            {t('fields.reason')} <span className="text-muted-foreground">{t('fields.optional')}</span>
          </Label>
          <Textarea
            id="appointment-reason"
            rows={2}
            value={reason}
            placeholder={t('fields.reasonPlaceholder')}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>

        {message && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {t(message)}
          </p>
        )}

        <div className="mt-1 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              onDelete(appointment.id);
              dialogRef.current?.close();
            }}
          >
            <Trash2 data-icon="inline-start" />
            {t('actions.delete')}
          </Button>

          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => dialogRef.current?.close()}>
              {t('actions.cancel')}
            </Button>
            <Button type="button" size="sm" disabled={liveError !== null} onClick={save}>
              {t('actions.save')}
            </Button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
