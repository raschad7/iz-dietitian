'use client';

import { useTranslations } from 'next-intl';
import { useSyncExternalStore, type CSSProperties } from 'react';

import { MascotFace } from '@/features/portal/mascot/mascot-face';
import { todayMealSignal } from '@/features/portal/mascot/meal-signal';
import { getMascotProgression } from '@/features/portal/mascot/states';
import { useReactiveMascot } from '@/features/portal/mascot/use-reactive-mascot';
import { usePlanDayCompletion } from '@/features/weekly-plans/components/plan-day-completion';
import { cn } from '@/lib/utils';

/**
 * The reactive layer over the brand mark: one `MascotFace`, driven by
 * whichever screen's own state is handed in. See the module doc in
 * `use-reactive-mascot.ts` for how those signals turn into one emotion, and
 * `emotion.ts` for the priority they are resolved in.
 *
 * **It owns no copy of its own beyond an accessible label.** Every emotion
 * here has an equivalent already stated in visible text somewhere on the
 * page it appears on — the plan's own "today" section says a meal is due,
 * the streak card draws the number itself. §21 of the brief: the mascot
 * enhances, it never becomes the only carrier of the fact. The `aria-live`
 * region below exists
 * for the handful of *events* (a reminder, a risk, a milestone) that a
 * screen reader would otherwise only learn about by re-reading the whole
 * page — it is a courtesy on top of that visible text, not a replacement
 * for it.
 */

export const MASCOT_SIZES = { sm: 72, md: 132, lg: 200 } as const;
export type MascotSize = keyof typeof MASCOT_SIZES;

/**
 * Which of the temporary emotions are worth a screen-reader announcement.
 * Persistent/background ones (`resting`, `curious`, `thinking`, `sleepy`,
 * `listening`) are deliberately left out — each already has its own visible
 * equivalent (a loading state, an empty state) that a screen reader reaches
 * in the normal reading order, and announcing the mascot on top would say
 * the same thing twice.
 */
const MESSAGE_KEYS = {
  welcome: 'welcome',
  mealReminder: 'mealReminder',
  missedMeal: 'missedMeal',
  streakAtRisk: 'streakAtRisk',
  sad: 'streakLost',
  backOnTrack: 'backOnTrack',
  milestone25: 'milestone25',
  milestone50: 'milestone50',
  milestone75: 'milestone75',
  goalComplete: 'goalComplete',
  consistency: 'consistency',
} as const;

/**
 * Eight dots on the compass points, thrown outward on a milestone or a
 * completed goal. Built once at module scope — see the identical note in
 * the mascot this replaces, `progress-mascot.tsx`'s own git history.
 */
const PARTICLE_COUNT = 8;
const PARTICLES = Array.from({ length: PARTICLE_COUNT }, (_, index) => {
  const angle = (index * (360 / PARTICLE_COUNT) * Math.PI) / 180;
  return {
    key: index,
    style: {
      '--q-tx': `${Math.round(Math.cos(angle) * 42)}px`,
      '--q-ty': `${Math.round(Math.sin(angle) * 42)}px`,
      animationDelay: `${index * 30}ms`,
    } as CSSProperties,
  };
});

export type ReactiveMascotProps = {
  /** 0–1 plan adherence, or `null` when the week has nothing reported yet — the only source of progress truth. */
  progress: number | null;
  /** Scopes the progression celebration — normally the week's start date. */
  scope: string;
  /** Scopes streak events — normally today's date. */
  dateScope: string;
  /** `null` when this surface has no streak concept. */
  streak?: number | null;
  streakAtRisk?: boolean;
  /**
   * Today's own meals, when this surface is showing today — omit entirely
   * on a screen with no "today" (the progress tab draws the week, not one
   * day) rather than passing an empty array, since an empty array and "no
   * concept of meals here" mean different things to `todayMealSignal`.
   */
  todayMeals?: readonly { id: string; timeOfDay: string }[];
  isLoading?: boolean;
  isEmpty?: boolean;
  size?: MascotSize;
  /** `false` freezes on the tier baseline — no welcome, no pulses, no timers. */
  animated?: boolean;
  className?: string;
};

