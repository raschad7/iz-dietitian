import { useFormatter, useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { StatGrid, StatTile } from '@/components/ui/stat-tile';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '@/components/ui/table';
import { formatMediumDate } from '@/features/booking/format';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { isMember } from '@/lib/enum';

import { PLAN_STATUSES } from '../schema';

/** What {@link import('../queries').listPlans} returns, which is all this card needs. */
type PlanSummary = {
  id: string;
  weekStartDate: string;
  status: string;
  updatedAt: Date;
  kcalTargetSnapshot: number;
  mealCount: number;
};

/**
 * One client's weeks: the live one, and everything before it.
 *
 * **Weekly plans are what this clinic actually produces**, and the tab showed
 * them as a column of linked dates with a badge — no sense of how full a week
 * was, what it was built against, or which one you were looking at. Its only
 * control was a link back to a board nobody had arrived from.
 *
 * The current week is a card you can read at a glance and act on; the history is
 * a real table, because `TableRoot` already draws one with zebra striping, whole
 * linked rows and sortable heads, and the hand-rolled `divide-y` list it
 * replaces had to reimplement each of those badly or go without.
 *
 * Lives in `weekly-plans/` rather than `clients/` even though a clients route
 * renders it: the data and the shape of it belong to this feature, and the
 * clients page composes it the way a route file composes anything else.
 */
export function ClientPlansCard({
  clientId,
  plans,
  slotsPerDay,
  locale,
}: {
  clientId: string;
  plans: PlanSummary[];
  /**
   * How many meals a full day holds for this client, from their own schedule.
   * The denominator of "how full is this week" — a client on three meals a day
   * has a complete week at 21, not at 35.
   */
  slotsPerDay: number;
  locale: Locale;
}) {
  const t = useTranslations('weeklyPlans');
  const format = useFormatter();

  // Newest week first is already the read's order (see `listPlans`), so the head
  // of the list *is* the current plan; everything after it is history.
  const [current, ...history] = plans;

  if (!current) {
    return (
      <EmptyState icon="mealPlans" title={t('noPlanYet')} description={t('noPlanHint')}>
        <Link
          href={`/app/weekly-plans/${clientId}`}
          className={buttonVariants({ variant: 'default' })}
        >
          <Icon name="weeklyPlans" />
          {t('openBoard')}
        </Link>
      </EmptyState>
    );
  }

  const expected = Math.max(slotsPerDay * 7, 1);
  const published = current.status === 'published';

  return (
    <div className="flex flex-col gap-4">
      {/*
        `tinted` for the live week only. The brand fill is what separates "the
        plan this client is eating from" from the rows of weeks behind it, and
        spending it on every card in the list would mean it marked nothing.
      */}
      <Card variant="tinted">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle icon="mealPlans" size="sm">
            {t('currentWeekOf', { date: formatMediumDate(locale, current.weekStartDate) })}
          </CardTitle>
          {isMember(PLAN_STATUSES, current.status) ? (
            <Badge variant={published ? 'onTrack' : 'muted'}>{t(`status.${current.status}`)}</Badge>
          ) : null}
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {/*
            Two tiles, not three. "Last edited" was a third, and a `StatTile`
            isolates its value LTR — correct for a figure, wrong for a formatted
            date, which reorders as "2026 أغسطس 7". It is a caption under the
            controls now, which is what a timestamp is anyway.
          */}
          <StatGrid columns={2}>
            <StatTile
              label={t('mealsFilled')}
              value={`${current.mealCount} / ${expected}`}
              note={t('ofWeek')}
            />
            <StatTile
              label={t('kcalTarget')}
              value={current.kcalTargetSnapshot}
              unit="kcal"
              note={t('snapshotNote')}
            />
          </StatGrid>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/app/weekly-plans/${clientId}`}
              className={buttonVariants({ variant: 'default', size: 'sm' })}
            >
              <Icon name="weeklyPlans" />
              {t('openBoard')}
            </Link>
            {/*
              `neutral`, not `outline`: exactly one control in this row is the
              action, and a second olive label would say "act on me" twice.
            */}
            <Link
              href={{ pathname: `/app/weekly-plans/${clientId}`, query: { planId: current.id } }}
              className={buttonVariants({ variant: 'neutral', size: 'sm' })}
            >
              <Icon name="history" />
              {t('openThisWeek')}
            </Link>

            <span className="text-body-sm text-muted-foreground">
              {t('lastEdited')} {format.dateTime(current.updatedAt, 'date')}
            </span>
          </div>
        </CardContent>
      </Card>

      {history.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle icon="history" size="sm">
              {t('history')}
            </CardTitle>
          </CardHeader>

          <CardContent>
            <TableRoot>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('columns.week')}</TableHead>
                    <TableHead>{t('columns.status')}</TableHead>
                    <TableHead>{t('columns.meals')}</TableHead>
                    <TableHead>{t('columns.target')}</TableHead>
                    <TableHead>{t('columns.updated')}</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {history.map((plan) => (
                    <TableRow key={plan.id} zebra linked>
                      <TableCell>
                        {/*
                          `?planId=` rather than a route of its own: the board is
                          always mounted against a client, and picking a week is
                          a selection within it — the same link its own history
                          dropdown builds. `after:inset-0` is what stretches this
                          link over the whole row; see `linked` on TableRow.
                        */}
                        <Link
                          href={{
                            pathname: `/app/weekly-plans/${clientId}`,
                            query: { planId: plan.id },
                          }}
                          className="font-medium underline-offset-4 after:absolute after:inset-0 hover:underline"
                        >
                          {t('weekOf', { date: formatMediumDate(locale, plan.weekStartDate) })}
                        </Link>
                      </TableCell>

                      <TableCell>
                        {isMember(PLAN_STATUSES, plan.status) ? (
                          <Badge variant={plan.status === 'published' ? 'onTrack' : 'muted'}>
                            {t(`status.${plan.status}`)}
                          </Badge>
                        ) : null}
                      </TableCell>

                      <TableCell numeric>
                        {plan.mealCount} / {expected}
                      </TableCell>
                      <TableCell numeric>{plan.kcalTargetSnapshot}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {format.dateTime(plan.updatedAt, 'date')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableRoot>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
