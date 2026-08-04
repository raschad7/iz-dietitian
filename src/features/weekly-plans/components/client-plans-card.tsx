import { useFormatter, useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { isMember } from '@/lib/enum';

import { PLAN_STATUSES } from '../schema';

/** What {@link import('../queries').listPlans} returns, which is all this card needs. */
type PlanSummary = {
  id: string;
  weekStartDate: string;
  status: string;
  updatedAt: Date;
};

/**
 * One client's recent weeks, rendered on their profile.
 *
 * Lives in `weekly-plans/` rather than `clients/` even though a clients route
 * renders it: the data and the shape of it belong to this feature, and the
 * clients page composes it the same way a route file composes anything else.
 * Replaces the V1 card of the same name, which listed hand-built meal plans.
 *
 * A week, not a title. V1 plans were named by the dietitian because they were
 * undated templates and nothing else distinguished one from another; a weekly
 * plan is identified by the week it covers, so that is what is shown.
 */
export function ClientPlansCard({ clientId, plans }: { clientId: string; plans: PlanSummary[] }) {
  const t = useTranslations('weeklyPlans');

  // Newest week first is already the read's order (see `listPlans`), so the
  // head of the list *is* the current plan; everything after it is history.
  const [current, ...history] = plans;

  return (
    <Card>
      <CardHeader>
        <CardTitle icon="mealPlans" className="text-base">
          {t('title')}
        </CardTitle>

        <CardAction>
          <Link
            href={`/app/weekly-plans/${clientId}`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            {t('backToBoard')}
          </Link>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-4">
        {!current ? (
          <p className="text-sm text-muted-foreground">{t('noPlanYet')}</p>
        ) : (
          <>
            <div className="space-y-1.5">
              <p className="text-caption text-muted-foreground">{t('current')}</p>
              <PlanRow clientId={clientId} plan={current} />
            </div>

            {history.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-caption text-muted-foreground">{t('history')}</p>
                <ul className="divide-y divide-border">
                  {history.map((plan) => (
                    <li key={plan.id} className="py-2 first:pt-0 last:pb-0">
                      <PlanRow clientId={clientId} plan={plan} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PlanRow({ clientId, plan }: { clientId: string; plan: PlanSummary }) {
  const t = useTranslations('weeklyPlans');
  const format = useFormatter();

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      {/*
       * `?planId=` rather than a route of its own: the board is always
       * mounted against a client, and picking a week is a selection
       * within it — the same link its own history dropdown builds.
       */}
      <Link
        href={{ pathname: `/app/weekly-plans/${clientId}`, query: { planId: plan.id } }}
        className="text-sm font-medium underline-offset-4 hover:underline"
      >
        {t('weekOf', { date: format.dateTime(new Date(plan.weekStartDate), 'date') })}
      </Link>

      <span className="flex items-baseline gap-2 text-caption text-muted-foreground">
        {isMember(PLAN_STATUSES, plan.status) && (
          <Badge variant={plan.status === 'published' ? 'default' : 'muted'}>{t(`status.${plan.status}`)}</Badge>
        )}
        {format.dateTime(plan.updatedAt, 'date')}
      </span>
    </div>
  );
}
