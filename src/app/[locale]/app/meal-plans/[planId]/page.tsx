import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { buttonVariants } from '@/components/ui/button';
import { DeletePlanButton } from '@/features/meal-plans/components/delete-plan-button';
import { PlanWorkspace } from '@/features/meal-plans/components/plan-workspace';
import { getPlan, listFoodCategories } from '@/features/meal-plans/queries';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';

type MealPlanPageProps = {
  params: Promise<{ locale: string; planId: string }>;
};

/**
 * Titles the tab with the feature name, not the plan's.
 *
 * `generateMetadata` runs outside the layout's session guard, so it has no
 * clinic to scope a lookup to — and a plan title carries a client's name. Same
 * reasoning as the client detail page.
 */
export async function generateMetadata({ params }: MealPlanPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'mealPlans' });
  return { title: t('title') };
}

export default async function MealPlanPage({ params }: MealPlanPageProps) {
  const locale = await resolveLocale(params);
  const { clinicId } = await requireStaffClinic(locale);

  const { planId } = await params;
  const plan = await getPlan(clinicId, planId);

  if (!plan) {
    notFound();
  }

  const [categories, t] = await Promise.all([listFoodCategories(), getTranslations('mealPlans')]);

  return (
    <div className="space-y-6 text-start">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{plan.title}</h2>
          <p className="text-sm text-muted-foreground">
            <Link href={`/app/clients/${plan.clientId}`} className="underline-offset-4 hover:underline">
              {plan.clientName}
            </Link>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/app/meal-plans/${plan.id}/edit`}
            className={buttonVariants({ variant: 'outline' })}
          >
            {t('edit')}
          </Link>
          <DeletePlanButton locale={locale} planId={plan.id} title={plan.title} />
        </div>
      </div>

      {plan.notes ? (
        <p className="whitespace-pre-line rounded-lg border border-border p-3 text-sm">{plan.notes}</p>
      ) : null}

      <PlanWorkspace locale={locale} plan={plan} categories={categories} />

      <Link href="/app/meal-plans" className="inline-block text-sm underline-offset-4 hover:underline">
        {t('backToList')}
      </Link>
    </div>
  );
}
