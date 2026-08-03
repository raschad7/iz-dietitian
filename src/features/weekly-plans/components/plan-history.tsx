'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { isMember } from '@/lib/enum';

import { startWeekFromPlanAction } from '../editor-actions';
import { initialNewWeekState } from '../form-state';
import { PLAN_STATUSES } from '../schema';

export type PlanSummary = {
  id: string;
  weekStartDate: string;
  status: string;
  kcalTargetSnapshot: number;
  mealCount: number;
};

/**
 * The client's earlier weeks.
 *
 * Every plan, not only the ones the header pills have room for — the pills switch
 * between recent weeks, this is the record. Each row carries the target it was
 * built against, because "what were last week's numbers" is one of the two
 * questions that sends a dietitian looking backwards; the other is "what dishes
 * have they already had", which the board's compare view answers.
 */
export function PlanHistory({
  plans,
  clientId,
  currentPlanId,
  nextWeekStartDate,
  locale,
}: {
  plans: readonly PlanSummary[];
  clientId: string;
  currentPlanId: string | null;
  nextWeekStartDate: string;
  locale: string;
}) {
  const t = useTranslations('weeklyPlans');

  if (!plans.length) {
    return <p className="text-xs text-muted-foreground">{t('noEarlierPlans')}</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {plans.map((plan) => (
        <li key={plan.id} className="rounded-md border border-border p-2.5 text-xs">
          <div className="flex items-baseline justify-between gap-2">
            <Link
              href={`/app/weekly-plans/${clientId}?planId=${plan.id}`}
              className="font-semibold text-primary underline-offset-2 hover:underline"
            >
              {plan.weekStartDate}
            </Link>

            {isMember(PLAN_STATUSES, plan.status) && (
              <Badge variant={plan.status === 'published' ? 'default' : 'muted'}>
                {t(`status.${plan.status}`)}
              </Badge>
            )}
          </div>

          <p className="mt-1 text-muted-foreground">
            {t('kcalValue', { value: plan.kcalTargetSnapshot })} ·{' '}
            {t('planMeals', { count: plan.mealCount })}
          </p>

          {/* No copy button on the plan already open: copying a week into itself is
              not something anyone means to do. */}
          {plan.id !== currentPlanId && (
            <CopyForm
              clientId={clientId}
              sourcePlanId={plan.id}
              weekStartDate={nextWeekStartDate}
              locale={locale}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

function CopyForm({
  clientId,
  sourcePlanId,
  weekStartDate,
  locale,
}: {
  clientId: string;
  sourcePlanId: string;
  weekStartDate: string;
  locale: string;
}) {
  const t = useTranslations('weeklyPlans');
  const [state, formAction] = useActionState(startWeekFromPlanAction, initialNewWeekState);

  return (
    <form action={formAction} className="mt-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="sourcePlanId" value={sourcePlanId} />
      <input type="hidden" name="weekStartDate" value={weekStartDate} />

      <CopySubmit label={t('copyIntoWeek', { date: weekStartDate })} />

      {state.status === 'error' && (
        <p className="mt-1 text-destructive">{t(state.messageKey)}</p>
      )}
    </form>
  );
}

function CopySubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="sm" variant="outline" className="w-full" disabled={pending}>
      {label}
    </Button>
  );
}
