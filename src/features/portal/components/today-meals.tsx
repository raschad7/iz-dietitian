import { useLocale, useTranslations } from 'next-intl';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { roundForDisplay } from '@/features/meal-plans/nutrition';
import { type PlanDay } from '@/features/meal-plans/queries';
import { formatNumber } from '@/lib/format';
import { type Locale } from '@/i18n/routing';

/**
 * Today's meals at a glance — the dashboard's snapshot, not the plan itself.
 *
 * Deliberately just the shape of the day: when each meal is, what it is called,
 * what it comes to. The foods and the full nutrition are one tap away on the
 * meal-plan page, and reproducing them here would make the dashboard the second
 * copy of a screen that already exists.
 */
export function TodayMeals({ day, planTitle }: { day: PlanDay | null; planTitle: string | null }) {
  const locale = useLocale() as Locale;
  const t = useTranslations('portal');
  const tPlans = useTranslations('mealPlans');

  const meals = day?.meals ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('dashboard.todaysMeals')}</CardTitle>
        {planTitle ? <CardDescription>{planTitle}</CardDescription> : null}
      </CardHeader>

      <CardContent className="space-y-3">
        {planTitle === null ? (
          <p className="text-sm text-muted-foreground">{t('plan.none')}</p>
        ) : meals.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tPlans('emptyDay')}</p>
        ) : (
          <>
            <ul className="space-y-2">
              {meals.map((meal) => (
                <li key={meal.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate">
                    <span className="tabular-nums text-muted-foreground" dir="ltr">
                      {meal.timeOfDay}
                    </span>{' '}
                    {meal.label}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground" dir="ltr">
                    {formatNumber(locale, roundForDisplay('kcal', meal.totals.kcal.value))} kcal
                  </span>
                </li>
              ))}
            </ul>

            <p className="border-t border-border pt-3 text-sm font-medium">
              {t('dashboard.dayEnergy', {
                kcal: roundForDisplay('kcal', day?.totals.kcal.value ?? 0),
              })}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
