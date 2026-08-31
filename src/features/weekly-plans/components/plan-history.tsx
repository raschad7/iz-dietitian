import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
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
 * With that gone the list ships no client JavaScript at all: each row is a real
 * `<Link>` covering the whole entry, so it keeps keyboard focus, middle-click,
 * open-in-new-tab and a URL in the status bar.
 *
 * ## Why the rows are flush and not cards
 *
 * This list is only ever drawn inside the board's overflow panel, and it used to
 * be an outlined group of `listRow` cards in there — an outline inside a tinted
 * band inside a popup, three nested boxes deep, with the rows' own inline edge
 * disagreeing with everything above them. Flush entries with one rule between
 * them share the panel's edge, let the hover fill reach both sides, and leave
 * the panel as the only drawn box. Same information, one frame instead of
 * three.
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
    return <p className="px-3 text-caption text-muted-foreground">{t('noEarlierPlans')}</p>;
  }

  return (
    <ul className="divide-y divide-border/70">
      {plans.map((plan) => (
        <li key={plan.id}>
          {/* The whole entry is the target — a block link, rather than a card
              with a stretched `::after`, because there is no card left to
              stretch across. The focus ring is
              drawn inside the row — a negative offset — so it is not clipped by
              the scrolling panel's own overflow. */}
          <Link
            href={`/app/weekly-plans/${clientId}?planId=${plan.id}`}
            className="flex flex-col gap-0.5 px-3 py-2 transition-colors hover:bg-background focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-body-sm font-medium">{plan.weekStartDate}</span>

              {isMember(PLAN_STATUSES, plan.status) && (
                <Badge variant={plan.status === 'published' ? 'default' : 'muted'}>
                  {t(`status.${plan.status}`)}
                </Badge>
              )}
            </span>

            <span className="text-caption text-muted-foreground">
              {t('kcalValue', { value: plan.kcalTargetSnapshot })} ·{' '}
              {t('planMeals', { count: plan.mealCount })}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
