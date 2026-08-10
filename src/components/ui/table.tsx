import * as React from 'react';

import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

/**
 * The app's data table.
 *
 * Seven feature files were hand-rolling the same `<table>` markup with the
 * same padding, the same `bg-muted/50` head and the same hover row, which is
 * how a design system drifts. This is that markup, once.
 *
 * `TableRoot` owns only the scroll container: a wide table on a phone has to
 * scroll sideways, and that behaviour belongs on the frame rather than on the
 * table element, which cannot scroll its own overflow. It carries no card
 * framing of its own — no shadow, no ring, no fill — so the table reads as
 * part of the page it sits on. `TableHeader`'s `bg-muted` is the only surface
 * change the table makes; the body rows are plain, divided by the hairline on
 * `TableRow`.
 *
 * A long table can also scroll *vertically* inside that same frame: give
 * `TableRoot` a bounded height (`min-h-0 flex-1` inside a full-height column)
 * plus `overflow-y-auto`, and pass `sticky` to `TableHeader` so the column
 * names stay put while the rows move under them.
 *
 * Cells default to `text-start`, so they follow the document direction. Pass
 * `numeric` for anything that must stay LTR inside Arabic text — figures,
 * times, IDs and units read left-to-right in both scripts.
 */
function TableRoot({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="table-root" className={cn('w-full overflow-x-auto', className)} {...props} />;
}

/**
 * `border-separate` with zero spacing rather than `border-collapse`.
 *
 * The collapsed border model drops `border-radius` on every element inside the
 * table, which is what kept the header strip square. Separated borders restore
 * it, and with `border-spacing-0` the rows still sit flush: only `TableRow`
 * draws an edge, only on its block-start side, so there is nothing for the
 * collapsing model to have merged in the first place.
 */
function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <table
      data-slot="table"
      className={cn('w-full border-separate border-spacing-0 text-body-md', className)}
      {...props}
    />
  );
}

function TableHeader({
  className,
  sticky,
  ...props
}: React.ComponentProps<'thead'> & {
  /**
   * Pins the column names to the top of whatever scrolls the table.
   *
   * The rule targets the `th`s rather than the `thead`: a sticky `thead` is
   * still uneven ground across browsers, while a sticky cell is not. Each cell
   * has to carry its own `bg-muted` for the same reason — the fill declared on
   * `thead` is painted by `thead`, which stays where it was, so a header that
   * moved without it would have the rows scrolling straight through the words.
   */
  sticky?: boolean;
}) {
  return (
    <thead
      data-slot="table-header"
      className={cn(
        'bg-muted text-caption text-muted-foreground',
        /*
         * The strip takes the control radius on all four corners, and it takes
         * it on the end cells rather than on the `thead`: a table's fill is
         * painted per cell, so a radius on the group is clipped away by the
         * square cells sitting on top of it. Logical sides, so Arabic rounds
         * the same two ends without a mirrored rule.
         */
        '[&>tr>th:first-child]:rounded-s-[10px] [&>tr>th:last-child]:rounded-e-[10px]',
        sticky && '[&>tr>th]:sticky [&>tr>th]:top-0 [&>tr>th]:z-10 [&>tr>th]:bg-muted',
        className,
      )}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return <tbody data-slot="table-body" className={className} {...props} />;
}

type RowProps = {
  /**
   * Zebra striping — every other body row takes the sunken fill.
   *
   * A prop on the row rather than a `[&_tr:nth-child(even)]` rule on the table,
   * because a descendant selector would outrank `hover:` on specificity and
   * silently kill the hover state on every striped row. As two utilities on the
   * same element they tie, and Tailwind's variant order puts `even` before
   * `hover`, so the pointer still wins.
   */
  zebra?: boolean;
  /**
   * The row navigates somewhere as a whole.
   *
   * This only establishes the positioning context; the row is made clickable by
   * a real `<Link>` in one of its cells carrying `after:absolute after:inset-0`,
   * which stretches that link's hit area over the row. A link rather than an
   * `onClick` so the row keeps every affordance of a link — keyboard focus,
   * middle-click, open-in-new-tab, a status-bar URL — and the table stays a
   * server component. Any control that must stay separately clickable needs
   * `relative` so it sits above the stretched link.
   */
  linked?: boolean;
};

function TableRow({ className, zebra, linked, ...props }: React.ComponentProps<'tr'> & RowProps) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'border-t border-border transition-colors first:border-t-0',
        zebra && 'even:bg-muted',
        linked && 'relative cursor-pointer',
        'hover:bg-secondary/60 data-[selected=true]:bg-secondary',
        className,
      )}
      {...props}
    />
  );
}

