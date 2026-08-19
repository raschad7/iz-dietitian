'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Textarea } from '@/components/ui/textarea';
import { parseDateInput } from '@/features/booking/date';
import { formatDuration, formatLongDate, formatMinute } from '@/features/booking/format';
import { DEFAULT_DURATION_MINUTES, type ClinicHours } from '@/features/booking/validation';
import { getLocaleDirection, type Locale } from '@/i18n/routing';
import { MINUTES_PER_DAY } from '@/lib/time-constants';

import { type StaffAppointmentRequest } from '../types';

/**
 * Answering one appointment request.
 *
 * **The time is editable, and that is the point of the screen.** A dietitian
 * approving "Tuesday 10:00" with "Tuesday 10:30" is the ordinary case, not an
 * exception — so the fields open pre-filled with what the client asked for and
 * are changed before confirming, rather than the dialog being a yes/no on a
 * fixed slot.
 *
 * Nothing is validated here beyond the date parsing. The booking rules run on
 * the server inside the write transaction, against rows read at that moment —
 * see `../mutations.ts`. A local copy of them would be a second opinion free to
 * disagree with the one that decides.
 *
 * A cancellation gets no fields at all: it proposes no time, and approving it
 * deletes the appointment. The dialog says exactly that instead of presenting a
 * picker that would do nothing.
 */

export type ApproveDialogProps = {
  open: boolean;
  request: StaffAppointmentRequest;
  locale: Locale;
  /** Null when the clinic's schedule is incomplete; the day is offered whole. */
  hours: ClinicHours | null;
  /** Clinic-local today, the fallback date when a request proposes none. */
  today: string;
  pending: boolean;
  /** A rejection to show, already translated by the caller. */
  error: string | null;
  onConfirm: (input: { date: string; startMinute: number; durationMinutes: number; reason?: string }) => void;
  onClose: () => void;
};

/**
 * Local rather than from `src/lib/time-constants.ts`, whose stated contract is
 * the values the database schema and the pure validator must agree on. An hour
 * is sixty minutes everywhere; it is not a rule those two share.
 */
const MINUTES_PER_HOUR = 60;

/**
 * Durations: half an hour and its multiples, up to four hours.
 *
 * A consultation is booked in half hours, so the ladder is built from one
 * rather than from the calendar's fifteen-minute quantum — 45 minutes was never
 * an answer anyone gave to "how long shall I give them?".
 *
 * These are the same bounds and the same step the calendar's own appointment
 * dialog offers, which is the point: an appointment created by approving a
 * request and one created by clicking the grid should be capable of exactly the
 * same lengths, or the two paths would quietly produce different clinics.
 */
const DURATION_STEP_MINUTES = 30;
const MAX_DURATION_CHOICE = 4 * MINUTES_PER_HOUR;

function durationChoices(current: number): number[] {
  const choices: number[] = [];

  for (
    let minutes = DURATION_STEP_MINUTES;
    minutes <= MAX_DURATION_CHOICE;
    minutes += DURATION_STEP_MINUTES
  ) {
    choices.push(minutes);
  }

  /**
   * A length already in play that is not on the half hour has to stay
   * selectable, or approving a reschedule would silently reshape the
   * appointment.
   *
   * Not hypothetical, and not fixed by this list matching the calendar
   * dialog's: dragging a block snaps to `SLOT_MINUTES`, which is fifteen, so a
   * 45-minute appointment is a legitimate row that neither picker offers. The
   * calendar's own dialog carries the same guard for the same reason.
   */
  if (!choices.includes(current)) {
    choices.push(current);
    choices.sort((a, b) => a - b);
  }

  return choices;
}

/**
 * Start choices: the whole hours the clinic is open — 1:00, 2:00, 3:00 …
 *
 * The same grid the calendar's own appointment dialog offers, and for the same
 * reason: a consultation is booked on the hour, and the length of it is what
 * the duration field is for. An earlier version of this dialog offered quarter
 * hours on the theory that approving is *adjusting* someone else's proposal —
 * but clients no longer propose a time at all, so there is nothing to nudge and
 * a list four times as long only made the common choice harder to find.
 *
 * Rounded *up* from opening time, so a clinic opening at 08:10 first offers
 * 09:00 rather than an 08:00 it is shut for.
 *
 * With no schedule on file the whole day is offered. The server still refuses a
 * closed hour and says so, which is a better answer than an empty picker.
 */
