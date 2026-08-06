import { Sprout } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Card, CardContent } from '@/components/ui/card';
import { DAYS_PER_WEEK, progressTier } from '@/features/portal/check-ins';
import { type Locale } from '@/i18n/routing';
import { formatNumber } from '@/lib/format';

const LEAVES = 30;
const RADIUS = 48;
const CENTRE = 64;

function leafTransformAt(index: number): {
  x: number;
  y: number;
  rotate: number;
} {
  const angle = (index / LEAVES) * Math.PI * 2 - Math.PI / 2;

  return {
    x: CENTRE + Math.cos(angle) * RADIUS,
    y: CENTRE + Math.sin(angle) * RADIUS,
    rotate: (angle * 180) / Math.PI + 90,
  };
}

function Leaf({
  size,
  className,
}: {
  size: number;
  className: string;
}) {
  const half = size / 2;
  const width = size * 0.34;

  return (
    <path
      d={[
        `M0,${-half}`,
        `C${width},${-half * 0.4}`,
        `${width},${half * 0.4}`,
        `0,${half}`,
        `C${-width},${half * 0.4}`,
        `${-width},${-half * 0.4}`,
        `0,${-half}`,
        'Z',
      ].join(' ')}
      className={className}
    />
  );
}

function LeafRing({ fraction }: { fraction: number }) {
  const filled = Math.round(Math.min(Math.max(fraction, 0), 1) * LEAVES);

  return (
    <svg
      viewBox="0 0 128 128"
      className="size-28 sm:size-30"
      aria-hidden="true"
    >
      {Array.from({ length: LEAVES }, (_, index) => {
        const { x, y, rotate } = leafTransformAt(index);
        const isFilled = index < filled;
        const isLeading = filled > 0 && index === filled - 1;

        return (
          <g
            key={index}
            transform={`translate(${x} ${y}) rotate(${rotate})`}
          >
            {isLeading ? (
              <circle
                r="8"
                className="fill-accent-lime opacity-25"
              />
            ) : null}

            <Leaf
              size={isFilled ? 9.5 : 7.5}
              className={
                isLeading
                  ? 'fill-accent-lime'
                  : isFilled
                    ? 'fill-primary'
                    : 'fill-progress-track'
              }
            />
          </g>
        );
      })}
    </svg>
  );
}

/**
 * The home screen's ring: **how well the week went**, not how much of it was
 * recorded.
 *
 * It used to draw `recordedCount / 7` — a client who had opened the app on
 * three days read 43%, whatever they had actually eaten, and the progress
 * tab's "this week" number beside it said something else entirely. It now
 * draws `averageFraction`, the mean of each day's own completed ÷ total, which
 * is the same number `WeekAdherenceSummary` prints on the progress tab.
 *
 * The days chip keeps the recorded count, because that is a different and
 * still-true fact — "you have logged 3 of 7 days" — and it is what the tier
 * copy above it is written about.
 */
export function WeekProgress({
  averageFraction,
  recordedCount,
  streak,
}: {
  /** The week's adherence, 0–1, or null when no day has been reported yet. */
  averageFraction: number | null;
  recordedCount: number;
  /**
   * Consecutive days with a check-in, ending today or yesterday.
   * Zero hides the streak chip.
   */
  streak: number;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations('portal.checkIns');

  const safeRecordedCount = Math.min(
    Math.max(recordedCount, 0),
    DAYS_PER_WEEK,
  );

  const tier = progressTier(safeRecordedCount);

  return (
    <Card
      className="
        relative overflow-hidden
        border-progress-card-border
        shadow-[0_10px_30px_rgba(77,116,40,0.08)]
      "
      style={{
        backgroundImage: `
          radial-gradient(
            65% 75% at 14% 42%,
            rgba(203, 234, 36, 0.20) 0%,
            rgba(203, 234, 36, 0.08) 45%,
            transparent 78%
          ),
          linear-gradient(
            118deg,
            var(--progress-card-from) 0%,
            var(--progress-card-via) 32%,
            var(--progress-card-to) 68%,
            var(--progress-card-edge) 100%
          )
        `,
      }}
    >
      {/* Very subtle decorative highlights */}
      <span
        aria-hidden="true"
        className="
          pointer-events-none
          absolute
          end-[8%]
          top-[18%]
          size-1.5
          rounded-full
          bg-white/75
          shadow-[0_0_12px_rgba(255,255,255,0.9)]
        "
      />

      <span
        aria-hidden="true"
        className="
          pointer-events-none
          absolute
          bottom-[14%]
          start-[8%]
          size-1
          rounded-full
          bg-white/70
          shadow-[0_0_10px_rgba(255,255,255,0.85)]
        "
      />

      <CardContent className="relative flex items-center gap-3 px-4 py-4 sm:gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <h2 className="font-heading text-lg leading-snug font-semibold text-secondary-foreground">
            {t(`progress.${tier}.title`)}
          </h2>

          <p className="text-sm leading-relaxed text-muted-foreground">
            {t(`progress.${tier}.body`)}
          </p>

          <div className="flex flex-wrap gap-1.5 pt-0.5">
            <span
              className="
                inline-flex items-center
                rounded-full
                border border-primary/10
                bg-white/70
                px-2.5 py-1
                text-xs font-medium
                text-secondary-foreground
                shadow-sm
                backdrop-blur-[2px]
              "
            >
              {t('progress.days', {
                count: safeRecordedCount,
                total: DAYS_PER_WEEK,
              })}
            </span>

            {streak > 0 ? (
              <span
                className="
                  inline-flex items-center gap-1
                  rounded-full
                  border border-primary/10
                  bg-status-on-track-bg/85
                  px-2.5 py-1
                  text-xs font-medium
                  text-status-on-track-fg
                  shadow-sm
                "
              >
                <Sprout
                  className="size-3.5"
                  strokeWidth={1.9}
                  aria-hidden="true"
                />

                {t('progress.streak', {
                  count: streak,
                })}
              </span>
            ) : null}
          </div>
        </div>

        <div className="relative shrink-0">
          {/* Additional halo directly behind the leaf ring */}
          <span
            aria-hidden="true"
            className="
              pointer-events-none
              absolute
              inset-4
              rounded-full
              bg-accent-lime/10
              blur-xl
            "
          />

          <LeafRing fraction={averageFraction ?? 0} />

          <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
            <span
              className={`
                font-heading
                text-3xl leading-none
                font-semibold
                tabular-nums
                ${
                  averageFraction === null
                    ? 'text-muted-foreground'
                    : 'text-secondary-foreground'
                }
              `}
            >
              {/*
                An em dash, not 0%: a week nobody has reported on yet has no
                adherence, and printing zero would read as a week the client
                failed rather than one they have not started.
              */}
              {averageFraction === null
                ? '—'
                : formatNumber(locale, averageFraction, {
                    style: 'percent',
                  })}
            </span>

            <span className="text-caption leading-none text-muted-foreground">
              {t('progress.unit')}
            </span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}