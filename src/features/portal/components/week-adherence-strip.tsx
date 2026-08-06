import { useLocale, useTranslations } from 'next-intl';

import { CalendarGlyphIcon } from '@/components/icons';
import { type AdherenceDay, type AdherenceDayState } from '@/features/portal/adherence';
import { DayFlame } from '@/features/portal/components/day-flame';
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
  month,
}: {
  days: AdherenceDay[];
  /**
   * The current month, already formatted in the active locale — "أغسطس",
   * "Aug". Optional, and only the home screen passes it: this is where the
   * month landed after it left the greeting header, because the seven cells
   * below are the one place in the app where "which month is this" is a
   * question the reader is actually asking. The progress tab omits it — the
   * screen there is already dated by its own trend cards.
   */
  month?: string;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations('portal.progress.strip');

  return (
    <section aria-labelledby="week-adherence-strip-title" className="space-y-2">
      {/*
        Heading and month on one line, one at each end — `justify-between` with
        no explicit sides, so Arabic puts the title on the right and the month
        on the left and English mirrors it. `items-baseline` sits the two on the
        same typographic line rather than centring two different type sizes
        against each other.
      */}
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="week-adherence-strip-title" className="font-heading text-sm font-medium">
          {t('title')}
        </h2>

        {month ? (
          // The icon is inline rather than a flex sibling, so the span's
          // baseline stays the text's baseline and not the glyph's bottom
          // edge; the small negative shift is the usual optical correction for
          // an icon set beside lowercase text.
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            <CalendarGlyphIcon className="me-1 inline-block size-3.5 align-[-0.15em]" />
            {month}
          </span>
        ) : null}
      </div>

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
              className={cn(
                'flex flex-col items-center gap-2 rounded-2xl py-2',
                day.state === 'today' ? 'bg-secondary' : '',
              )}
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

              <DayFlame day={day} />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
