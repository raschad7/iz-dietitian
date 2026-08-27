'use client';

import { useTranslations } from 'next-intl';

import { TableHead, TableRow } from '@/components/ui/table';
import { getLocaleDirection, type Locale } from '@/i18n/routing';

import { BillsColumnHeader } from './bills-column-header';
import { useBillsColumns } from './use-bills-columns';

/**
 * The Bills table's header row.
 *
 * Its own client component for one reason: the columns can be reordered, the
 * order lives in this browser, and the header is where it is changed. The table
 * around it stays on the server — only the header and the record rows need to
 * read the order, and they read it from the same hook so they cannot disagree
 * about which column is which.
 *
 * No heading carries `sorted`, deliberately. Every money column is summed after
 * the page of subscribers has been chosen, so ordering by one would mean
 * folding both aggregates into the paged query's `ORDER BY` — which breaks the
 * `LIMIT` and the pager's `count()` together. `sorted={false}` would be worse
 * than nothing: it sets `aria-sort="none"`, telling a screen reader the column
 * *can* be sorted.
 *
 * Reordering is not sorting, and does not have that problem: it moves a column
 * without asking the database anything.
 */
export function BillsHeaderRow({ locale }: { locale: Locale }) {
  const t = useTranslations('billing');
  const { columns, move } = useBillsColumns();

  const rtl = getLocaleDirection(locale) === 'rtl';

  return (
    <TableRow>
      {columns.map((column, index) => (
        <BillsColumnHeader
          key={column.key}
          columnKey={column.key}
          index={index}
          label={t(`fields.${column.key}`)}
          numeric={column.numeric}
          rtl={rtl}
          onMove={move}
        />
      ))}

      {/*
        The action column's head carries no visible words — a column of icons
        does not need naming above it — but it is not empty either: a `<th>`
        with nothing in it is announced as a blank column. `sr-only` gives it a
        name for a screen reader and no width on screen. Not a
        `BillsColumnHeader`, because it does not move: see `COLUMN_COUNT`.
      */}
      <TableHead className="text-end">
        <span className="sr-only">{t('fields.actions')}</span>
      </TableHead>
    </TableRow>
  );
}
