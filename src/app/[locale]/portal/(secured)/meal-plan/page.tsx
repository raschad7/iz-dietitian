import { Salad } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { EmptyState } from '@/components/ui/empty-state';
import { loadPlanPage } from '@/features/portal/page-data';
import { planSearchSchema } from '@/features/portal/schema';
import { requirePortalClient } from '@/features/portal/session';
import { PortalPlan } from '@/features/weekly-plans/components/portal-plan';
import { resolveLocale } from '@/i18n/params';

type MealPlanPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: MealPlanPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('myPlan') };
}

/**
 * The client's plan: the published week, one day of it at a time.
 *
 * The week comes first — which days the dietitian planned, and what the daily
 * target is — and `?day=` chooses the one whose meals are shown. Keeping the
 * choice in the URL means the server renders a single day rather than seven, and
 * that a refresh or a shared link lands back on the same one. `loadPlanPage`
 * decides which day opens when the URL names none.
 *
 * Only a published plan is ever visible here; see `loadCurrentPlan`.
 */
export default async function MealPlanPage({ params, searchParams }: MealPlanPageProps) {
  const locale = await resolveLocale(params);

  const context = await requirePortalClient(locale);

  const { day } = planSearchSchema.parse(await searchParams);
  const plan = await loadPlanPage(context, day);

  const t = await getTranslations('portal');

  if (!plan) {
    return (
      <div className="space-y-6">
        <h2 className="font-heading text-2xl font-semibold tracking-tight">{t('plan.title')}</h2>
        <EmptyState icon={Salad} title={t('plan.noneTitle')} description={t('plan.none')} />
      </div>
    );
  }

  return <PortalPlan board={plan.board} days={plan.days} selectedDay={plan.selectedDay} />;
}
