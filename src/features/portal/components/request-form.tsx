'use client';

import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useActionState, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  formatDayNumber,
  formatLongDate,
  formatMediumDate,
  formatMinute,
  formatWeekday,
} from '@/features/booking/format';
import { requestAppointmentAction } from '@/features/portal/actions';
import { initialRequestState, type RequestPageData } from '@/features/portal/types';
import { usePathname, useRouter } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * The one form behind all three asks: book something new, move something, drop
 * something.
 *
 * **Asking for an appointment is a note, and only a note.** No day, no hour —
 * the client writes a sentence and their dietitian decides when to see them.
 * The picker that used to be here produced a *preference* rather than a
 * booking: the dietitian confirmed every request from `/app/requests` and was
 * always free to move it, so the client did the work of choosing a slot and
 * still had to wait to find out. A note asks the same question with none of
 * that theatre, and it can say the thing a grid of times cannot — that this is
 * urgent, or that mornings are impossible.
 *
 * **A `reschedule` still picks a day and an hour**, because naming a different
 * hour is the whole content of one, and `cancel` picks neither. Nothing in the
 * portal links to either any more; the form still renders them because the
 * route still honours `?kind=`, and a half-built branch is worse than one that
 * works.
 *
 * **Why the times come from the server** when they are shown at all. Whether a
 * day has room, and which hours are still free, are questions about the
 * clinic's calendar, answered by the same rule engine that governs a real
 * booking (`src/features/portal/slots.ts`). Recomputing that in the browser
 * would mean a second copy of the rules free to drift; shipping the month's
 * bookings to do it would tell each client when everyone else is booked.
 *
 * So picking a day is a navigation: it sets `?date=`, and the server answers
 * with that day's times. Picking a *time* is local state — the list it chooses
 * from already came from the server. Both are re-checked before the request is
 * filed, because the hour can go while the form is open.
 */

type RequestFormProps = RequestPageData & { locale: Locale };

export function RequestForm({
  kind,
  appointment,
  days,
  selectedDate,
  slots,
  selectedStartMinute,
  locale,
}: RequestFormProps) {
  const t = useTranslations('portal');
  const [state, formAction] = useActionState(requestAppointmentAction, initialRequestState);

  // Only a reschedule names a time. A `new` request is a note, and a `cancel`
  // is about a slot that already exists.
  const picksTime = kind === 'reschedule';

  // A `new` request carries nothing else, so the note is the request.
  const noteRequired = kind === 'new';

  // A day with nothing free is the one state this form cannot be sent from:
  // there is no hour to name, and the server would refuse whatever was
  // invented. The submit button says so rather than failing on press.
  const noTimes = picksTime && slots.length === 0;

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="kind" value={kind} />
      {appointment ? <input type="hidden" name="appointmentId" value={appointment.id} /> : null}
      {picksTime ? <input type="hidden" name="preferredDate" value={selectedDate} /> : null}

      {appointment ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle>{t(`request.heading.${kind}`)}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {t('request.currentSlot', {
              date: formatMediumDate(locale, appointment.date),
              time: formatMinute(locale, appointment.date, appointment.startMinute),
            })}
          </CardContent>
        </Card>
      ) : null}

      {picksTime ? (
        <>
          <DayStrip days={days} selectedDate={selectedDate} locale={locale} />

          {/*
            Keyed by the day, not synced to it. Choosing another date is a
            navigation that hands this new `slots` and a new default; remounting
            re-reads both, where an effect mirroring props into state would be
            the exact bug `plan-day-completion.tsx` avoids the same way.
          */}
          <TimeGrid
            key={selectedDate}
            date={selectedDate}
            slots={slots}
            selectedStartMinute={selectedStartMinute}
            locale={locale}
          />
        </>
      ) : null}

      {/*
        On a `new` request this is the whole form, so it is required and says so
        — `(optional)` beside the only field on the screen would be an invitation
        to send an empty message. It stays optional on the other two, where the
        request is complete without it: a cancellation names the appointment, and
        a reschedule names the new hour.

        `required` is the browser's check and the schema's `min(1)` is the real
        one; the attribute exists so the answer comes back before a round trip,
        not because anything trusts it.
      */}
      <div className="space-y-2">
        <Label htmlFor="request-note">
          {noteRequired ? (
            t('request.noteRequired')
          ) : (
            <>
              {t('request.note')}{' '}
              <span className="text-muted-foreground">{t('request.optional')}</span>
            </>
          )}
        </Label>
        <Textarea
          id="request-note"
          name="note"
          rows={noteRequired ? 5 : 3}
          maxLength={500}
          required={noteRequired}
          placeholder={t('request.notePlaceholder')}
        />
      </div>

      {state.status === 'error' ? (
        <p role="alert" className="text-sm text-destructive">
          {t(state.messageKey)}
        </p>
      ) : null}

      {/*
        Disabled in exactly one state: a chosen day with no hour left on it. A
        day is always selected (`loadRequestPage` opens on the first with room)
        and so is an hour whenever the day has one, so every other path here has
        enough to send. The explanation sits beside the button rather than on
        it — `disabled:pointer-events-none` means a `title` on a disabled
        control can never be read.
      */}
      <SubmitButton
        label={t(`request.submit.${kind}`)}
        destructive={kind === 'cancel'}
        disabled={noTimes}
      />
    </form>
  );
}

