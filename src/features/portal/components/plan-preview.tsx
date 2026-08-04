import { Salad } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { roundForDisplay } from '@/features/weekly-plans/nutrition';
import { PreviewCard } from '@/features/portal/components/preview-card';
import { type BoardDay } from '@/features/weekly-plans/queries';
import { type Locale } from '@/i18n/routing';
import { formatDate, formatNumber } from '@/lib/format';

/**
 * The plan the client is on, as one row on the home screen.
 *
 * It answers "is there a plan, and what does today look like on it" — the meals
 * themselves are on `/portal/meal-plan`, which is where the tap goes. Home used
 * to print the whole day's meal list; that made the first screen a duplicate of
 * the second and pushed the week's progress below the fold.
 *
 * With no published plan the row stays, because its absence is the thing the
 * client needs to know. It says so plainly rather than disappearing.
 */
export function PlanPreview({ day, planWeek }: { day: BoardDay | null; planWeek: string | null }) {
  const locale = useLocale() as Locale;
  const t = useTranslations('portal');

  const meals = day?.meals ?? [];

  const lines =
    planWeek === null
      ? [{ text: t('plan.none') }]
      : [
          {
            text:
              meals.length === 0
                ? t('dashboard.planNoMealsToday')
                : t('dashboard.planToday', {
                    meals: meals.length,
                    kcal: formatNumber(locale, roundForDisplay('kcal', day?.totals.kcal.value ?? 0)),
                  }),
            emphasis: true,
          },
          {
            text: t('dashboard.planWeekOf', {
              date: formatDate(locale, planWeek, { dateStyle: undefined, day: 'numeric', month: 'long' }),
            }),
          },
        ];

  return (
    <PreviewCard
      href="/portal/meal-plan"
      icon={Salad}
      title={t('dashboard.currentPlan')}
      lines={lines}
      action={t('dashboard.viewPlan')}
    />
  );
}
