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
  /**
   * The value is words, not a number — a goal, an activity level, a blood type.
   *
   * It sits on the same baseline as every figure beside it and is set to *read*
   * at the same size, which is the entire reason this component exists. What it
   * drops is the three things that are only correct for digits: `dir="ltr"`,
   * `tabular-nums`, and the 20px itself — Arabic letterforms at 20px are
   * visibly larger than 20px digits. See the branch below for each.
   */
  textual?: boolean;
};

function StatTile({
  label,
  value,
  unit,
  note,
  flagged = false,
  emptyText,
  textual = false,
  className,
  ...props
}: StatTileProps) {
  const empty = value === null || value === undefined || value === '';

  return (
    <div
      data-slot="stat-tile"
      /*
       * Centred, because a lattice of readings is a table and a column of
       * left-hung stacks is not: with the label over the figure and both on the
       * cell's centre line, six tiles scan across as one row. It also stops the
       * unit — which sits after the figure — from dragging each reading's
       * optical centre a different distance off the label above it.
       */
      className={cn('flex min-w-0 flex-col items-center gap-1 bg-card px-4 py-3.5 text-center', className)}
      {...props}
    >
      {/*
        ⚠ **The label wraps; it does not truncate.**

        It was `truncate`, which on a two-up grid at a phone width cut the names
        of the readings themselves — at 320px inside the staff shell each tile is
        about 132px, and `مؤشر كتلة الجسم` lost 30px of its tail to an ellipsis
        while `الهدف اليومي` lost 5px. A reading whose *label* is unreadable is
        not a reading, and unlike a value there is no second place on the screen
        to go and check what it was called.

        The tiles sit in a hairline grid whose cells already stretch to the
        tallest of the row, so a label that takes two lines costs the row some
        height and costs the layout nothing. `text-balance` splits those two
        lines evenly rather than leaving one word alone underneath, and
        `wrap-anywhere` is the backstop for the one case wrapping cannot help
        with — a single token longer than the cell, which would otherwise push
        the grid wider than its column.
      */}
      <dt className="max-w-full text-label leading-snug text-balance wrap-anywhere text-muted-foreground">
        {label}
      </dt>

      <dd
        className={cn(
          /*
           * `heading-sm` (20px), not `heading-lg` (24px). 24px is the size the
           * client's own name is set at in the record header, and a height
           * reading has no business matching the person it belongs to.
           */
          'flex items-baseline justify-center gap-1 font-heading text-heading-sm font-semibold',
          empty ? 'text-muted-foreground' : flagged ? 'text-status-attention-fg' : 'text-foreground',
        )}
      >
        {empty ? (
          // At body size, not the figure's: an absence is not a reading, and
          // setting "—" at 24px gives a missing value the weight of a number.
          <span className="text-body-md font-normal">{emptyText ?? '—'}</span>
        ) : textual ? (
          /*
           * ⚠ **A worded value must not take the figure's `dir="ltr"`.** That
           * attribute exists to keep digits in order inside Arabic; put it on
           * 'زيادة الوزن' and it reverses the run. `<bdi>` isolates the value's
           * own direction instead, so an Arabic answer reads Arabic, an English
           * one reads English, and neither drags the tile with it.
           *
           * `tabular-nums` goes too, for the same reason it was ever there:
           * monospaced digits align a column of numbers, and there is no column
           * of numbers here — on letterforms it only opens the spacing up.
           *
           * ⚠ **`body-md`, and that is not a contradiction of the paragraph
           * above.** The point of this component is that every value in a grid
           * looks like it belongs to the same row — which is a statement about
           * *optical* size, not about the number in the CSS. Arabic set in
           * Almarai at 20px carries far more visual mass than tabular digits at
           * 20px: the digits are cap-height and nothing else, while ا، ل and د
           * run the full ascender and the descenders drop below the baseline. At
           * a matched 20px, 'زيادة الوزن' read about half again as large as
           * '180' sitting beside it, and the tile that was meant to equalise the
           * row was the thing unbalancing it.
           *
           * Two steps down is what makes them look level. Match the metric and
           * you mismatch the reading; this matches the reading.
           */
          <bdi className="max-w-full text-body-md text-balance wrap-anywhere">{value}</bdi>
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

      {/*
        `body-sm`, not `caption`. A note here says where a figure came from —
        "computed", "manual · computed 2,700" — which is the difference between
        a number you trust and one you check, and 12px is the size the design
        system reserves for text nobody needs.
      */}
      {note ? <p className="truncate text-body-sm text-muted-foreground">{note}</p> : null}
    </div>
  );
}

export { StatGrid, StatTile };
