import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { type TodayAdherence } from '@/features/portal/adherence';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * "التزامك اليوم" — today's own report, read rather than written here.
 *
 * The ring is the same arc the week strip's flames draw, scaled up: one visual
 * grammar for "how did the day go", reused here at a larger size. `full` gets
 * the same flame the strip spends on a completed day — this is a different
 * screen, so that budget has not already been spent here.
 *
 * **It reads a percentage, not a score.** The number in the middle was a score
 * out of ten that only ever showed 0, 5 or 10, because a three-level `level`
 * was all it had: two meals of four and three of four both printed "5 من ١٠".
 * It now prints the exact fraction of today's meals ticked — 25%, 33%, 75% —
 * and the ring is drawn to the same number the client can count themselves.
 * The meals pair it came from used to print underneath, inside the ring; it's
 * gone now — the ring is small and a bilingual "X of Y meals" line no longer
 * fit inside it without wrapping past the edge.
 *
 * There used to be a three-way segmented control here — "missed" / "partial"
 * / "full" — for the client to pick themselves. It is gone: adherence is
 * derived from how many of today's meals are ticked on the meal-plan screen
 * (see `client-plan-adherence.ts` and `toggleMealCompletion`), so a client
 * reporting on their own day and the plan they actually followed could
 * silently disagree. The card now only reads that derived figure and points
 * at the one place it can still be changed — ticking meals.
 */

const RADIUS = 44;
const RING_LENGTH = 2 * Math.PI * RADIUS;

function TodayRing({ today, locale }: { today: TodayAdherence | null; locale: Locale }) {
  const fraction = today?.fraction ?? null;
  const drawn = fraction !== null && fraction > 0;
  const full = fraction !== null && fraction >= 1;

  return (
    <span className="relative grid size-28 shrink-0 place-items-center rounded-full bg-secondary">
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
        {!full ? (
          <circle cx="50" cy="50" r={RADIUS} strokeWidth="7" className="fill-none stroke-border" />
        ) : null}

        {drawn ? (
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={full ? undefined : `${(fraction ?? 0) * RING_LENGTH} ${RING_LENGTH}`}
            className={cn('fill-none', full ? 'stroke-status-complete-mark' : 'stroke-status-complete-mark-soft')}
          />
        ) : null}
      </svg>

      <span className="relative flex flex-col items-center gap-0.5">
        <span
          className={cn(
            'font-heading text-2xl leading-none font-medium tabular-nums',
            today === null ? 'text-muted-foreground' : 'text-secondary-foreground',
          )}
        >
          {today === null ? '—' : formatNumber(locale, today.fraction, { style: 'percent' })}
        </span>
      </span>
    </span>
  );
}

export function TodayAdherenceCard({ today, locale }: { today: TodayAdherence | null; locale: Locale }) {
  const t = useTranslations('portal.progress.today');

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <TodayRing today={today} locale={locale} />

          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="font-heading text-lg leading-snug font-medium">{t('heading')}</h2>
            {/*
              The one thing on this card that still reads the level rather
              than the number: encouragement is a sentence, and there is no
              way to write one per percentage. It never contradicts the ring —
              both come off the same row.
            */}
            <p className="text-sm leading-relaxed text-muted-foreground">
              {today ? t(`level.${today.level}`) : t('prompt')}
            </p>
          </div>
        </div>

        {/*
          `/portal`, not `/${locale}/portal`: `Link` here is the locale-aware
          one from `@/i18n/navigation`, which prefixes the active locale
          itself — see the same pattern in `pending-requests-card.tsx`. The
          plan now lives on the home screen itself, below today's progress,
          rather than its own tab.
        */}
        <Link href="/portal" className={buttonVariants({ variant: 'outline', className: 'w-full max-w-none' })}>
          {t('cta')}
          <Icon name="chevronEnd" />
        </Link>
      </CardContent>
    </Card>
  );
}
