import { useFormatter, useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { roundForDisplay } from '@/features/meal-plans/nutrition';
import type { PlanListItem } from '@/features/meal-plans/queries';
import { Link } from '@/i18n/navigation';

/**
 * One client's meal plans, rendered on their profile.
 *
 * Lives in `meal-plans/` rather than `clients/` even though a clients route
 * renders it: the data and the shape of it belong to this feature, and the
 * clients page composes it the same way a route file composes anything else.
 */
export function ClientPlansCard({ clientId, plans }: { clientId: string; plans: PlanListItem[] }) {
  const t = useTranslations('mealPlans');
  const format = useFormatter();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('title')}</CardTitle>

        <CardAction>
          {/*
           * Carries the client through, so the form on the other side arrives
           * with them already chosen rather than asking again.
           */}
          <Link
            href={{ pathname: '/app/meal-plans/new', query: { clientId } }}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            {t('new')}
          </Link>
        </CardAction>
      </CardHeader>

      <CardContent>
        {plans.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('emptyForClient')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {plans.map((plan) => (
              <li key={plan.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 first:pt-0 last:pb-0">
                <Link
                  href={`/app/meal-plans/${plan.id}`}
                  className="text-sm font-medium underline-offset-4 hover:underline"
                >
                  {plan.title}
                </Link>

                <span className="text-xs text-muted-foreground">
                  <span className="tabular-nums" dir="ltr">
                    {format.number(roundForDisplay('kcal', plan.kcal), 'integer')}
                  </span>{' '}
                  kcal · {format.dateTime(plan.updatedAt, 'date')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
