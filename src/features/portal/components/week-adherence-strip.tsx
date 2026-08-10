import { useLocale, useTranslations } from 'next-intl';

import { type AdherenceDay, type AdherenceDayState } from '@/features/portal/adherence';
import { DayFlame } from '@/features/portal/components/day-flame';
import { TodayFlameCell } from '@/features/portal/components/today-flame-celebration';
import { type Locale } from '@/i18n/routing';
import { formatDate, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The seven-day adherence strip, reading `client_plan_adherence` — the single
 * source of truth for "how has this week gone" on both the home screen and
 * the progress tab. One component and one query behind it, so the two
 * screens can never draw two different weeks.
 *
 * The mark itself is `DayFlame`, which moved to its own file when the meal
 * plan's day picker began drawing the same week — see that file for why it is
 * a flame rather than a number. The exact figure is still spoken in each day's
 * label here, and the progress tab still draws it as a number.
 */

/**
 * Which `state.*` message a day is spoken with.
 *
 * One extra case beyond `AdherenceDayState`: today, which is its own state and
 * therefore says nothing about how it has gone, gets a second message the
 * moment it has meals ticked. Every other day's state already implies whether
 * there are figures to read.
 */
function labelKeyOf(day: AdherenceDay): AdherenceDayState | 'todayReported' {
  if (day.state === 'today' && day.fraction !== null) return 'todayReported';
  return day.state;
}

export function WeekAdherenceStrip({
  days,
  showTitle = true,
}: {
  days: AdherenceDay[];
  /**
   * False on the home screen, which drops this heading — the greeting header
   * above it now names the month instead, and repeating "days of the week"
   * right under it said nothing the seven cells don't already show. The
   * progress tab keeps it: that screen has no header of its own for the
   * heading to lean on.
   */
  showTitle?: boolean;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations('portal.progress.strip');

  return (
    <section
      aria-labelledby={showTitle ? 'week-adherence-strip-title' : undefined}
      aria-label={showTitle ? undefined : t('title')}
      className="space-y-2"
    >
      {showTitle ? (
        <h2 id="week-adherence-strip-title" className="font-heading text-sm font-medium">
          {t('title')}
        </h2>
      ) : null}

      <ol className="grid grid-cols-7 gap-1">
        {days.map((day) => (
          <li key={day.date}>
            <div
              /*
                The flame is a shape; this label is the only place the day's
                adherence is stated exactly, so it carries the percentage and
                the meals behind it — "25% (1 of 4 meals)" — rather than the
                score out of ten it used to spell out. Today announces its own
                figures too when it has any: a client who has ticked two of
                four meals this morning should not have to open the progress
                tab to hear where that leaves them.
              */
              aria-label={t(`state.${labelKeyOf(day)}`, {
                day: formatDate(locale, day.date, { dateStyle: undefined, weekday: 'long' }),
                percent: formatNumber(locale, day.fraction ?? 0, { style: 'percent' }),
                completed: day.completedMeals,
                total: day.totalMeals,
              })}
              /*
                **Today is marked by its type, not by a fill.** It wore an
                olive-50 pill, which on the home screen's green glow read as a
                white capsule cut out of the wash — the palest thing on the
                screen sitting on the one surface it had no contrast against,
                and a shape loud enough to look like the only tappable cell in
                a row where nothing is tappable. The label below already
                carries the state in `--secondary-foreground` semibold against
                the other six days' `--muted-foreground` regular, and today's
                flame is the one drawn live, so the cell is still findable at a
                glance on the green here and on the progress tab's white card.
              */
              className="flex flex-col items-center gap-2 rounded-2xl py-2"
            >
              <span
                className={cn(
                  'text-caption leading-none',
                  day.state === 'today' ? 'font-semibold text-secondary-foreground' : 'text-muted-foreground',
                )}
              >
                {day.state === 'today'
                  ? t('today')
                  : formatDate(locale, day.date, { dateStyle: undefined, weekday: 'short' })}
              </span>

              {/*
                Today alone gets the live, reactive cell — it is the only day
                a client can still change on this visit. `TodayFlameCell`
                falls back to this same `day` and this same `DayFlame` when
                there is no `PlanDayCompletionProvider` above it (the
                progress tab's strip), so it is safe to always use here.
              */}
              {day.state === 'today' ? <TodayFlameCell day={day} /> : <DayFlame day={day} />}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
