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
  summaryAr: string | null;
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
  const tClients = useTranslations('clients');
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
            The model's notes on this week, above the figures.

            It used to be a paragraph describing the plan — "a varied week of
            Palestinian home dishes with different starches" — which is a caption
            for something the dietitian is already looking at. It is a short list
            of things to *act on* now: what to confirm with the client, where the
            week is likely to fail, what the instruction made impossible.

            Rendered as a list because that is what it is. Each line arrives
            prefixed with "- " and the bullet is drawn rather than printed, so a
            model that forgets the dash still produces a readable row.

            Shown in Arabic in both locales, as the meal rationale already is: it
            is the model's own writing about this client's week, and translating
            it would mean generating a second version that could disagree with the
            first. A week built by hand has none, and shows none.
          */}
          <PlanNotes text={current.summaryAr} label={t('planNotes')} />

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
              // Was the literal string "kcal", which no locale could reach —
              // the one unit in the app that was never translated.
              unit={tClients('units.kcal')}
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
                        {/*
                          Under the date rather than in a column of its own: it is
                          two or three sentences, and a sixth column would either
                          squeeze the table or wrap into unreadable slivers. Two
                          lines is enough to tell one week from another, which is
                          the whole job.
                        */}
                        {plan.summaryAr ? (
                          <span className="mt-0.5 line-clamp-2 block text-caption font-normal text-muted-foreground">
                            {plan.summaryAr}
                          </span>
                        ) : null}
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

/**
 * The model's notes on a week, as the short list they are.
 *
 * ## Why it parses rather than prints
 *
 * The notes arrive as one text column — the same `summary_ar` that used to hold
 * a paragraph — with each note on its own line behind a `- `. Splitting them
 * here rather than storing them apart keeps the change to one prompt and one
 * renderer, and it means a plan written before the change still renders: a
 * single paragraph with no dashes comes back as one row, which is exactly what
 * it is.
 *
 * The dash is stripped and the bullet is drawn, so a model that forgets the
 * prefix produces the same list as one that remembers, and neither produces a
 * line beginning with a stray hyphen.
 */
function PlanNotes({ text, label }: { text: string | null; label: string }) {
  const notes = (text ?? '')
    .split('\n')
    .map((line) => line.replace(/^\s*[-–—•*]\s*/, '').trim())
    .filter(Boolean);

  if (notes.length === 0) return null;

  return (
    <section>
      <h4 className="pb-1.5 text-caption font-semibold text-muted-foreground">{label}</h4>
      <ul className="flex flex-col gap-1.5">
        {notes.map((note) => (
          <li
            key={note}
            /* `ps-4` with the marker absolutely placed at the inline start, so
               the second line of a wrapped note aligns under the first rather
               than under the bullet — and it mirrors with the locale, which a
               `list-disc` marker in a mixed-direction column does not. */
            className="relative ps-4 text-body-sm leading-relaxed text-muted-foreground"
            dir="auto"
          >
            <span
              aria-hidden
              className="absolute start-0 top-[0.55em] size-1.5 rounded-full bg-border"
            />
            {note}
          </li>
        ))}
      </ul>
    </section>
  );
}
