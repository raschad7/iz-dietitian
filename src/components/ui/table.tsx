import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * The app's data table.
 *
 * Seven feature files were hand-rolling the same `<table>` markup with the
 * same padding, the same `bg-muted/50` head and the same hover row, which is
 * how a design system drifts. This is that markup, once.
 *
 * `TableRoot` owns the scroll container and the Arc: a wide table on a phone
 * has to scroll sideways, and the tail belongs on the frame rather than on the
 * table element, which cannot clip its own corners.
 *
 * Cells default to `text-start`, so they follow the document direction. Pass
 * `numeric` for anything that must stay LTR inside Arabic text — figures,
 * times, IDs and units read left-to-right in both scripts.
 */
function TableRoot({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="table-root"
      className={cn(
        'w-full overflow-x-auto rounded-lg rounded-ee-4xl bg-card shadow-card ring-1 ring-foreground/10',
        className,
      )}
      {...props}
    />
  );
}

function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <table
      data-slot="table"
      className={cn('w-full border-collapse text-body', className)}
      {...props}
    />
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return (
    <thead
      data-slot="table-header"
      className={cn('bg-muted text-caption text-muted-foreground', className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return <tbody data-slot="table-body" className={className} {...props} />;
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'border-t border-border transition-colors first:border-t-0',
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

function TableHead({
  className,
  numeric,
  ...props
}: React.ComponentProps<'th'> & CellProps) {
  return (
    <th
      data-slot="table-head"
      scope="col"
      dir={numeric ? 'ltr' : undefined}
      className={cn(
        'px-3 py-2.5 text-start font-medium',
        numeric && 'tabular',
        className,
      )}
      {...props}
    />
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

export { TableRoot, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmpty };
