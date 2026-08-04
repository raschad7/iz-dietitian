import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { isMember } from '@/lib/enum';

import { PLAN_STATUSES } from '../schema';

export type PlanSummary = {
  id: string;
  weekStartDate: string;
  status: string;
  kcalTargetSnapshot: number;
  mealCount: number;
};

/**
 * The client's earlier weeks — a record to read, not a place to act.
 *
 * Every row used to carry its own copy button, back when copying a week was
 * something the new-week menu could only offer for a single plan. The dialog
 * offers all of them now, so a button per row here would be a second way to do
 * one thing, in the panel least likely to be open when someone wants it.
 *
 * With that gone the tab ships no client JavaScript at all: each row is a real
 * `<Link>` stretched over the card, so it keeps keyboard focus, middle-click,
 * open-in-new-tab and a URL in the status bar — the same `linked` pattern the
 * tables use.
 *
 * Each row keeps the target the week was built against, because "what were last
 * week's numbers" is one of the two questions that sends a dietitian looking
 * backwards; the other is "what dishes have they already had", which the board's
 * compare view answers.
 */
export function PlanHistory({
  plans,
  clientId,
}: {
  plans: readonly PlanSummary[];
  clientId: string;
}) {
  const t = useTranslations('weeklyPlans');

  if (!plans.length) {
    return <p className="text-caption text-muted-foreground">{t('noEarlierPlans')}</p>;
  }

  return (
    // The group owns the outline and the tail; the rows are square between
    // themselves, and `listRow` restores the sweep on the last one.
    <ul className="rounded-lg border border-border">
      {plans.map((plan) => (
        <li key={plan.id}>
          <Card variant="listRow" size="sm" className="px-3 transition-colors hover:bg-secondary/60">
            <CardHeader>
              <CardTitle className="text-body-sm">
                {/*
                  The whole card is the target. `after:inset-0` stretches this
                  link over the card, which is already the positioning context —
                  `Card` carries `relative` on its base class. Anything else in
                  the row that had to stay clickable would need `relative`; the
                  badge is text, so nothing does.
                */}
                <Link
                  href={`/app/weekly-plans/${clientId}?planId=${plan.id}`}
                  className="after:absolute after:inset-0"
                >
                  {plan.weekStartDate}
                </Link>
              </CardTitle>

              {isMember(PLAN_STATUSES, plan.status) && (
                <CardAction>
                  <Badge variant={plan.status === 'published' ? 'default' : 'muted'}>
                    {t(`status.${plan.status}`)}
                  </Badge>
                </CardAction>
              )}
            </CardHeader>

            <CardContent className="text-caption text-muted-foreground">
              {t('kcalValue', { value: plan.kcalTargetSnapshot })} ·{' '}
              {t('planMeals', { count: plan.mealCount })}
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
