import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { EmptyState } from '@/components/ui/empty-state';
import { HomeToday, type HomeTodayMeal } from '@/features/portal/components/home-today';
import { loadDashboard, loadPlanPage } from '@/features/portal/page-data';
import { planSearchSchema } from '@/features/portal/schema';
import { requirePortalClient } from '@/features/portal/session';
import { PlanDayCompletionProvider } from '@/features/weekly-plans/components/plan-day-completion';
import { PortalPlan } from '@/features/weekly-plans/components/portal-plan';
import { roundForDisplay } from '@/features/weekly-plans/nutrition';
import { resolveLocale } from '@/i18n/params';

type PortalPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: PortalPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'portal' });
  return { title: t('title') };
}

/**
 * The portal's landing page: how the week is going, the plan behind it, and
 * when the client is next seen.
 *
 * **Two sections, in one order.** Today's own commitment figure, then the
 * plan itself — both about what the client is doing today, read in the order
 * a phone screen naturally scrolls.
 *
 * The week's own average-adherence card is gone from here — it repeated the
 * same fraction `WeekAdherenceSummary` already owns on the progress tab, once
 * `HomeToday`'s ring started drawing today's adherence right above it.
 *
 * **What is deliberately not here.** The five-metric summary — energy, sleep,
 * appetite, mood, water — moved off this screen: it repeated in five rows what
 * the day scores in the strip already average into one number, and it was the
 * tallest thing on the page. The next-appointment preview is gone the same
 * way, card and all — the appointments tab is one tap away in the nav, and a
 * screen about today's plan does not also need to be the one that answers
 * "when do I see the dietitian next". Nothing was deleted from the product;
 * each is reached from the tab that owns it.
 *
 * The pending-request note is gone too — the bell's dot and the drawer's count
 * both carry it now, and a third copy on the page said nothing new.
 *
 * **The plan lives here now, not on its own tab.** `PortalPlan`, directly
 * under `HomeToday`'s ring, is the exact component the standalone meal-plan
 * screen used to render: the same day strip (`?day=` chooses today, yesterday
 * or a day ahead), the same read-only-past/editable-today/read-only-future
 * rule (`dayStanding`), and the same meal cards. Nothing about that logic was
 * copied — the component just moved, and the tab that used to point at it is
 * gone.
 *
 * **One week strip, not two.** The standalone `WeekAdherenceStrip` that used
 * to sit above `HomeToday` is gone from this screen — `PortalPlan`'s own day
 * strip (`plan-day-strip.tsx`) drew the same seven days one section down, and
 * a client moving between them in one glance was reading the same week
 * twice, only one copy of it clickable. `PlanDayStrip`'s today cell now
 * renders `TodayFlameCell`, the same live/celebrating flame the old top
 * strip drew, so nothing about that mark — the claim dialog, the flight
 * animation — was lost in the merge, only its second, non-interactive copy.
 *
 * **One completion provider for the whole page, not one per section.** The
 * plan's own day strip, `HomeToday`'s ring, and `PortalPlan`'s meal list
 * (when it is showing today) all read the same `PlanDayCompletionProvider`,
 * keyed to today's own day — see `plan-day-completion.tsx`. `PortalPlan` no
 * longer mounts a provider of its own for exactly this reason: a second,
 * independent one would let a tick inside the plan's meal list and the ring
 * above it drift out of sync. When the plan section is showing a day other
 * than today, this same provider is simply unused by it — `MealCheck` never
 * renders on a past or future day, so there is nothing there to reach for it.
 */
export default async function PortalPage({ params, searchParams }: PortalPageProps) {
  const locale = await resolveLocale(params);

  const context = await requirePortalClient(locale);

  const { day } = planSearchSchema.parse(await searchParams);

  const [{ today, todayCompletedMealIds }, plan] = await Promise.all([
    loadDashboard(context),
    loadPlanPage(context, day),
  ]);

  const t = await getTranslations('portal');

  // Only the shape `HomeToday` draws crosses into its client bundle — the
  // dish, options and rationale on each `BoardMeal` stay server-side, same
  // reasoning `portal-plan.tsx` documents for the plan section itself.
  const todayMeals: HomeTodayMeal[] = (today?.meals ?? []).map((meal) => ({
    id: meal.id,
    slotKey: meal.slotKey,
    label: meal.label,
    timeOfDay: meal.timeOfDay,
    kcal: roundForDisplay('kcal', meal.totals.kcal.value),
  }));

  return (
    /*
      **`.portal-home` marks this screen for the shell above it**, which is the
      only file in the chain that cannot see the route: it unpaints the shell's
      own `<main>` so the fixed green wash shows through the page. The rule and
      its reasoning are in `globals.css`, beside `.portal-home-glow`.

      **The page scrolls as one document**, like the other four tabs. It used to
      be a `100dvh` frame with `PortalPlan`'s meal list as the only scrolling
      region and everything above it pinned — that is gone; the ⚠ note beside
      the rule in `globals.css` records what it took and why it went.
    */
    <div className="portal-home space-y-4">
      {/*
        One provider over the strip, today's ring, and the plan section below
        — see the module doc above and `plan-day-completion.tsx`. Today's cell
        in the strip needs the same live completed/total counts the ring and
        the plan's own meal list read, so that ticking the last meal moves all
        three the instant it happens rather than waiting on `router.refresh()`.
      */}
      <PlanDayCompletionProvider
        dayOfWeek={today?.dayOfWeek ?? 0}
        mealIds={todayMeals.map((meal) => meal.id)}
        initialCompletedMealIds={todayCompletedMealIds}
      >
        <HomeToday meals={todayMeals} />

        {plan ? (
          <PortalPlan
            board={plan.board}
            days={plan.days}
            selectedDay={plan.selectedDay}
            completedMealIds={plan.completedMealIds}
            today={plan.today}
          />
        ) : (
          <div className="space-y-6">
            <h2 className="font-heading text-2xl font-semibold tracking-tight">{t('plan.title')}</h2>
            <EmptyState icon="myPlan" title={t('plan.noneTitle')} description={t('plan.none')} />
          </div>
        )}
      </PlanDayCompletionProvider>
    </div>
  );
}