/**
 * The chosen day's open hours.
 *
 * A grid rather than the day strip's sideways scroll: times come in a known,
 * bounded set — a clinic day is a dozen or so half-hours — and a grid shows all
 * of them at once, where a scrolling row would hide the afternoon behind a
 * gesture nobody knows is there.
 *
 * The hidden input is what the form actually submits, so the selection is real
 * form data rather than something React has to remember to serialise. There is
 * no `onChange` and no controlled value on it: the buttons set state, the state
 * renders the input, and the form reads the input.
 */
function TimeGrid({
  date,
  slots,
  selectedStartMinute,
  locale,
}: {
  date: string;
  slots: number[];
  selectedStartMinute: number | null;
  locale: Locale;
}) {
  const t = useTranslations('portal');
  const [selected, setSelected] = useState(selectedStartMinute);

  if (slots.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">{t('request.chooseTime')}</p>
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          {t('request.noTimes')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{t('request.chooseTime')}</p>

      {selected !== null ? (
        <input type="hidden" name="preferredStartMinute" value={selected} />
      ) : null}

      <div role="group" aria-label={t('request.chooseTime')} className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {slots.map((minute) => {
          const active = minute === selected;

          return (
            <button
              key={minute}
              type="button"
              aria-pressed={active}
              onClick={() => setSelected(minute)}
              className={cn(
                // 44px tall: the same touch floor the day cells clear, and the
                // one number in the cell stays centred at any label width.
                'flex min-h-11 items-center justify-center rounded-lg border px-2 text-sm tabular-nums transition-colors',
                active
                  ? 'border-primary bg-primary font-medium text-primary-foreground'
                  : 'border-border hover:bg-muted',
              )}
            >
              {/*
                The clock face keeps its own direction inside Arabic — a time is
                a number, and `formatMinute` returns one whichever way the page
                reads.
              */}
              <span dir="ltr">{formatMinute(locale, date, minute)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The horizontally scrolling date strip. Days with nothing free are shown, and disabled. */
function DayStrip({
  days,
  selectedDate,
  locale,
}: {
  days: RequestPageData['days'];
  selectedDate: string;
  locale: Locale;
}) {
  const t = useTranslations('portal');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function selectDay(date: string) {
    if (date === selectedDate) return;

    // Rebuilt from the current query rather than written fresh, so a reschedule
    // does not lose the `kind` and `appointmentId` that make it one.
    const next = new URLSearchParams(searchParams);
    next.set('date', date);

    startTransition(() => {
      // `replace`, not `push`: stepping through six days should not mean six
      // taps of the back button to leave the form.
      router.replace(`${pathname}?${next.toString()}`);
    });
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{t('request.chooseDay')}</p>

      <div
        role="group"
        aria-label={t('request.chooseDay')}
        // `-mx-*` + `px-*` so the row bleeds to the screen edge on a phone while
        // the first and last card keep their breathing room.
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0"
      >
        {days.map((day) => {
          const active = day.date === selectedDate;
          const closed = day.openCount === 0;

          return (
            <button
              key={day.date}
              type="button"
              disabled={closed || isPending}
              aria-pressed={active}
              aria-label={formatLongDate(locale, day.date)}
              onClick={() => selectDay(day.date)}
              className={cn(
                'flex min-w-14 shrink-0 flex-col items-center gap-0.5 rounded-lg border px-3 py-2 transition-colors',
                active ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                closed ? 'opacity-40' : !active && 'hover:bg-muted',
              )}
            >
              <span className="text-xs">{formatWeekday(locale, day.date)}</span>
              <span className="text-base font-medium">{formatDayNumber(locale, day.date)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SubmitButton({
  label,
  destructive,
  disabled,
}: {
  label: string;
  destructive: boolean;
  disabled: boolean;
}) {
  const tCommon = useTranslations('common');
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant={destructive ? 'destructive' : 'default'}
      /*
        `max-w-none` alongside `w-full`. `buttonVariants` caps every button at
        320px so that a stray long label cannot stretch one across a desktop
        toolbar, but this button is the form's own footer and should measure
        exactly what the field above it measures — capped, it sat visibly
        narrower than the textarea and looked misaligned rather than deliberate.
      */
      className="w-full max-w-none"
      disabled={pending || disabled}
    >
      {pending ? tCommon('loading') : label}
    </Button>
  );
}
