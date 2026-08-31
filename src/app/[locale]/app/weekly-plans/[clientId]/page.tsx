import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';

import { PageHeader } from '@/components/layout/page-header';

import { getClinicBrand } from '@/features/clinic-profile/queries';

import { ContextPanel } from '@/features/weekly-plans/components/context-panel';
import { EmptyPlanBoard } from '@/features/weekly-plans/components/empty-plan-board';
import { PlanBoard } from '@/features/weekly-plans/components/plan-board';
import { PlanHistory } from '@/features/weekly-plans/components/plan-history';
import { isLlmConfigured } from '@/features/weekly-plans/llm';
import {
  getBoard,
  getClientContext,
  getLatestBoard,
  listCatalogForBoard,
  listPlannableClients,
  listPlans,
  previousPlanSlots,
  swapCandidatesByMealFromCatalog,
} from '@/features/weekly-plans/queries';
import { PLANNER_THEME } from '@/features/weekly-plans/theme';
import { recentDishUse } from '@/features/weekly-plans/usage';
import { currentSunday, formatDateParts, nextSunday, weekDates } from '@/features/weekly-plans/week';

/**
 * A 90-second generation runs as a server action, which exceeds the default
 * function timeout on most serverless hosts. See the "Known risk" section of
 * `docs/superpowers/specs/2026-07-30-weekly-plans-v2-design.md`.
 */
export const maxDuration = 120;

type PageProps = {
  params: Promise<{ locale: string; clientId: string }>;
  searchParams: Promise<{ planId?: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'weeklyPlans' });
  return { title: t('title') };
}

export default async function ClientBoardPage({ params, searchParams }: PageProps) {
  const locale = await resolveLocale(params);
  const { clientId } = await params;
  const { planId } = await searchParams;

  const { clinicId } = await requireStaffClinic(locale);

  const [clients, context, clinic, t] = await Promise.all([
    listPlannableClients(clinicId),
    getClientContext(clinicId, clientId),
    // Only for the head of the printed plan. It rides in this round rather than
    // in one of its own so it costs the page no extra wait.
    getClinicBrand(clinicId),
    getTranslations('weeklyPlans'),
  ]);

  // A client of another clinic is indistinguishable from one that does not exist.
  if (!context) notFound();

  const [board, plans] = await Promise.all([
    planId ? getBoard(clinicId, planId) : getLatestBoard(clinicId, clientId),
    listPlans(clinicId, clientId),
  ]);

  const allergens = context.profile?.allergenTags ?? [];

  // The catalog ships with its recipes so the board can recompute totals for a
  // dropped dish itself, and the previous week's slots so a repeat is visible
  // without leaving the page.
  const [catalog, usage, previous] = await Promise.all([
    listCatalogForBoard(clinicId, allergens),
    recentDishUse(clinicId, clientId),
    board ? previousPlanSlots(clinicId, clientId, board.weekStartDate) : Promise.resolve(null),
  ]);

  // Derive alternatives from the catalog already loaded for the drawer. This
  // used to load the complete dish and ingredient set a second time, in a
  // separate query round, before the drawer's identical read could begin.
  const candidates = board
    ? swapCandidatesByMealFromCatalog(
        board,
        catalog.filter((dish) => dish.blockedBy.length === 0),
      )
    : {};

  const blocked = !isLlmConfigured()
    ? ('not_configured' as const)
    : context.effectiveKcal === null || !context.profile
      ? ('profile_incomplete' as const)
      : null;

  /*
    Which week the three "new week" doors open on.

    **The week the client is actually in, unless they already have one.**
    `nextSunday()` alone was the default, and on any day but Sunday it meant a
    dietitian sitting down to build a plan for a client who has *nothing* this
    week produced a plan for the week after — published, correct, and invisible
    to that client until the following Sunday, because the portal only shows the
    plan covering today (see `getPublishedBoard`). Every plan built midweek
    landed in that gap, which is why it looked like the portal was broken for
    every account except the one whose plan happened to have been started on a
    day when `nextSunday()` named the current week.

    Once this week is covered, planning ahead is the real intent again, so the
    default returns to next Sunday. Either way it is only a default: the dialog
    carries a `DatePicker` and the dietitian can put the week wherever they want.

    Sunday-aligned rather than starting today, even though a plan may begin on
    any weekday. The progress tab's `summariseAdherenceWeek` reads a Sunday-first
    calendar week, so a plan cutting across two of them would report against a
    span its own day strip does not draw.
  */
  const today = formatDateParts(new Date());
  const plannedThisWeek = plans.some((plan) => weekDates(plan.weekStartDate).includes(today));
  const weekStartDate = plannedThisWeek ? nextSunday() : currentSunday();

  // The copy and empty doors do not call a model, so an unconfigured OpenAI key
  // does not block them. Only a missing profile does, because all three build
  // their slots from it.
  //
  // Every plan goes to the dialog, not the newest one: `listPlans` already
  // returns them all, and the copy door drops the open week itself.
  const newWeek = {
    weekStartDate,
    plans,
    blocked: context.effectiveKcal === null || !context.profile,
    generateBlocked: blocked,
    context,
    defaultInstruction: board?.weekInstructions ?? null,
  };

  const history = <PlanHistory plans={plans} clientId={clientId} />;

  return (
    /*
      Full height from `md` up, a growing page below it.

      The board claims the shell's height so the toolbar and the client summary
      stay put while the week scrolls under them — which is right on a desktop
      and wrong on a phone, where those two are 370px of a 812px screen and the
      board is left a 219px porthole onto 688px of meals. Below `md` the page
      grows and `main` scrolls it, the same trade the dashboard makes: one
      screen is a desktop promise.

      `md` and not some other stop because it is already the line this feature
      turns on: below it the day strip appears and the board renders a single
      day, above it the week becomes the tablet swipe surface.
    */
    <div
      className={`${PLANNER_THEME} flex min-h-full min-w-0 flex-col text-start md:h-full md:min-h-0`}
    >
      {/* The shared staff header — see `PageHeader`. No week pills beside the
          title: they were the history tab's list, in a second place, with room
          for fewer of them. */}
      <PageHeader
        locale={locale}
        title={t('title')}
        clinicId={clinicId}
        className="mb-4"
      />

      <div className="flex min-h-0 min-w-0 flex-1 gap-4">
        {board ? (
          <PlanBoard
            key={board.id}
            board={board}
            candidates={candidates}
            catalog={catalog}
            usage={usage}
            previous={previous}
            locale={locale}
            clinicName={clinic?.name ?? null}
            history={history}
            newWeek={newWeek}
          >
            {/* The generate form moved into the new-week dialog, where the
                choice to generate is actually made. This tab is the client. */}
            <ContextPanel context={context} clients={clients} locale={locale} embedded />
          </PlanBoard>
        ) : (
          <EmptyPlanBoard
            clientId={clientId}
            catalog={catalog}
            usage={usage}
            locale={locale}
            history={history}
            profile={<ContextPanel context={context} clients={clients} locale={locale} embedded />}
            newWeek={newWeek}
          />
        )}
      </div>
    </div>
  );
}
