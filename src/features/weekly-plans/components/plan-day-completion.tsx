'use client';

import { useLocale } from 'next-intl';
import { createContext, useContext, useState, useTransition, type ReactNode } from 'react';

import { toggleMealCompletionAction } from '@/features/portal/actions';
import { useRouter } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';

/**
 * The one piece of client state this screen needs: which of the open day's
 * meals are ticked, kept here so `MealCheck` and `PlanDayStrip` can agree on
 * it instantly, without either waiting on the other's round trip to the
 * server.
 *
 * **Why a context and not two components talking through props.** `MealCard`
 * stays a server component precisely so a week of dishes never reaches the
 * browser (see `meal-check.tsx`), so the tick has to travel from `MealCheck`
 * — deep inside that server-rendered tree — up to `PlanDayStrip` — a sibling
 * of it — without either becoming aware of the other. A context that only
 * wraps the interactive slice, with everything server-rendered still passed
 * through as `children`, is what keeps that possible.
 *
 * **Reset by key, not by effect.** `PortalPlan` mounts this with
 * `key={selectedDay}`, so switching days remounts the provider instead of
 * patching it — the alternative, an effect that re-syncs local state when the
 * server props change, is exactly the kind of state-mirrors-props bug React's
 * own docs warn against, and a fresh mount is simpler and cannot drift.
 */
export type PlanDayCompletionValue = {
  dayOfWeek: number;
  isCompleted: (mealId: string) => boolean;
  toggle: (mealId: string) => void;
  completedCount: number;
  totalCount: number;
};

const PlanDayCompletionContext = createContext<PlanDayCompletionValue | null>(null);

export function PlanDayCompletionProvider({
  dayOfWeek,
  mealIds,
  initialCompletedMealIds,
  children,
}: {
  dayOfWeek: number;
  /** Every meal id on the open day — the denominator for the day's fraction. */
  mealIds: readonly string[];
  initialCompletedMealIds: readonly string[];
  children: ReactNode;
}) {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [completed, setCompleted] = useState(() => new Set(initialCompletedMealIds));
  const [, startTransition] = useTransition();

  function toggle(mealId: string) {
    const wasCompleted = completed.has(mealId);

    // Flips immediately — the write below is confirmation, not permission.
    setCompleted((current) => {
      const next = new Set(current);
      if (wasCompleted) next.delete(mealId);
      else next.add(mealId);
      return next;
    });

    startTransition(async () => {
      const result = await toggleMealCompletionAction({ mealId, completed: !wasCompleted, locale });

      // The write failed after the UI already promised it happened — put the
      // mark back rather than leave a tick the server never recorded.
      if (!result.ok) {
        setCompleted((current) => {
          const reverted = new Set(current);
          if (wasCompleted) reverted.add(mealId);
          else reverted.delete(mealId);
          return reverted;
        });
        return;
      }

      // The server action's own `revalidatePath` only marks the portal's
      // routes stale for their *next* visit — it does not reach into the
      // client's Router Cache. The bottom tab bar (`portal-tab-bar.tsx`)
      // renders every tab's `<Link>` on every screen, always in the
      // viewport, so Next prefetches Dashboard and Progress before a client
      // ever ticks a meal. Without this, tapping either tab afterward can
      // still serve that pre-tick prefetch. `router.refresh()` drops the
      // whole client Router Cache and re-fetches the current route, so the
      // next tap of any tab is a real request against the row just written.
      router.refresh();
    });
  }

  const value: PlanDayCompletionValue = {
    dayOfWeek,
    isCompleted: (mealId) => completed.has(mealId),
    toggle,
    completedCount: completed.size,
    totalCount: mealIds.length,
  };

  return <PlanDayCompletionContext.Provider value={value}>{children}</PlanDayCompletionContext.Provider>;
}

/** For `MealCheck`: this one meal's own state and the button's whole job — flip it. */
export function useMealCompletion(mealId: string): { checked: boolean; toggle: () => void } {
  const context = useContext(PlanDayCompletionContext);
  if (!context) throw new Error('useMealCompletion must be used within PlanDayCompletionProvider');

  return { checked: context.isCompleted(mealId), toggle: () => context.toggle(mealId) };
}

/**
 * For `PlanDayStrip`: which day is open and its locally-known fraction, so
 * that one cell's flame can move the instant a meal is ticked rather than
 * waiting on the next navigation to re-read `client_plan_adherence`.
 *
 * Called once, outside the strip's per-day loop — a hook cannot be called
 * from inside `.map()` — and the caller compares `dayOfWeek` against each
 * day itself. Every other cell was not sent any meals to tick this page
 * load, so its server-rendered flame is left alone.
 */
export function usePlanDayCompletion(): PlanDayCompletionValue | null {
  return useContext(PlanDayCompletionContext);
}
