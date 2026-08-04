import { Flame } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { CalendarGlyphIcon } from '@/components/icons';
import { ADHERENCE_SCORE_MAX, type AdherenceDay } from '@/features/portal/adherence';
import { type Locale } from '@/i18n/routing';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The seven-day adherence strip, reading `client_plan_adherence` — the single
 * source of truth for "how has this week gone" on both the home screen and
 * the progress tab. One component and one query behind it, so the two
 * screens can never draw two different weeks.
 *
 * **A flame, not a number.** Seven scores out of ten across a phone-width row
 * asked the client to read and compare digits at 11px to answer a question
 * that is really "which days did I keep". The flame answers it at a glance:
 * lit and ringed for a day kept, lit with an open ring for a partial one,
 * grey and unlit for a day with nothing in it. The exact score is still
 * spoken in each day's label, and the progress tab still draws it as a number.
 *
 * `missed` is not folded into `empty`: a client who tapped "لم ألتزم" told the
 * app something, and a day nobody answered told it nothing. Both stay calm and
 * neutral (§06: a missed day is information, not a failure), so the
 * distinction is carried by how far each fades, never by red.
 */

const RADIUS = 14;
const RING_LENGTH = 2 * Math.PI * RADIUS;

/**
 * What the flame draws, with state and score folded into one value.
 *
 * `today` is deliberately not a case here: the current day keeps its olive
 * card, but the flame inside it reports the same way every other day's does,
 * so a day logged this morning does not change meaning at midnight.
 */
type Burn = 'full' | 'partial' | 'none' | 'empty' | 'future';

function burnOf({ state, score }: AdherenceDay): Burn {
  if (state === 'future') return 'future';
  if (score === null) return 'empty';
  if (score >= ADHERENCE_SCORE_MAX) return 'full';
  return score > 0 ? 'partial' : 'none';
}

/** For `partial` this is the track the orange arc is drawn over, not the arc. */
const RING: Record<Burn, string> = {
  full: 'stroke-status-complete-mark',
  partial: 'stroke-border',
  none: 'stroke-border',
  empty: 'stroke-border/55',
  future: 'stroke-border/35',
};

/** Filled only when the day is complete — the one state that reads as "lit". */
const FLAME: Record<Burn, string> = {
  full: 'fill-current text-status-complete-mark',
  partial: 'text-status-complete-mark',
  none: 'text-muted-foreground',
  empty: 'text-muted-foreground/55',
  future: 'text-muted-foreground/35',
};

function DayFlame({ day }: { day: AdherenceDay }) {
  const burn = burnOf(day);
  const partial = burn === 'partial';

  return (
    <span className="relative grid size-8 place-items-center">
      <svg viewBox="0 0 32 32" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
        <circle
          cx="16"
          cy="16"
          r={RADIUS}
          strokeWidth={burn === 'full' || partial ? 2.25 : 1.5}
          className={cn('fill-none', RING[burn])}
        />

        {partial ? (
          <circle
            cx="16"
            cy="16"
            r={RADIUS}
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeDasharray={`${((day.score ?? 0) / ADHERENCE_SCORE_MAX) * RING_LENGTH} ${RING_LENGTH}`}
            className="fill-none stroke-status-complete-mark"
          />
        ) : null}
      </svg>

      <Flame className={cn('relative size-4', FLAME[burn])} strokeWidth={1.75} aria-hidden="true" />
    </span>
  );
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
              aria-label={t(`state.${day.state}`, {
                day: formatDate(locale, day.date, { dateStyle: undefined, weekday: 'long' }),
                score: day.score ?? 0,
                max: ADHERENCE_SCORE_MAX,
              })}
              className={cn(
                'flex flex-col items-center gap-2 rounded-2xl py-2',
                day.state === 'today' ? 'bg-secondary' : '',
              )}
            >
              <span
                className={cn(
                  'text-[10px] leading-none',
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
