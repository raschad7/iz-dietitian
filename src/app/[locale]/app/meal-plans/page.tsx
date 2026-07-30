import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { buttonVariants } from '@/components/ui/button';
import { countFoods, listPlans } from '@/features/meal-plans/queries';
import { roundForDisplay } from '@/features/meal-plans/nutrition';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/params';
import { formatDate, formatNumber } from '@/lib/format';
import { requireStaffClinic } from '@/lib/session';

type MealPlansPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: MealPlansPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'mealPlans' });
  return { title: t('title') };
}

export default async function MealPlansPage({ params }: MealPlansPageProps) {
  const locale = await resolveLocale(params);
  const { clinicId } = await requireStaffClinic(locale);

  const [plans, foodCount, t] = await Promise.all([
    listPlans(clinicId),
    countFoods(),
    getTranslations('mealPlans'),
  ]);

  return (
    <div className="space-y-6 text-start">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{t('title')}</h2>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>

        <Link href="/app/meal-plans/new" className={buttonVariants()}>
          {t('new')}
        </Link>
      </div>

      {/*
       * The feature is unusable without the reference table, and the failure is
       * silent otherwise — an empty food picker looks like a broken search.
       */}
      {foodCount === 0 ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {t('foodsNotSeeded')}
        </p>
      ) : null}

      {plans.length === 0 ? (
        <div className="space-y-4 rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
          <Link href="/app/meal-plans/new" className={buttonVariants({ size: 'sm' })}>
            {t('new')}
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-start font-medium">{t('fields.title')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('fields.client')}</th>
                <th className="px-3 py-2 text-end font-medium">{t('fields.plannedDays')}</th>
                <th className="px-3 py-2 text-end font-medium">{t('fields.kcalPerDay')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('fields.updatedAt')}</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan.id} className="border-t border-border hover:bg-muted/40">
                  <td className="px-3 py-2 text-start">
                    <Link
                      href={`/app/meal-plans/${plan.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {plan.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-start">
                    <Link
                      href={`/app/clients/${plan.clientId}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {plan.clientName}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-end tabular-nums" dir="ltr">
                    {t('fields.daysOfSeven', { count: plan.plannedDays })}
                  </td>
                  {/*
                   * The average across the days that actually have food on them,
                   * not across seven — a half-built plan should not read as if
                   * the client were being starved.
                   */}
                  <td className="px-3 py-2 text-end tabular-nums" dir="ltr">
                    {plan.plannedDays === 0
                      ? '—'
                      : formatNumber(locale, roundForDisplay('kcal', plan.kcal / plan.plannedDays))}
                  </td>
                  <td className="px-3 py-2 text-start">{formatDate(locale, plan.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">{t('dataSource')}</p>
    </div>
  );
}
