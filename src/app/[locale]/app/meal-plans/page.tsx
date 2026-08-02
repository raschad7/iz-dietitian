import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '@/components/ui/table';
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
        <p className="rounded-md border border-destructive/40 bg-destructive-subtle p-3 text-destructive">
          {t('foodsNotSeeded')}
        </p>
      ) : null}

      {plans.length === 0 ? (
        <Card variant="empty" className="items-center gap-4 p-8 text-center">
          <p>{t('empty')}</p>
          <Link href="/app/meal-plans/new" className={buttonVariants({ size: 'sm' })}>
            {t('new')}
          </Link>
        </Card>
      ) : (
        <TableRoot>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('fields.title')}</TableHead>
                <TableHead>{t('fields.client')}</TableHead>
                <TableHead numeric className="text-end">
                  {t('fields.plannedDays')}
                </TableHead>
                <TableHead numeric className="text-end">
                  {t('fields.kcalPerDay')}
                </TableHead>
                <TableHead>{t('fields.updatedAt')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell>
                    <Link
                      href={`/app/meal-plans/${plan.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {plan.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/app/clients/${plan.clientId}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {plan.clientName}
                    </Link>
                  </TableCell>
                  <TableCell numeric className="text-end">
                    {t('fields.daysOfSeven', { count: plan.plannedDays })}
                  </TableCell>
                  {/*
                   * The average across the days that actually have food on them,
                   * not across seven — a half-built plan should not read as if
                   * the client were being starved.
                   */}
                  <TableCell numeric className="text-end">
                    {plan.plannedDays === 0
                      ? '—'
                      : formatNumber(locale, roundForDisplay('kcal', plan.kcal / plan.plannedDays))}
                  </TableCell>
                  <TableCell>{formatDate(locale, plan.updatedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableRoot>
      )}

      <p className="text-caption text-muted-foreground">{t('dataSource')}</p>
    </div>
  );
}
