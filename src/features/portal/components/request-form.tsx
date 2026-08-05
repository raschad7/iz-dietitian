'use client';

import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useActionState, useTransition } from 'react';
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
// `formatMinute` is still used by the current-slot line on a reschedule, which
// names the time the client already has — reading one, not choosing one.
import { requestAppointmentAction } from '@/features/portal/actions';
import { initialRequestState, type RequestPageData } from '@/features/portal/types';
import { usePathname, useRouter } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * The one form behind all three asks: book something new, move something, drop
 * something.
 *
 * **The client picks a day, and never a time.** Which hour they are seen at
 * depends on how long the consultation needs, what else is on that day and who
 * else is waiting — none of which the client can see, and all of which the
 * dietitian can. So this form asks for the one thing the client genuinely
 * knows, and the dietitian sets the hour when they approve it from
 * `/app/requests`. `appointmentRequestSchema` has no field for a time, so this
 * is a rule rather than a convention.
 *
 * **Why the days come from the server.** Whether a day has any room is a
 * question about the clinic's calendar and its opening hours, answered by the
 * same rule engine that governs a real booking (`src/features/portal/slots.ts`).
 * Recomputing it in the browser would mean a second copy of the rules free to
 * drift; shipping the month's bookings to do it would also tell each client when
 * everyone else is booked.
 *
 * So picking a day is a navigation: it sets `?date=`, and the server answers.
 * Wrapped in a transition, so the strip stays interactive and the page does not
 * blink while it loads.
 *
 * The chosen day is re-checked server side before the request is filed — the
 * last free hour on it can go between this page rendering and the button being
 * pressed.
 */

type RequestFormProps = RequestPageData & { locale: Locale };

export function RequestForm({ kind, appointment, days, selectedDate, locale }: RequestFormProps) {
  const t = useTranslations('portal');
  const [state, formAction] = useActionState(requestAppointmentAction, initialRequestState);

  const cancelling = kind === 'cancel';

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="kind" value={kind} />
      {appointment ? <input type="hidden" name="appointmentId" value={appointment.id} /> : null}
      {!cancelling ? <input type="hidden" name="preferredDate" value={selectedDate} /> : null}

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

      {!cancelling ? <DayStrip days={days} selectedDate={selectedDate} locale={locale} /> : null}

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

      {/*
        Never disabled. A day is always selected — `loadRequestPage` opens on the
        first one with room — and a cancellation needs nothing at all, so there
        is no state in which this form has too little to send.
      */}
      <SubmitButton label={t(`request.submit.${kind}`)} destructive={cancelling} />
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

function SubmitButton({ label, destructive }: { label: string; destructive: boolean }) {
  const tCommon = useTranslations('common');
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant={destructive ? 'destructive' : 'default'}
      className="w-full"
      disabled={pending}
    >
      {pending ? tCommon('loading') : label}
    </Button>
  );
}