/**
 * "Are we in the browser, and if so what time is it there" — the same
 * `useSyncExternalStore` shape `AppointmentRequestFab` uses for its own
 * client-only fact, and for the same reason: the obvious spelling, a
 * `useState(null)` plus an effect that fills it in, is what
 * `react-hooks/set-state-in-effect` exists to catch, because nothing is being
 * *synchronised* — the component only wants to know something the server
 * cannot answer. The server snapshot is `null`, matching the resting state
 * the mascot already paints with no meal signal at all; the client snapshot
 * is read fresh, since unlike "are we hydrated" this fact keeps changing —
 * `subscribe` never actually fires (nothing pushes a wall-clock update), so
 * this only ever answers "what time is it right now", not "tell me when it
 * changes". A coarse enough approximation for a UI nicety that a client only
 * ever sees once, on arrival.
 */
const subscribeToNothing = () => () => {};
const getServerNowMinute = () => null;
function getClientNowMinute(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * Today's meal signal, read straight from the completion context ticking
 * already flows through — so a meal marked done clears the reminder the
 * instant it is ticked, with no extra prop plumbing back down from the page.
 */
function useTodayMealSignal(meals: readonly { id: string; timeOfDay: string }[] | undefined) {
  const completion = usePlanDayCompletion();
  const nowMinute = useSyncExternalStore(subscribeToNothing, getClientNowMinute, getServerNowMinute);

  if (!meals || nowMinute === null) return null;

  const isCompleted = completion ? completion.isCompleted : () => false;
  return todayMealSignal(meals, isCompleted, nowMinute);
}

export function ReactiveMascot({
  progress,
  scope,
  dateScope,
  streak = null,
  streakAtRisk = false,
  todayMeals,
  isLoading = false,
  isEmpty = false,
  size = 'md',
  animated = true,
  className,
}: ReactiveMascotProps) {
  const t = useTranslations('portal.mascot');
  const progression = getMascotProgression(progress);
  const meal = useTodayMealSignal(todayMeals);

  const { emotion } = useReactiveMascot({
    progression,
    scope,
    dateScope,
    streak,
    streakAtRisk,
    meal,
    isLoading,
    isEmpty,
    animated,
  });

  const pixels = MASCOT_SIZES[size];
  const bursting = animated && (emotion === 'milestone25' || emotion === 'milestone50' || emotion === 'milestone75' || emotion === 'goalComplete');
  const glowing = animated && emotion === 'goalComplete';
  const announced = (Object.keys(MESSAGE_KEYS) as (keyof typeof MESSAGE_KEYS)[]).includes(
    emotion as keyof typeof MESSAGE_KEYS,
  );

  return (
    <span
      data-mascot-pulse={emotion !== 'resting' && emotion !== 'thinking' && emotion !== 'sleepy' && emotion !== 'curious' && emotion !== 'listening'}
      className={cn('q-mascot', className)}
      style={{ '--q-mascot-size': `${pixels}px` } as CSSProperties}
    >
      {glowing ? (
        <span aria-hidden="true" className="q-mascot-glow pointer-events-none absolute -inset-4 -z-10" />
      ) : null}

      <span className="q-mascot-float">
        <MascotFace emotion={emotion} tier={progression.state} size={pixels} className="q-mascot-svg" />
      </span>

      {bursting ? (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0">
          {PARTICLES.map((particle) => (
            <span key={particle.key} className="q-mascot-particle" style={particle.style} />
          ))}
        </span>
      ) : null}

      {/* §21: a courtesy announcement for the handful of emotions that mark
          an event rather than a steady state — see the module doc above. */}
      <span aria-live="polite" className="sr-only">
        {announced ? t(MESSAGE_KEYS[emotion as keyof typeof MESSAGE_KEYS]) : ''}
      </span>
    </span>
  );
}