function startChoices(hours: ClinicHours | null, current: number): number[] {
  const from = hours ? Math.ceil(hours.openMinute / MINUTES_PER_HOUR) * MINUTES_PER_HOUR : 0;
  const to = hours ? hours.closeMinute : MINUTES_PER_DAY;

  const choices: number[] = [];

  for (let minute = from; minute < to; minute += MINUTES_PER_HOUR) {
    choices.push(minute);
  }

  /**
   * A time already in play that is not on the hour must stay selectable, or
   * opening this dialog would silently move the appointment. Two ways that
   * happens: a reschedule of a block dragged to 10:30 in the calendar, and an
   * old request from back when clients named their own time.
   */
  if (!choices.includes(current)) {
    choices.push(current);
    choices.sort((a, b) => a - b);
  }

  return choices;
}

export function ApproveDialog({
  open,
  request,
  locale,
  hours,
  today,
  pending,
  error,
  onConfirm,
  onClose,
}: ApproveDialogProps) {
  const t = useTranslations('requests');
  /**
   * The form's own labels come from `booking`, not from `requests`.
   *
   * "Date", "Start time", "Duration", "Reason" and "that date is not valid"
   * already exist there, written for the dialog this one is a sibling of. A
   * second copy under `requests` would be two strings to keep in step in two
   * languages, and the first day they disagreed the two dialogs would be
   * labelling the same field differently.
   */
  const tBooking = useTranslations('booking');
  const direction = getLocaleDirection(locale);

  /**
   * Opens on the day the client asked for, falling back to the appointment being
   * moved and then to today.
   */
  const initialDate = request.preferredDate ?? request.appointment?.date ?? today;

  /**
   * The hour, which is this dialog's whole reason for existing.
   *
   * The client's own requested time comes first: they now pick one from the
   * hours the clinic actually had open, so it is a real proposal rather than a
   * guess, and opening on anything else would make the dietitian re-find it.
   * Approving unchanged grants exactly what was asked for. Failing that — a
   * cancellation, or a row filed during the spell when clients named only a day
   * — the appointment being moved keeps its current hour, and a brand-new
   * request opens at the clinic's own opening time.
   *
   * The final `0` is midnight and would be a silly default to offer, which is
   * why it sits behind `hours`: it is reached only when the clinic has no
   * schedule on file at all, the same case that makes the picker offer the whole
   * day. The dietitian changes it, and the server refuses a closed hour.
   */
  const initialStart =
    request.preferredStartMinute ?? request.appointment?.startMinute ?? hours?.openMinute ?? 0;

  const [date, setDate] = useState(initialDate);
  const [dateText, setDateText] = useState(initialDate);
  const [startMinute, setStartMinute] = useState(initialStart);
  const [durationMinutes, setDurationMinutes] = useState(
    request.appointment?.durationMinutes ?? DEFAULT_DURATION_MINUTES,
  );
  const [reason, setReason] = useState('');
  const [dateError, setDateError] = useState(false);

  const isCancellation = request.kind === 'cancel';

  function commitDateText(raw: string): void {
    const parsed = parseDateInput(raw);

    if (!parsed) {
      // Snap back to the value actually held, and say why.
      setDateText(date);
      setDateError(true);
      return;
    }

    setDate(parsed);
    setDateText(parsed);
    setDateError(false);
  }

  function confirm(): void {
    if (dateError) return;

    onConfirm({
      date,
      startMinute,
      durationMinutes,
      reason: reason.trim() === '' ? undefined : reason.trim(),
    });
  }

  const durationLabel = (minutes: number) =>
    formatDuration(minutes, {
      hour: (n) => tBooking('duration.hours', { count: n }),
      minute: (n) => tBooking('duration.minutes', { count: n }),
    });

  return (
    <Dialog open={open} onClose={onClose} label={t(`approve.${request.kind}.title`)} dir={direction}>
      <form method="dialog" onSubmit={(event) => event.preventDefault()}>
        <DialogHeader
          title={request.clientName}
          description={t(`approve.${request.kind}.title`)}
          onClose={onClose}
          closeLabel={tBooking('actions.close')}
        />

        <DialogBody>
          {/*
            What the client actually asked for, kept on screen while the fields
            below are changed away from it. Without this the dietitian loses the
            request the moment they adjust it.
          */}
          <div className="rounded-lg bg-muted/60 px-3 py-2 text-caption text-muted-foreground">
            {/*
              A day alone is the normal case: clients name one and never an
              hour. The date-and-time form is kept for rows filed before that
              rule, which do carry both.
            */}
            <p>
              {request.preferredDate === null
                ? t(`kind.${request.kind}`)
                : request.preferredStartMinute === null
                  ? t('askedDay', { when: formatLongDate(locale, request.preferredDate) })
                  : t('asked', {
                      when: `${formatLongDate(locale, request.preferredDate)} · ${formatMinute(
                        locale,
                        request.preferredDate,
                        request.preferredStartMinute,
                      )}`,
                    })}
            </p>

            {request.appointment ? (
              <p>
                {t('currently', {
                  when: `${formatLongDate(locale, request.appointment.date)} · ${formatMinute(
                    locale,
                    request.appointment.date,
                    request.appointment.startMinute,
                  )}`,
                })}
              </p>
            ) : null}

            {request.note ? (
              <p className="mt-1 text-foreground" dir="auto">
                “{request.note}”
              </p>
            ) : null}
          </div>

          {isCancellation ? (
            <p className="text-body-sm text-muted-foreground">{t('approve.cancel.explain')}</p>
          ) : (
            <>
              {/* Date — typed, or picked from the browser's own calendar. Same
                  pairing as the calendar's appointment dialog. */}
              <div className="space-y-1">
                <Label htmlFor="approve-date">{tBooking('fields.date')}</Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    id="approve-date"
                    value={dateText}
                    dir="ltr"
                    inputMode="numeric"
                    placeholder={tBooking('fields.datePlaceholder')}
                    onChange={(event) => setDateText(event.target.value)}
                    onBlur={(event) => commitDateText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return;
                      event.preventDefault();
                      commitDateText(event.currentTarget.value);
                    }}
                  />

                  {/*
                    The app's picker, not the browser's — same pairing as the
                    calendar's appointment dialog, and the same reasoning: a
                    month-and-year caption, styled by the design system rather
                    than by the OS.

                    No `min`, matching what the native input was doing here: a
                    request that sat unanswered over the weekend is still one a
                    dietitian may want to approve onto the day it was asked
                    for, and the server is where that call gets made.
                  */}
                  <div className="shrink-0">
                    <DatePicker
                      trigger="icon"
                      locale={locale}
                      value={date}
                      label={tBooking('fields.openDatePicker')}
                      onChange={commitDateText}
                    />
                  </div>
                </div>
              </div>

              {/*
                When it starts, and how long it runs. There is no end-time field
                beside them: with starts on the hour and three durations, the end
                is arithmetic anyone does at a glance, and a third box spent a
                column of the dialog restating it.
              */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="approve-start">{tBooking('fields.start')}</Label>
                  <SelectField
                    id="approve-start"
                    value={String(startMinute)}
                    onValueChange={(next) => setStartMinute(Number(next))}
                    options={startChoices(hours, startMinute).map((minute) => ({
                      value: String(minute),
                      label: formatMinute(locale, date, minute),
                    }))}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="approve-duration">{tBooking('fields.duration')}</Label>
                  <SelectField
                    id="approve-duration"
                    value={String(durationMinutes)}
                    onValueChange={(next) => setDurationMinutes(Number(next))}
                    options={durationChoices(durationMinutes).map((minutes) => ({
                      value: String(minutes),
                      label: durationLabel(minutes),
                    }))}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="approve-reason">{tBooking('fields.reason')}</Label>
                <Textarea
                  id="approve-reason"
                  value={reason}
                  dir="auto"
                  placeholder={tBooking('fields.reasonPlaceholder')}
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>
            </>
          )}

          {dateError ? (
            <p role="alert" className="text-caption text-status-medical-fg">
              {tBooking('errors.invalidDate')}
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="text-caption text-status-medical-fg">
              {error}
            </p>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            {tBooking('actions.cancel')}
          </Button>
          <Button type="button" onClick={confirm} disabled={pending}>
            {isCancellation ? t('actions.confirmCancellation') : t('actions.confirmBooking')}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