type CellProps = {
  /**
   * Keeps the cell's content in LTR order and on tabular figures. Numbers,
   * times, phone numbers and IDs read left-to-right even inside Arabic.
   */
  numeric?: boolean;
};

/** Which way a sorted column runs. `false` means "sortable, but not the one in effect". */
type SortDirection = 'asc' | 'desc';

function TableHead({
  className,
  numeric,
  sorted,
  ...props
}: React.ComponentProps<'th'> &
  CellProps & {
    /**
     * Marks the column the table is currently ordered by. Sets `aria-sort`, so
     * a screen reader announces the order the sighted reader gets from the
     * chevron. Omit entirely on columns that cannot be sorted — `aria-sort`
     * on every header would claim they all can.
     */
    sorted?: SortDirection | false;
  }) {
  return (
    <th
      data-slot="table-head"
      scope="col"
      dir={numeric ? 'ltr' : undefined}
      aria-sort={sorted === undefined ? undefined : sorted === false ? 'none' : `${sorted}ending`}
      className={cn(
        'px-3 py-2.5 text-start font-medium',
        numeric && 'tabular',
        className,
      )}
      {...props}
    />
  );
}

/**
 * The contents of a sortable header: the label, plus the chevron saying which
 * way the column runs.
 *
 * Presentational on purpose — it does not know how sorting is expressed. The
 * caller wraps it in whatever navigates (this app puts a typed `<Link>` around
 * it so a sorted table is a shareable URL and the table ships no client
 * JavaScript), and `TableHead`'s `sorted` prop carries the same fact to
 * assistive technology.
 *
 * An unsorted column still shows a glyph, at low opacity: a column that only
 * reveals it can be sorted once you point at it is a column nobody discovers
 * on a touch screen.
 */
function TableSortLabel({
  direction,
  className,
  children,
  ...props
}: React.ComponentProps<'span'> & { direction?: SortDirection | false }) {
  return (
    <span
      data-slot="table-sort-label"
      className={cn(
        'inline-flex items-center gap-1 rounded-sm transition-colors',
        direction ? 'text-foreground' : 'hover:text-foreground',
        className,
      )}
      {...props}
    >
      {children}
      <Icon
        name={direction === 'asc' ? 'chevronUp' : direction === 'desc' ? 'chevronDown' : 'sort'}
        className={cn('size-3', !direction && 'opacity-40')}
      />
    </span>
  );
}

function TableCell({
  className,
  numeric,
  ...props
}: React.ComponentProps<'td'> & CellProps) {
  return (
    <td
      data-slot="table-cell"
      dir={numeric ? 'ltr' : undefined}
      className={cn('px-3 py-2.5 text-start', numeric && 'tabular', className)}
      {...props}
    />
  );
}

/** The row a table shows when it has nothing to show. */
function TableEmpty({
  colSpan,
  className,
  ...props
}: React.ComponentProps<'td'> & { colSpan: number }) {
  return (
    <tr>
      <td
        data-slot="table-empty"
        colSpan={colSpan}
        className={cn('px-3 py-10 text-center text-muted-foreground', className)}
        {...props}
      />
    </tr>
  );
}

export {
  TableRoot,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableSortLabel,
  TableCell,
  TableEmpty,
};
export type { SortDirection };
