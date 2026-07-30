import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { z } from 'zod';

import { Card, CardContent } from '@/components/ui/card';
import { weekdayOf } from '@/features/booking/date';
import { MealPlanView } from '@/features/portal/components/meal-plan-view';
import { loadCurrentPlan } from '@/features/portal/page-data';
import { requirePortalClient } from '@/features/portal/session';
import { resolveLocale } from '@/i18n/params';

type MealPlanPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ day?: string }>;
};

export async function generateMetadata({ params }: MealPlanPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('myPlan') };
}

/** `?day=` names a day of the week, 0 = Sunday. Anything else falls back to today. */
const daySchema = z.coerce.number().int().min(0).max(6).catch(-1);

export default async function MealPlanPage({ params, searchParams }: MealPlanPageProps) {
  const locale = await resolveLocale(params);

  const { day } = await searchParams;

  const context = await requirePortalClient(locale);
  const plan = await loadCurrentPlan(context);

  const t = await getTranslations('portal');

  if (!plan) {
    return (
      <div className="space-y-5">
        <h2 className="text-2xl font-semibold tracking-tight">{t('plan.title')}</h2>
        <Card>
          <CardContent className="text-sm text-muted-foreground">{t('plan.none')}</CardContent>
        </Card>
      </div>
    );
  }

  // The URL wins; without one the plan opens on the clinic's today, which is the
  // day someone checking their plan on a phone is asking about.
  const requested = daySchema.parse(day);
  const selectedDay = requested >= 0 ? requested : (weekdayOf(context.now.date) ?? 0);

  return <MealPlanView plan={plan} selectedDay={selectedDay} />;
}
