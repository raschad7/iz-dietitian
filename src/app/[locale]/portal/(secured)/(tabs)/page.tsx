import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { EmptyState } from '@/components/ui/empty-state';
import { HomeToday, type HomeTodayMeal } from '@/features/portal/components/home-today';
import { loadPlanPage } from '@/features/portal/page-data';
import { planSearchSchema } from '@/features/portal/schema';
import { requirePortalClient } from '@/features/portal/session';
import { PlanDayCompletionProvider } from '@/features/weekly-plans/components/plan-day-completion';
import { PlanDayPicker, PortalPlan } from '@/features/weekly-plans/components/portal-plan';
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
 * **Three pieces, in one order.** Which day is being read, then that day's
 * own commitment figure, then that day's meals — `PlanDayPicker` chooses,
 * and everything under it, including the ring, answers for whichever day it
 * chose. `PlanDayPicker` sits where a three-day yesterday/today/tomorrow
 * glance used to live in the header above this page (`portal-header.tsx`,
 * still shared chrome for the other four tabs) — that glance chose nothing
 * and duplicated names this picker already states, so it is gone rather than
 * kept beside the picker that actually does the choosing.
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
 * **The plan lives here now, not on its own tab.** `PlanDayPicker` and
 * `PortalPlan` together are the exact component the standalone meal-plan
 * screen used to render, since split around the commitment card — the same
 * day strip (`?day=` chooses today, yesterday or a day ahead), the same
 * read-only-past/editable-today/read-only-future rule (`dayStanding`), and
 * the same meal cards. Nothing about that logic was copied — the component
 * just moved (and later split), and the tab that used to point at it is gone.
 *
 * **One week strip, not two.** The standalone `WeekAdherenceStrip` that used
 * to sit above `HomeToday` is gone from this screen — `PlanDayPicker`'s own
 * day strip (`plan-day-strip.tsx`) drew the same seven days one section down,
 * and a client moving between them in one glance was reading the same week
 * twice, only one copy of it clickable. `PlanDayStrip`'s today cell now
 * renders `TodayFlameCell`, the same live/celebrating flame the old top
 * strip drew, so nothing about that mark — the claim dialog, the flight
 * animation — was lost in the merge, only its second, non-interactive copy.
 *
 * **One completion provider for the whole page, not one per section.** The
 * picker's own day strip, `HomeToday`'s ring, and `PortalPlan`'s meal list
 * all read the same `PlanDayCompletionProvider`, keyed to the *open* day —
 * `plan?.selectedDay`, remounted (`key={plan?.selectedDay}`) each time it
 * changes — see `plan-day-completion.tsx`. Neither component mounts a
 * provider of its own for exactly this reason: a second, independent one
 * would let a tick inside the plan's meal list and the ring above it drift
 * out of sync. Ticking only ever happens on today's own day regardless of
 * which one is open — `MealCheck` never renders on a past or future day, so
 * `toggle` is simply unused by the provider on any other day, while the
 * ring and the strip still read its live completed/total counts for
 * whichever day that is.
 */
export default async function PortalPage({ params, searchParams }: PortalPageProps) {
  const locale = await resolveLocale(params);

  const context = await requirePortalClient(locale);

  const { day } = planSearchSchema.parse(await searchParams);

  const plan = await loadPlanPage(context, day);

  const t = await getTranslations('portal');

  // The open day's own board row, not always today's — `HomeToday`'s ring
  // now answers for whichever day `PlanDayPicker` chose, the same day
  // `PortalPlan` renders meals for below it.
  const selectedBoardDay = plan?.board.days.find((candidate) => candidate.dayOfWeek === plan.selectedDay);

  // Only the shape `HomeToday` draws crosses into its client bundle — the
  // dish, options and rationale on each `BoardMeal` stay server-side, same
  // reasoning `portal-plan.tsx` documents for the plan section itself.
  const selectedMeals: HomeTodayMeal[] = (selectedBoardDay?.meals ?? []).map((meal) => ({
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
      own `<main>` so the green wash shows through the page. The rule and its
      reasoning are in `globals.css`, beside `.portal-home-glow`.

      **The page scrolls as one document**, like the other four tabs. It used to
      be a `100dvh` frame — the marker switched on `portal-shell-*` hooks down
      the whole chain and `PortalPlan`'s meal list was the single scrolling
      region, with the picker and the commitment card pinned above it. That is
      gone, hooks and all; the ⚠ note beside the rule in `globals.css` records
      what it took and why it went.
    */
    <div className="portal-home space-y-4">
      {/*
        One provider over the strip, the ring, and the plan section below —
        see the module doc above and `plan-day-completion.tsx`. Today's cell
        in the strip needs the same live completed/total counts the ring and
        the plan's own meal list read, so that ticking the last meal moves all
        three the instant it happens rather than waiting on `router.refresh()`.

        `key={plan?.selectedDay}`: scoped to the *open* day now, not always
        today, so switching days has to remount rather than patch — the
        `Set` inside starts from `initialCompletedMealIds` only on mount, and
        without a fresh key a day switch would keep showing the previous
        day's ticks until the next full reload. See the "Reset by key" note
        in `plan-day-completion.tsx`.
      */}
      <PlanDayCompletionProvider
        key={plan?.selectedDay ?? 0}
        dayOfWeek={plan?.selectedDay ?? 0}
        mealIds={selectedMeals.map((meal) => meal.id)}
        initialCompletedMealIds={plan?.completedMealIds ?? []}
      >
        {plan ? <PlanDayPicker days={plan.days} selectedDay={plan.selectedDay} /> : null}

        <HomeToday meals={selectedMeals} />

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
