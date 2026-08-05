'use client';

import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ClientFormTrigger } from '@/features/clients/components/client-form-trigger';
import { Link } from '@/i18n/navigation';
import { getLocaleDirection, type Locale } from '@/i18n/routing';
import { SLOT_MINUTES } from '@/lib/time-constants';

import { minuteToClock, parseDateInput } from '../date';
import { formatDuration, formatLongDate, formatMinute } from '../format';
import { type CalendarAppointment, type CalendarClient } from '../types';
import {
  validateBooking,
  type BookingErrorKey,
  type ClinicHours,
  type ExistingAppointment,
} from '../validation';

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

  const existing = existingByDate(date);

  const candidate = {
    practitionerId,
    clientId,
    date,
    startMinute,
    durationMinutes,
    excludeId: appointment.id,
    // No floor. Staff may put an appointment on any date they like — see the
    // note on `earliestDate`; the portal is the caller that still has one.
    earliestDate: null,
  };
  const liveError: BookingErrorKey | null = validateBooking(candidate, existing, hours);

  /** Which whole-hour starts would collide, so they can be marked unavailable. */
  const unavailableStarts = useMemo(() => {
    const blocked = new Set<number>();

    for (const minute of startChoices(hours, startMinute)) {
      const failure = validateBooking(
        {
          practitionerId,
          clientId,
          date,
          startMinute: minute,
          durationMinutes,
          excludeId: appointment.id,
          earliestDate: null,
        },
        existing,
        hours,
      );
      // Only overlap and closing time make a *start* unavailable; a closed day
      // disables every option and is reported once, on the date field. An hour
      // that has already gone is not among them — the clinic writes up its own
      // morning, so every hour of a bookable day stays selectable.
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
    <Dialog open onClose={onClose} label={t('dialog.title')} dir={direction}>
      <form method="dialog" onSubmit={(event) => event.preventDefault()}>
        {/*
          No X in the corner. The footer of this card already ends in Cancel —
          Close, once the appointment is finished — and Escape and a backdrop
          click both close a `<dialog>` natively, so the third exit was only
          crowding the corner the client's name starts from. Same reasoning as
          the client card; see `DialogHeader`, where the X is opt-in.
        */}
        <DialogHeader
          title={appointment.clientName}
          description={`${formatLongDate(locale, date)} · ${formatMinute(locale, date, startMinute)}`}
        >
          {/*
            No `uppercase` here or anywhere client-facing: Arabic has no letter
            case for it to act on, so it changes the Latin build only and the
            two stop matching.
          */}
          {completed ? <Badge variant="muted">{t('completed')}</Badge> : null}
        </DialogHeader>

        <DialogBody>
        {/*
          1. Date — typed, or picked from the app's own calendar.

          The typed field stays: staff who know the date are faster with six
          keystrokes than with any grid, and `parseDateInput` accepts the two
          forms they actually type. The button beside it used to hand off to
          `<input type="date">`'s browser popup, which looked like nothing else
          in the app, was styled by the OS rather than the design system, and
          paged a month at a time. It now opens `DatePicker`, whose caption is a
          month and a year dropdown.

          No `min`. The browser's picker used to grey out every day before
          today, which made this the one place in the calendar that could not
          record a visit on the day it happened — and it was only half a rule
          anyway, since the field beside it always accepted a typed date. Any
          date is bookable; a closed day or a clash is still refused, and says
          which.
        */}
        <div className="space-y-1">
          <Label htmlFor="appointment-date">{t('fields.date')}</Label>
          <div className="flex items-center gap-1.5">
            <Input
              id="appointment-date"
              disabled={completed}
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

            <div className="shrink-0">
              <DatePicker
                trigger="icon"
                locale={locale}
                value={date}
                disabled={completed}
                label={t('fields.openDatePicker')}
                onChange={commitDateText}
              />
            </div>
          </div>
        </div>

        {/* 2. Start — whole hours only. */}
        <div className="space-y-1">
          <Label htmlFor="appointment-start">{t('fields.start')}</Label>
          <Select
            id="appointment-start"
            disabled={completed}
            value={String(startMinute)}
            onChange={(event) => setStartMinute(Number(event.target.value))}
          >
            {startChoices(hours, startMinute).map((minute) => (
              <option key={minute} value={minute} disabled={unavailableStarts.has(minute)}>
                {minuteToClock(minute)}
                {unavailableStarts.has(minute) ? ` — ${t('fields.unavailable')}` : ''}
              </option>
            ))}
          </Select>
        </div>

        {/* 3. Duration — half-hour steps. */}
        <div className="space-y-1">
          <Label htmlFor="appointment-duration">{t('fields.duration')}</Label>
          <Select
            id="appointment-duration"
            disabled={completed}
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
          </Select>
        </div>

        {/* 4. Client, with a way through to the full record. */}
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="appointment-client">{t('fields.client')}</Label>

            <div className="flex items-center gap-3">
              {/*
                The client card opens *over* this one rather than replacing it:
                correcting a phone number mid-booking must not cost the booking.
                Both are modal `<dialog>`s, so the newer one stacks in the top
                layer and Escape closes it first.
              */}
              <ClientFormTrigger
                locale={locale}
                clientId={clientId}
                className="text-xs text-primary underline-offset-4 hover:underline"
              >
                {t('fields.editClient')}
              </ClientFormTrigger>

              {/*
                The way to the client's whole record, which used to be an arrow
                on the block itself — see `AppointmentBlock`, where that corner
                now opens this dialog. It reads the *selected* client rather
                than the booked one, so it always points at whoever the field
                above is currently naming.

                A real navigation, so it leaves the calendar: unlike the card
                above, a profile is a page, and there is nothing here that a
                staff member can lose by going to it — every edit in this dialog
                is either already saved or explicitly cancelled.
              */}
              <Link
                href={`/app/clients/${clientId}`}
                className="inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
              >
                {t('openClientProfile')}
                <Icon name="chevronEnd" className="size-3" />
              </Link>
            </div>
          </div>
          <Select
            id="appointment-client"
            disabled={completed}
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
          </Select>
        </div>

        {/* 5. Reason — optional, and empty unless someone types something. */}
        <div className="space-y-1">
          <Label htmlFor="appointment-reason">
            {t('fields.reason')} <span className="text-muted-foreground">{t('fields.optional')}</span>
          </Label>
          <Textarea
            id="appointment-reason"
            disabled={completed}
            rows={2}
            value={reason}
            placeholder={t('fields.reasonPlaceholder')}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>

        {message && !completed && (
          <p role="alert" className="rounded-md bg-destructive-subtle px-3 py-2 text-body-md text-destructive">
            {t(message)}
          </p>
        )}

        {completed && (
          <p className="rounded-md bg-muted px-3 py-2 text-body-md text-muted-foreground">{t('errors.completedLocked')}</p>
        )}
        </DialogBody>

        <DialogFooter className="justify-between">
          {/*
            Delete stays available on a finished appointment, and it is the only
            thing that is. Editing one silently rewrites what happened; deleting
            is the sole way to remove a record entered by mistake.

            The confirmation is the calendar's, not this dialog's: a modal
            `<dialog>` opened inside another one stacks in the top layer but
            makes focus and the backdrop fiddly, and the calendar is where every
            other write already lives. This closes and hands the decision up.
          */}
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              onDelete(appointment.id);
              onClose();
            }}
          >
            <Icon name="trash" data-icon="inline-start" />
            {t('actions.delete')}
          </Button>

          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              {completed ? t('actions.close') : t('actions.cancel')}
            </Button>
            {/*
              No Save at all on a finished appointment — the capability is
              absent, not merely disabled with a tooltip. The server refuses the
              same edit independently, in `updateAppointment`.
            */}
            {!completed && (
              <Button type="button" size="sm" disabled={liveError !== null} onClick={save}>
                {t('actions.save')}
              </Button>
            )}
          </div>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
