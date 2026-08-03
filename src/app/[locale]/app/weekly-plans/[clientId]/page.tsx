import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';

import { ClientPicker } from '@/features/weekly-plans/components/client-picker';
import { ContextPanel } from '@/features/weekly-plans/components/context-panel';
import { GenerateForm } from '@/features/weekly-plans/components/generate-form';
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
  swapCandidatesByMeal,
} from '@/features/weekly-plans/queries';
import { recentDishUse } from '@/features/weekly-plans/usage';
import { nextSunday } from '@/features/weekly-plans/week';

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

  const [clients, context, t] = await Promise.all([
    listPlannableClients(clinicId),
    getClientContext(clinicId, clientId),
    getTranslations('weeklyPlans'),
  ]);

  // A client of another clinic is indistinguishable from one that does not exist.
  if (!context) notFound();

  const [board, plans] = await Promise.all([
    planId ? getBoard(clinicId, planId) : getLatestBoard(clinicId, clientId),
    listPlans(clinicId, clientId),
  ]);

  const allergens = context.profile?.allergenTags ?? [];

  // Computed once for the whole board rather than per card, so opening a meal costs
  // no round trip. Empty when there is no plan yet.
  const candidates = board ? await swapCandidatesByMeal(board, allergens) : {};

  // The catalog ships with its recipes so the board can recompute totals for a
  // dropped dish itself, and the previous week's slots so a repeat is visible
  // without leaving the page.
  const [catalog, usage, previous] = await Promise.all([
    listCatalogForBoard(allergens),
    recentDishUse(clinicId, clientId),
    board ? previousPlanSlots(clinicId, clientId, board.weekStartDate) : Promise.resolve(null),
  ]);

  const blocked = !isLlmConfigured()
    ? ('not_configured' as const)
    : context.effectiveKcal === null || !context.profile
      ? ('profile_incomplete' as const)
      : null;

  const weekStartDate = nextSunday();

  // The newest plan that is not the one on screen — what "start from" offers. A
  // plan cannot be copied into itself, and offering it would be the one entry in
  // the menu that quietly does nothing.
  const previousPlan = plans.find((plan) => plan.id !== board?.id) ?? null;

  // The copy and empty doors do not call a model, so an unconfigured OpenAI key
  // does not block them. Only a missing profile does, because all three build
  // their slots from it.
  const newWeek = {
    weekStartDate,
    previousPlan: previousPlan
      ? { id: previousPlan.id, weekStartDate: previousPlan.weekStartDate }
      : null,
    blocked: context.effectiveKcal === null || !context.profile,
  };

  const history = (
    <PlanHistory
      plans={plans}
      clientId={clientId}
      currentPlanId={board?.id ?? null}
      nextWeekStartDate={weekStartDate}
      locale={locale}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 text-start">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>

        {plans.length > 1 && (
          <nav className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">{t('history')}</span>
            {plans.map((plan) => (
              <Link
                key={plan.id}
                href={`/app/weekly-plans/${clientId}?planId=${plan.id}`}
                className={
                  plan.id === board?.id
                    ? 'rounded bg-accent px-1.5 py-0.5 font-medium'
                    : 'rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent/60'
                }
              >
                {plan.weekStartDate}
              </Link>
            ))}
          </nav>
        )}
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        {board ? (
          <PlanBoard
            board={board}
            clients={clients}
            candidates={candidates}
            catalog={catalog}
            usage={usage}
            previous={previous}
            locale={locale}
            history={history}
            newWeek={newWeek}
          >
            <div className="flex flex-col gap-5">
              <ContextPanel context={context} />

              {board.status === 'draft' && (
                <div className="border-t border-border pt-4">
                  <GenerateForm
                    clientId={clientId}
                    weekStartDate={weekStartDate}
                    locale={locale}
                    blocked={blocked}
                    context={context}
                    defaultInstruction={board.weekInstructions}
                  />
                </div>
              )}
            </div>
          </PlanBoard>
        ) : (
          <div className="flex min-w-0 flex-1 gap-4">
            {/* The picker rides this branch too. The rail it replaces was
                outside the ternary, so without it a client with no plan yet
                would be a screen you can only leave through the nav. */}
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <ClientPicker clients={clients} selectedClientId={clientId} />

              <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed border-border">
                <p className="max-w-sm p-6 text-center text-sm text-muted-foreground">
                  {t('noPlanYet')}
                </p>
              </div>
            </div>

            <aside className="w-72 shrink-0 overflow-y-auto border-s border-border ps-3">
              <div className="flex flex-col gap-5">
                <ContextPanel context={context} />

                <div className="border-t border-border pt-4">
                  <GenerateForm
                    clientId={clientId}
                    weekStartDate={weekStartDate}
                    locale={locale}
                    blocked={blocked}
                    context={context}
                  />
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
