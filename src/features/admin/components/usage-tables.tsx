import { getTranslations } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '@/components/ui/table';
import type { Locale } from '@/i18n/routing';
import { formatDateTime, formatNumber } from '@/lib/format';

import type { ClinicUsage, KeyedUsage } from '../ai-usage';
import type { GenerationFailure } from '../queries';
import { formatCost, formatDuration, formatTokens } from '../format';

/**
 * The three tables under the tiles: who is spending, on what model, and on
 * which kind of call — plus the short list of what has been failing.
 *
 * Every one of them is wrapped in `TableRoot`, which owns the horizontal scroll.
 * These are six-column tables of numbers and they do not fit a phone; the
 * product's rule for that is an internal scroller rather than a clipped table
 * or a page that scrolls sideways, and `TableRoot` is where it lives.
 */

const NO_VALUE = '—';

/** The numeric columns every one of these tables ends with. */
async function UsageCells({ totals, locale }: { totals: ClinicUsage | KeyedUsage; locale: Locale }) {
  const cost = formatCost(locale, totals.costMicroUsd);
  const median = formatDuration(locale, totals.medianDurationMs);

  return (
    <>
      <TableCell className="tabular-nums">{formatNumber(locale, totals.runs)}</TableCell>
      <TableCell className="tabular-nums">
        {totals.failed > 0 ? formatNumber(locale, totals.failed) : NO_VALUE}
      </TableCell>
      <TableCell className="tabular-nums">
        {formatTokens(locale, totals.promptTokens + totals.completionTokens)}
      </TableCell>
      <TableCell className="tabular-nums">{median ?? NO_VALUE}</TableCell>
      {/*
        The cost cell carries the caveat rather than the page footer, because
        "which of these numbers is incomplete" is a per-row fact. A clinic on a
        rated model sits beside one on an unrated model, and only the second is
        a floor.
      */}
      <TableCell className="tabular-nums">
        {totals.unpricedRuns > 0 && totals.costMicroUsd === 0 ? NO_VALUE : (cost ?? NO_VALUE)}
      </TableCell>
    </>
  );
}

async function NumericHeadings() {
  const t = await getTranslations('admin.ai.columns');

  return (
    <>
      <TableHead>{t('runs')}</TableHead>
      <TableHead>{t('failed')}</TableHead>
      <TableHead>{t('tokens')}</TableHead>
      <TableHead>{t('median')}</TableHead>
      <TableHead>{t('cost')}</TableHead>
    </>
  );
}

export async function ClinicUsageTable({ rows, locale }: { rows: ClinicUsage[]; locale: Locale }) {
  const t = await getTranslations('admin.ai');

  return (
    <TableRoot>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('columns.clinic')}</TableHead>
            <NumericHeadings />
            <TableHead>{t('columns.lastRun')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableEmpty colSpan={7}>{t('empty')}</TableEmpty>
          ) : (
            rows.map((row) => (
              <TableRow key={row.clinicId}>
                <TableCell className="font-medium">{row.clinicName}</TableCell>
                <UsageCells totals={row} locale={locale} />
                <TableCell className="text-muted-foreground">
                  {row.lastRunAt ? formatDateTime(locale, row.lastRunAt) : NO_VALUE}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableRoot>
  );
}

/**
 * The model and scope breakdowns, which are the same table twice.
 *
 * `labelFor` is passed in rather than branched on inside, because a scope is a
 * closed set with translations (`week`, `day`, `meal`, `review`) and a model is
 * a free-text name that must be printed exactly as the provider returned it —
 * translating one and not the other is the whole difference between them.
 */
export async function KeyedUsageTable({
  rows,
  locale,
  heading,
  labelFor,
}: {
  rows: KeyedUsage[];
  locale: Locale;
  heading: string;
  labelFor?: (key: string) => string;
}) {
  const t = await getTranslations('admin.ai');

  return (
    <TableRoot>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{heading}</TableHead>
            <NumericHeadings />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableEmpty colSpan={6}>{t('empty')}</TableEmpty>
          ) : (
            rows.map((row) => (
              <TableRow key={row.key}>
                <TableCell className="font-medium">{labelFor ? labelFor(row.key) : row.key}</TableCell>
                <UsageCells totals={row} locale={locale} />
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableRoot>
  );
}

/**
 * What has been going wrong, newest first.
 *
 * The provider's own message is the useful part — "OpenAI stopped before
 * finishing the plan", a 429, a socket hang-up all call for different actions —
 * so the column is wide and the text is not truncated by CSS. It is already
 * bounded at 1,000 characters where it is written.
 *
 * ⚠ **No heading of its own.** It renders inside `UsageBreakdown`, where the tab
 * is the heading; an `<h2>` here would name the panel twice and put a second
 * outline level inside a tablist. The description stays — it says what the error
 * column is, which the tab's one word cannot.
 */
export async function FailuresTable({ rows, locale }: { rows: GenerationFailure[]; locale: Locale }) {
  const t = await getTranslations('admin.ai');

  if (rows.length === 0) return null;

  return (
    <section className="space-y-2">
      <p className="text-body-sm text-muted-foreground">{t('failures.description')}</p>

      <TableRoot>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('columns.clinic')}</TableHead>
              <TableHead>{t('columns.scope')}</TableHead>
              <TableHead>{t('columns.model')}</TableHead>
              <TableHead>{t('columns.error')}</TableHead>
              <TableHead>{t('columns.when')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={`${row.createdAt.toISOString()}-${index}`}>
                <TableCell className="font-medium">{row.clinicName}</TableCell>
                <TableCell>
                  <Badge variant="outline">{t(`scopes.${row.scope}` as 'scopes.week')}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{row.model}</TableCell>
                <TableCell className="max-w-md text-muted-foreground">{row.error ?? NO_VALUE}</TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {formatDateTime(locale, row.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableRoot>
    </section>
  );
}
