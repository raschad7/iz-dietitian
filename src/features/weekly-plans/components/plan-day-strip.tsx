'use client';

import { useTranslations } from 'next-intl';
import { useTransition } from 'react';

import { formatDayNumber } from '@/features/booking/format';
import { usePathname, useRouter } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

import { dayKey } from '../schema';
import { type PlanDaySummary } from '../week';

/**
 * The week, as seven things to tap.
 *
 * Picking a day is a navigation rather than local state, for the same reason the
 * booking form's date strip is (`src/features/portal/components/request-form.tsx`):
 * the day lives in `?day=`, so the server renders only that day's meals. A week
 * of dishes, ingredients and alternatives is a large payload to hand a phone in
 * order to show a seventh of it.
 *
 * Days with nothing planned stay selectable and are only dimmed. A client whose
 * Friday is empty should be able to look at Friday and be told so, not find the
 * day silently unavailable and wonder whether the plan is broken.
 */
export function PlanDayStrip({
  days,
  selectedDay,
  locale,
}: {
  days: readonly PlanDaySummary[];
  selectedDay: number;
  locale: Locale;
}) {
  const t = useTranslations('portal.plan');
  const tDays = useTranslations('mealPlans.days');

  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  function selectDay(dayOfWeek: number) {
    if (dayOfWeek === selectedDay) return;

    startTransition(() => {
      // `replace`, not `push`: stepping through the week should not mean seven
      // taps of the back button to leave the plan.
      router.replace(`${pathname}?day=${dayOfWeek}`);
    });
  }

  return (
    <div className="space-y-3">
      <p className="font-heading text-base font-medium">{t('chooseDay')}</p>

      <div
        role="group"
        aria-label={t('chooseDay')}
        // Choosing a day is a server round-trip, so the wait has to be visible:
        // without this the whole row goes inert on tap with nothing to show for
        // it, which reads as a dead control rather than a loading one.
        aria-busy={isPending}
        className={cn(
          /*
            Mobile first, and all seven days on screen: four across, then three.
            This used to be one scrolling row, which hid the back half of the week
            behind a swipe nobody was told about.

            Not seven across on a phone, because they do not fit. Arabic weekday
            names are full words — الأربعاء is eight characters — and seven columns
            inside 343px leaves about 45px each. The only way to force one row is
            Intl's `narrow` form, which in Arabic is a single letter (ن ث ر خ) that
            nobody reads as a weekday. Two readable rows beat one cryptic one.
          */
          'grid grid-cols-4 gap-2 transition-opacity duration-200 sm:grid-cols-7',
          isPending && 'opacity-60',
        )}
      >
        {days.map((day) => {
          const active = day.dayOfWeek === selectedDay;
          const planned = day.mealCount > 0;
          const name = tDays(dayKey(day.dayOfWeek));

          return (
            <button
              key={day.dayOfWeek}
              type="button"
              disabled={isPending}
              aria-pressed={active}
              aria-label={day.isToday ? `${name} — ${t('today')}` : name}
              onClick={() => selectDay(day.dayOfWeek)}
              className={cn(
                // Each cell fills its grid column — about 80px on a phone, and
                // ~76px tall, so every day clears the 44px touch minimum with room
                // to spare and the date is read rather than squinted at.
                'flex w-full cursor-pointer flex-col items-center gap-1.5 rounded-lg px-2 py-3 outline-none transition-all duration-200 ease-[cubic-bezier(.2,.6,.2,1)]',
                // The same focus and press treatment `buttonVariants` gives every
                // other control: a raw <button> otherwise falls back to the UA
                // outline, which is not this system's ring, and to no press cue
                // at all — and a phone has no hover to stand in for one.
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-focus-halo active:translate-y-px',
                'disabled:cursor-default',
                /*
                  Separated by fill, not by outline. Seven outlined boxes in a row
                  is six competing borders before any content is read; three tones
                  of the same surface scale say the same thing quietly.
                */
                active
                  ? 'bg-primary text-primary-foreground'
                  : day.isToday
                    ? 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                    : planned
                      ? 'bg-muted text-foreground hover:bg-accent'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted',
              )}
            >
              {/*
                Today is marked by weight as well as by its own fill. A signal
                carried by colour alone is one a colourblind reader does not get.
              */}
              <span className={cn('text-sm leading-none', day.isToday && 'font-semibold')}>
                {name}
              </span>

              <span className="font-heading text-lg leading-none font-semibold tabular-nums">
                {day.date ? formatDayNumber(locale, day.date) : '—'}
              </span>

              {/*
                Rendered either way so every day is the same height; invisible
                rather than absent when the day holds nothing.
              */}
              <span
                aria-hidden
                className={cn(
                  'size-1.5 rounded-full',
                  !planned && 'invisible',
                  active ? 'bg-primary-foreground' : 'bg-primary',
                )}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
