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
 * **Why the days and slots come from the server.** Which times are free is a
 * question about the clinic's calendar and its opening hours, and the answer is
 * computed by the same rule engine that governs a real booking
 * (`src/features/portal/slots.ts`). Recomputing it in the browser would mean a
 * second copy of the rules that could drift; shipping the whole month's
 * bookings to do it would also tell the client when everyone else is booked.
 *
 * So picking a day is a navigation: it sets `?date=` and the server returns that
 * day's slots. Wrapped in a transition, so the strip stays interactive and the
 * page does not blink while it loads.
 *
 * The chosen time is still re-checked server side before the request is filed —
 * a slot can be taken between this page rendering and the button being pressed.
 */

type RequestFormProps = RequestPageData & { locale: Locale };

export function RequestForm({ kind, appointment, days, selectedDate, slots, locale }: RequestFormProps) {
  const t = useTranslations('portal');
  const [state, formAction] = useActionState(requestAppointmentAction, initialRequestState);

  /**
   * The chosen time, remembered together with the day it was chosen on.
   *
   * Storing the day alongside it is what makes the selection expire by itself
   * when the strip moves to another date: a time picked on Tuesday means nothing
   * on Wednesday, and a bare `number` would stay selected across the change and
   * let the client file a request they never made. Derived rather than reset in
   * an effect, so there is no render where the two disagree.
   */
  const [selection, setSelection] = useState<{ date: string; minute: number } | null>(null);
  const startMinute = selection?.date === selectedDate ? selection.minute : null;

  const cancelling = kind === 'cancel';

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="kind" value={kind} />
      {appointment ? <input type="hidden" name="appointmentId" value={appointment.id} /> : null}
      {!cancelling ? <input type="hidden" name="preferredDate" value={selectedDate} /> : null}
      {!cancelling && startMinute !== null ? (
        <input type="hidden" name="preferredStartMinute" value={startMinute} />
      ) : null}

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

      {!cancelling ? (
        <>
          <DayStrip days={days} selectedDate={selectedDate} locale={locale} />
          <SlotGrid
            date={selectedDate}
            slots={slots}
            selected={startMinute}
            onSelect={(minute) => setSelection({ date: selectedDate, minute })}
            locale={locale}
          />
        </>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="request-note">
          {t('request.note')} <span className="text-muted-foreground">{t('request.optional')}</span>
        </Label>
        <Textarea id="request-note" name="note" rows={3} maxLength={500} placeholder={t('request.notePlaceholder')} />
      </div>

      {state.status === 'error' ? (
        <p role="alert" className="text-sm text-destructive">
          {t(state.messageKey)}
        </p>
      ) : null}

      <SubmitButton
        label={t(`request.submit.${kind}`)}
        // A time is the whole content of a booking request; a cancellation needs none.
        disabled={!cancelling && startMinute === null}
        destructive={cancelling}
      />
    </form>
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

/** The times still open on the chosen day. */
function SlotGrid({
  date,
  slots,
  selected,
  onSelect,
  locale,
}: {
  date: string;
  slots: readonly number[];
  selected: number | null;
  onSelect: (minute: number) => void;
  locale: Locale;
}) {
  const t = useTranslations('portal');

  if (slots.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('request.noSlots')}</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{t('request.chooseTime')}</p>

      <div role="group" aria-label={t('request.chooseTime')} className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {slots.map((minute) => {
          const active = minute === selected;

          return (
            <button
              key={minute}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(minute)}
              dir="ltr"
              className={cn(
                'rounded-lg border px-2 py-2 text-sm transition-colors',
                active ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted',
              )}
            >
              {formatMinute(locale, date, minute)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SubmitButton({
  label,
  disabled,
  destructive,
}: {
  label: string;
  disabled: boolean;
  destructive: boolean;
}) {
  const tCommon = useTranslations('common');
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant={destructive ? 'destructive' : 'default'}
      className="w-full"
      disabled={disabled || pending}
    >
      {pending ? tCommon('loading') : label}
    </Button>
  );
}
