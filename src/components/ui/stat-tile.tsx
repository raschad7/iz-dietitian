import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * A figure, its unit, and what it measures.
 *
 * **Every tile in a grid is the same size, and the figures share a baseline.**
 * That is the whole reason this exists. The nutrition tab was rendering numeric
 * facts at `text-heading-sm` with a 12px unit beside them, and non-numeric facts
 * in the same grid at `text-body-sm` — three type sizes on one row, so a reader
 * scanning down a column of measurements had nothing to scan along. A number is
 * a number wherever it appears; the tile is what guarantees it.
 *
 * `dl`/`dt`/`dd`, because these are label-value pairs and saying so is free.
 */
function StatGrid({
  columns = 3,
  className,
  ...props
}: React.ComponentProps<'dl'> & {
  /** Tiles per row from `sm` up. Below that it is always two. */
  columns?: 2 | 3 | 4 | 6;
}) {
  return (
    <dl
      data-slot="stat-grid"
      className={cn(
        /*
         * A hairline grid rather than gaps: the tiles are readings of one thing
         * and the rules are what make them a table you scan rather than six
         * cards you read. `overflow-hidden` on the rounded container clips the
         * cell fills to the radius, so no tile corner pokes out of it.
         */
        'grid gap-px overflow-hidden rounded-md bg-border',
        'grid-cols-2',
        {
          2: 'sm:grid-cols-2',
          3: 'sm:grid-cols-3',
          4: 'sm:grid-cols-2 md:grid-cols-4',
          6: 'sm:grid-cols-3 lg:grid-cols-6',
        }[columns],
        className,
      )}
      {...props}
    />
  );
}

type StatTileProps = Omit<React.ComponentProps<'div'>, 'children'> & {
  label: React.ReactNode;
  /** Rendered LTR and tabular. Null renders the tile as "not recorded". */
  value: React.ReactNode;
  /** kg, cm, kcal — set small beside the figure, never at its size. */
  unit?: React.ReactNode;
  /** Where the figure came from, or what it means: "manual", "overweight". */
  note?: React.ReactNode;
  /**
   * Marks a figure that needs looking at — a manual target far from the
   * computed one, a reading outside its band. Amber, because it is something to
   * check rather than something wrong; clay is reserved for medical facts.
   */
  flagged?: boolean;
  /** Shown in place of the figure when `value` is null. */
  emptyText?: React.ReactNode;
};

function StatTile({
  label,
  value,
  unit,
  note,
  flagged = false,
  emptyText,
  className,
  ...props
}: StatTileProps) {
  const empty = value === null || value === undefined || value === '';

  return (
    <div
      data-slot="stat-tile"
      className={cn('flex min-w-0 flex-col gap-1 bg-card px-4 py-3.5', className)}
      {...props}
    >
      <dt className="truncate text-label text-muted-foreground">{label}</dt>

      <dd
        className={cn(
          'flex items-baseline gap-1 font-heading text-heading-lg font-semibold',
          empty ? 'text-muted-foreground' : flagged ? 'text-status-attention-fg' : 'text-foreground',
        )}
      >
        {empty ? (
          // At body size, not the figure's: an absence is not a reading, and
          // setting "—" at 24px gives a missing value the weight of a number.
          <span className="text-body-md font-normal">{emptyText ?? '—'}</span>
        ) : (
          <>
            {/*
             * The figure is isolated LTR rather than the whole tile: digits keep
             * their internal order inside Arabic, while the label and note above
             * and below it stay in the page's direction. See "RTL" in
             * docs/design-system.md.
             */}
            <span dir="ltr" className="tabular-nums">
              {value}
            </span>
            {unit ? (
              <span className="text-body-sm font-normal text-muted-foreground">{unit}</span>
            ) : null}
          </>
        )}
      </dd>

      {note ? <p className="truncate text-caption text-muted-foreground">{note}</p> : null}
    </div>
  );
}

export { StatGrid, StatTile };
