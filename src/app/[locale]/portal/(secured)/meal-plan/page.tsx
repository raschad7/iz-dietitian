import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { Card, CardContent } from '@/components/ui/card';
import { loadCurrentPlan } from '@/features/portal/page-data';
import { requirePortalClient } from '@/features/portal/session';
import { PortalPlan } from '@/features/weekly-plans/components/portal-plan';
import { resolveLocale } from '@/i18n/params';

type MealPlanPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: MealPlanPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('myPlan') };
}

/**
 * The client's plan: the published weekly plan, in full.
 *
 * There is no `?day=` selector any more. The V1 view showed one day at a time
 * because a V1 plan is a repeating template — no dates, no alternatives. A weekly
 * plan has both, so the whole week is worth reading at once, and the day a client
 * wants is the one with today's date beside it.
 */
export default async function MealPlanPage({ params }: MealPlanPageProps) {
  const locale = await resolveLocale(params);

  const context = await requirePortalClient(locale);
  const board = await loadCurrentPlan(context);

  if (board) return <PortalPlan board={board} />;

  const t = await getTranslations('portal');

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-semibold tracking-tight">{t('plan.title')}</h2>
      <Card>
        <CardContent className="text-sm text-muted-foreground">{t('plan.none')}</CardContent>
      </Card>
    </div>
  );
}
