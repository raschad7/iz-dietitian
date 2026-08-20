import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { EmptyState } from '@/components/ui/empty-state';
import { HomeToday, type HomeTodayMeal } from '@/features/portal/components/home-today';
import { JourneyCard } from '@/features/portal/components/journey-card';
import { loadJourneyProgress, loadPlanPage } from '@/features/portal/page-data';
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

  /*
    In parallel, and independent on purpose. `loadPlanPage` returns null for a
    client whose dietitian has not published anything yet; the journey card is
    still drawn for them, sitting at the start of the week with nothing
    reported — which is the honest picture and the one that explains what the
    plan below is for once it arrives.
  */
  const [plan, journey] = await Promise.all([loadPlanPage(context, day), loadJourneyProgress(context)]);

  const t = await getTranslations('portal');

  // The open day's own board row, not always today's — `HomeToday`'s ring
  // now answers for whichever day `PlanDayPicker` chose, the same day
  // `PortalPlan` renders meals for below it.
  const selectedBoardDay = plan?.board.days.find((candidate) => candidate.dayOfWeek === plan.selectedDay);

  // The strip's own row for the open day, read for `isToday` — the same flag
  // `PlanDayPicker` marks its today cell with.
  const selectedDaySummary = plan?.days.find((candidate) => candidate.dayOfWeek === plan.selectedDay);

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
      **The page scrolls as one document**, like the other four portal tabs —
      no `100dvh` frame, no separate scroll region inside `PortalPlan`'s meal
      list.

      It used to be both. This root carried a `.portal-home` marker that
      switched on `portal-shell-*` hooks down the whole chain, so the shell
      became a viewport-height frame and the meal list was the only thing that
      moved, with the picker and the commitment card pinned above it. The
      marker is gone with the frame — the one rule that still needed it, the
      shell's own `<main>` going transparent so the glow shows through, applies
      to every portal tab now rather than to this one. The ⚠ note beside that
      rule in `globals.css` records what the frame took and why it went.
    */
    <div className="flex flex-col gap-4">
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

        {/*
          The ring counts up from zero on arrival — but only while the day it
          is drawing is today's. Stepping to another day re-navigates and
          remounts this whole subtree (see the `key` above), so an unconditional
          entrance would replay the climb on every tap of the strip and delay
          the very figure the tap asked for. `isToday` comes off the same
          `PlanDaySummary` the picker marks its own cell with, so the two can
          never disagree about which day that is.
        */}
        <HomeToday
          meals={selectedMeals}
          countOnMount={selectedDaySummary?.isToday ?? false}
        />

        {/*
          The week's journey, under the open day's ring and above the plan.

          **The two figures above and below it are different on purpose, and
          both are labelled.** The ring answers "how is the open day going";
          this card answers "how is the week going", which is the same number
          the progress tab draws and is titled "this week" on both. The
          week-average card that used to sit here — see the module note above —
          was removed because it repeated the progress tab's figure as a bare
          percentage with nothing else to say. This one is not that: it is the
          same figure made into the client's own journey, and it is the reason
          it is worth a place on the home screen.

          Inside the completion provider, so it sits in the page's one column —
          but it reads none of it. The provider is scoped to the open day and
          the journey is a week, so this card deliberately does not move when a
          meal is ticked; it moves on the next load, once the day's report has
          actually been written.
        */}
        <JourneyCard
          fraction={journey.fraction}
          weekStartDate={journey.weekStartDate}
          locale={locale}
        />

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
