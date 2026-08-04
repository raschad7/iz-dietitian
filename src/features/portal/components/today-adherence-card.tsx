import { useTranslations } from 'next-intl';

import { SegmentedGroup, SegmentedOption } from '@/components/ui/segmented';
import { Card, CardContent } from '@/components/ui/card';
import { ADHERENCE_LEVELS, ADHERENCE_SCORE_MAX, LEVEL_SCORE, type AdherenceLevel } from '@/features/portal/adherence';
import { logPlanAdherenceAction } from '@/features/portal/actions';
import { type Locale } from '@/i18n/routing';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * "التزامك اليوم" — today's own report, and the one place on the portal a
 * client writes anything about their nutrition plan.
 *
 * The ring is the same "score out of 10" arc the week strip draws
 * (`WeekAdherenceStrip`'s `Dial`), scaled up: one visual grammar for "how did
 * the day go", reused here at a larger size. `full` gets the same flame the
 * strip spends on a completed day — this is a different screen, so that
 * budget has not already been spent here.
 *
 * The segmented control is always visible and always live, even after
 * logging: re-tapping a segment corrects today's report rather than opening
 * a second form, the same "segment carries the value it selects" contract
 * `segmented.tsx` documents. There is no separate "log" button — see the
 * decision to keep this a single, always-visible three-way choice rather
 * than a button that reveals one.
 */

const RADIUS = 44;
const RING_LENGTH = 2 * Math.PI * RADIUS;

function TodayRing({ level, locale }: { level: AdherenceLevel | null; locale: Locale }) {
  const t = useTranslations('portal.progress.today');
  const score = level ? LEVEL_SCORE[level] : null;
  const drawn = score !== null && score > 0;
  const full = score === ADHERENCE_SCORE_MAX;

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
            strokeDasharray={full ? undefined : `${((score ?? 0) / ADHERENCE_SCORE_MAX) * RING_LENGTH} ${RING_LENGTH}`}
            className={cn('fill-none', full ? 'stroke-status-complete-mark' : 'stroke-status-complete-mark-soft')}
          />
        ) : null}
      </svg>

      <span className="relative flex flex-col items-center">
        <span
          className={cn(
            'font-heading text-2xl leading-none font-medium tabular-nums',
            score === null ? 'text-muted-foreground' : 'text-secondary-foreground',
          )}
        >
          {score === null ? '—' : formatNumber(locale, score)}
        </span>
        {score !== null ? (
          <span className="text-[10px] leading-none text-muted-foreground">
            {t('unit', { max: formatNumber(locale, ADHERENCE_SCORE_MAX) })}
          </span>
        ) : null}
      </span>
    </span>
  );
}

export function TodayAdherenceCard({ level, locale }: { level: AdherenceLevel | null; locale: Locale }) {
  const t = useTranslations('portal.progress.today');

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <TodayRing level={level} locale={locale} />

          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="font-heading text-lg leading-snug font-medium">{t('heading')}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {level ? t(`level.${level}`) : t('prompt')}
            </p>
          </div>
        </div>

        <form action={logPlanAdherenceAction}>
          <input type="hidden" name="locale" value={locale} />

          <SegmentedGroup label={t('groupLabel')} className="grid w-full grid-cols-3">
            {ADHERENCE_LEVELS.map((option) => (
              <SegmentedOption key={option} type="submit" name="level" value={option} selected={level === option}>
                {t(`options.${option}`)}
              </SegmentedOption>
            ))}
          </SegmentedGroup>
        </form>
      </CardContent>
    </Card>
  );
}
