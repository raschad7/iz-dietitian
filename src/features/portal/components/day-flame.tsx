import { Flame } from 'lucide-react';

import { type AdherenceDay } from '@/features/portal/adherence';
import { cn } from '@/lib/utils';

/**
 * One day's adherence, drawn as a flame in a ring.
 *
 * **A flame, not a number.** Seven scores out of ten across a phone-width row
 * asked the client to read and compare digits at 11px to answer a question
 * that is really "which days did I keep". The flame answers it at a glance:
 * lit and ringed for a day kept, lit with an open ring for a partial one,
 * grey and unlit for a day with nothing in it.
 *
 * Lives here rather than inside `week-adherence-strip.tsx` because three
 * screens now draw this week — the home screen, the progress tab and the
 * meal plan's day picker — and a mark whose whole job is to mean the same
 * thing on all of them cannot be a copy on each.
 *
 * `missed` is not folded into `empty`: a client who tapped "لم ألتزم" told the
 * app something, and a day nobody answered told it nothing. Both stay calm and
 * neutral (§06: a missed day is information, not a failure), so the
 * distinction is carried by how far each fades, never by red.
 *
 * It draws no label and announces nothing — the cell around it owns the
 * accessible name, because only that cell knows whether it is a heading, a
 * button, or a list item.
 */

const RADIUS = 14;
const RING_LENGTH = 2 * Math.PI * RADIUS;

/**
 * What the flame draws, with state and adherence folded into one value.
 *
 * `today` is deliberately not a case here: the current day keeps its olive
 * card, but the flame inside it reports the same way every other day's does,
 * so a day logged this morning does not change meaning at midnight.
 *
 * `partial` is now a **range** rather than a single look — the arc below is
 * drawn to the day's exact fraction, so 1 of 4 meals shows a quarter ring and
 * 3 of 4 shows three quarters. It used to be one half-ring for every partial
 * day, because a level was all the flame had to read.
 */
type Burn = 'full' | 'partial' | 'none' | 'empty' | 'future';

function burnOf({ state, fraction }: AdherenceDay): Burn {
  if (state === 'future') return 'future';
  if (fraction === null) return 'empty';
  if (fraction >= 1) return 'full';
  return fraction > 0 ? 'partial' : 'none';
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

/**
 * Reused by the ring and the glyph so a day that changes burn mid-visit —
 * today, ticked live off `usePlanDayCompletion()` in `TodayFlameCell` — fades
 * between them instead of snapping. `220ms`/`cubic-bezier(.2,.6,.2,1)` are
 * `--duration-arc`/`--ease-sweep` spelled out literally, the same way
 * `plan-day-strip.tsx` already does it inline rather than through a custom
 * CSS class. Idle on every other cell: a server-rendered day never changes
 * props after mount, so the property sits unused.
 */
const BURN_TRANSITION = 'transition-[stroke,stroke-width,fill,color] duration-[220ms] ease-[cubic-bezier(.2,.6,.2,1)]';

export function DayFlame({
  day,
  className,
  size = 32,
}: {
  day: AdherenceDay;
  className?: string;
  /**
   * The box's side, in px — the strip's cells never pass this, so 32 (the
   * original fixed `size-8`) stays their result untouched. `TodayFlameCell`
   * is the one caller that does: its celebration dialog draws the same flame
   * at hero scale, and the SVG's `viewBox` means a bigger box is a bigger
   * flame at identical proportions, not a redrawn one.
   */
  size?: number;
}) {
  const burn = burnOf(day);
  const partial = burn === 'partial';
  const flameSize = size / 2;

  return (
    <span className={cn('relative grid place-items-center', className)} style={{ width: size, height: size }}>
      <svg viewBox="0 0 32 32" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
        <circle
          cx="16"
          cy="16"
          r={RADIUS}
          strokeWidth={burn === 'full' || partial ? 2.25 : 1.5}
          className={cn('fill-none', BURN_TRANSITION, RING[burn])}
        />

        {partial ? (
          <circle
            cx="16"
            cy="16"
            r={RADIUS}
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeDasharray={`${(day.fraction ?? 0) * RING_LENGTH} ${RING_LENGTH}`}
            className="fill-none stroke-status-complete-mark"
          />
        ) : null}
      </svg>

      <Flame
        className={cn('relative', BURN_TRANSITION, FLAME[burn])}
        style={{ width: flameSize, height: flameSize }}
        strokeWidth={1.75}
        aria-hidden="true"
      />
    </span>
  );
}
