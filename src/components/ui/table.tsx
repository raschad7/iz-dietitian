import * as React from 'react';

import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

/**
 * The app's data table — `@shadcn/table`, plus the parts this app needs that
 * the registry item has no answer for.
 *
 * Seven feature files were hand-rolling the same `<table>` markup with the
 * same padding, the same `bg-muted/50` head and the same hover row, which is
 * how a design system drifts. This is that markup, once.
 *
 * ## Where this deliberately differs from the registry item
 *
 * Everything here is the registry's structure, slot names and class vocabulary
 * unless one of these five reasons applies. Re-running `shadcn add table
 * --overwrite` would undo all five, so check this list before you do.
 *
 * 1. **`text-start`, never `text-left`.** The registry's `TableHead` hardcodes
 *    `text-left`, which flushes every column head to the left of an Arabic
 *    page while the values under them flush right. Logical properties are not
 *    optional in a bidirectional app.
 * 2. **No `"use client"`.** The registry ships the directive defensively; this
 *    file has no state, no effects and no handlers, and `ClientTable` is a
 *    server component whose whole point is shipping no JavaScript. Adding the
 *    directive would pull the register into the client bundle for nothing.
 * 3. **`TableRoot` is explicit, not folded into `Table`.** The registry wraps
 *    its own `<table>` in an unstyleable scroll container. Callers here have to
 *    style that container — a bounded height plus `overflow-y-auto` is what
 *    makes `TableHeader sticky` work — so the wrapper is a component you pass
 *    `className` to. It keeps the registry's `table-container` slot name.
 * 4. **`border-separate` and the rounded header strip.** See `Table` and
 *    `TableHeader` below; both are design-system decisions with their own
 *    reasons recorded there.
 * 5. **Five props the registry has no equivalent for** — `numeric`, `zebra`,
 *    `linked`, `sticky`, `sorted` — plus `TableSortLabel` and `TableEmpty`.
 *    Each is documented at its own definition.
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
 * and the `scrollY` prop, and pass `sticky` to `TableHeader` so the column
 * names stay put while the rows move under them.
 *
 * Cells default to `text-start`, so they follow the document direction. Pass
 * `numeric` for anything that must stay LTR inside Arabic text — figures,
 * times, IDs and units read left-to-right in both scripts.
 */
function TableRoot({
  className,
  scrollY,
  ...props
}: React.ComponentProps<'div'> & {
  /**
   * This frame bounds its own height, so it can grow a vertical scrollbar.
   *
   * Pair it with the height that bounds the frame — the prop cannot supply that
   * part, because where the ceiling comes from is the call site's business
   * (`min-h-0 flex-1` in a full-height column here, a declared maximum there).
   *
   * It says one thing the frame cannot say for itself, and the inline cue needs
   * it: a vertical bar takes its width out of the box the cue's masking wedges
   * are measured against but not out of the box its shadows are, and in Arabic
   * that gap is a grey edge down the side of the table. `q-scroll-cue-inset`
   * closes it; see the note under `.q-scroll-cue-inset` in `globals.css` for
   * why the correction moves the shadow rather than the wedge.
   *
   * `overflow-y-auto` rides along for the reader rather than for the browser:
   * `overflow-x: auto` already computes `overflow-y` from `visible` to `auto`,
   * so every one of these frames is a vertical scroll container whether or not
   * anyone asked. What decides if a bar appears is the height.
   */
  scrollY?: boolean;
}) {
  return (
    <div
      data-slot="table-container"
      /*
        `q-scroll-cue` is what tells a reader this table has more columns than
        the screen. Scrollbars are hidden app-wide, so a register on a phone
        showed its first four columns and looked like a table that did not have
        the rest; the cue is a shadow at whichever edge has content past it, and
        it paints nothing at all when the table fits. See its note in
        `globals.css`.
      */
      className={cn(
        'q-scroll-cue relative w-full overflow-x-auto',
        scrollY && 'q-scroll-cue-inset overflow-y-auto',
        className,
      )}
      {...props}
    />
  );
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
      className={cn(
        'w-full caption-bottom border-separate border-spacing-0 text-body-md',
        /*
         * No rule under the very last body row — the table ends there, and a
         * line under the last record draws a floor the table does not have.
         *
         * Declared on the table rather than as `last:` on the row, because a
         * table may have several `<tbody>`s (see `TableBody`'s `linked`) and
         * `tr:last-child` is true once per group. Only the final group's last
         * row is the bottom of the table; the rest are group boundaries and
         * should keep their rule.
         */
        '[&>tbody:last-of-type>tr:last-child>td]:border-b-0',
        className,
      )}
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
        /*
         * 14px, one step up from the 12px `--text-caption` this used to be.
         * A column name is not helper text: it is the label the whole column
         * is read against, and at caption size it sat below the muted phone
         * numbers underneath it — the quietest thing in the table naming the
         * loudest. It stays a step under the 16px body so the values still
         * lead, and `TableHead`'s `font-medium` does the rest.
         */
        'bg-muted text-body-sm text-muted-foreground',
        /*
         * The strip rounds its **block-start** corners only, and it takes them
         * on the end cells rather than on the `thead`: a table's fill is painted
         * per cell, so a radius on the group is clipped away by the square cells
         * sitting on top of it.
         *
         * Block-end square, because the strip does not end there — the first
         * body row begins. Rounding the bottom drew the header as a detached
         * capsule with the rows tucked under it, which is two shapes where the
         * table is one. `-ss-`/`-se-` are the logical corners, so Arabic rounds
         * the same visual pair without a mirrored rule.
         */
        '[&>tr>th:first-child]:rounded-ss-[10px] [&>tr>th:last-child]:rounded-se-[10px]',
        sticky && '[&>tr>th]:sticky [&>tr>th]:top-0 [&>tr>th]:z-10 [&>tr>th]:bg-muted',
        className,
      )}
      {...props}
    />
  );
}

function TableBody({
  className,
  linked,
  ...props
}: React.ComponentProps<'tbody'> & {
  /**
   * Groups several `<tr>`s into one visual row that hovers and navigates as a
   * unit — `linked` on `TableRow`, one level up.
   *
   * For a record whose second line has no column of its own: the dashboard's
   * register shows name, age and phone across three columns and hangs the next
   * visit under all three, which is a `colSpan` row and therefore a second
   * `<tr>`. Several `<tbody>`s in one table is valid, and it is the only
   * grouping the table model offers between the row and the whole body.
   *
   * The hover fill is declared here rather than on the rows so both light
   * together, and `relative` makes this the positioning context — so the
   * stretched `<Link>` in the first cell covers the second line too.
   */
  linked?: boolean;
}) {
  return (
    <tbody
      data-slot="table-body"
      className={cn(
        linked && 'relative cursor-pointer transition-colors hover:bg-accent/50',
        /*
         * The rows inside one group are one record, so only the group's last
         * row draws the rule that separates it from the record below. Without
         * this, the dashboard's register would draw a line between a client's
         * name and the next-visit line hanging under it.
         */
        linked && '[&>tr:not(:last-child)>td]:border-b-0',
        className,
      )}
      {...props}
    />
  );
}

/** The registry's footer row — a summary strip below the body. */
function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn('border-t border-border bg-muted font-medium', className)}
      {...props}
    />
  );
}

/**
 * The table's accessible caption. `Table` carries `caption-bottom`, so it
 * renders under the table however it is ordered in the markup.
 */
function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn('mt-4 text-body-sm text-muted-foreground', className)}
      {...props}
    />
  );
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
  /**
   * A row in a table you only read.
   *
   * Drops the hover fill. A table that answers the pointer is promising that
   * pointing at a row leads somewhere, and the clinic's opening hours lead
   * nowhere — the lit row would be a control that does nothing.
   *
   * `zebra` still works, and so does `data-selected`; this only turns off the
   * pointer affordance for rows that do not respond to the pointer.
   */
  plain?: boolean;
};

function TableRow({ className, zebra, linked, plain, ...props }: React.ComponentProps<'tr'> & RowProps) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        /*
         * ⚠ The rule is on the row's **cells**, not on the row.
         *
         * This said `border-t border-border` on the `<tr>` itself for a long
         * time and drew nothing at all: `Table` is `border-separate`, and in
         * the separated border model the spec has borders on rows, row groups,
         * columns and column groups *ignored outright* — only cells may draw
         * one. So the register had no rules between its rows and nobody could
         * see why the class was there. The app's own design guide already had
         * this right: `border-top: 1px solid` on `td`.
         *
         * If this ever moves back to `border-collapse`, the row-level version
         * starts working again and this becomes the wrong place for it.
         *
         * ## Why the rule is on the block-**end** edge
         *
         * A border follows the corner it runs into. The fills below round the
         * row's block-start corners, so a `border-t` came out of each rounded
         * corner as a curve, and every divider in the app drew as a line with a
         * little hook on both ends, stopping short of the table's edges. Nothing
         * was wrong with the radius or the colour — the rule was simply on the
         * rounded edge.
         *
         * The block-end edge is square, so `border-b` runs straight from one
         * side of the table to the other. Same hairline in the same place
         * between the same two rows; it just belongs to the row above now.
         */
        '[&>td]:border-b [&>td]:border-border',
        'transition-colors [&>td]:transition-colors',
        zebra && 'even:bg-muted',
        /*
         * `relative` is what the stretched `<Link>` in the first cell is
         * measured against — `after:absolute after:inset-0`, which fills the
         * row and makes the whole record clickable.
         *
         * ⚠ **`translate(0)` is not decoration, and removing it breaks Safari.**
         * WebKit does not honour `position: relative` on a table row: the row
         * is laid out where it always was, but it never becomes a containing
         * block, so every row's overlay measured itself against the next
         * positioned ancestor instead — `TableRoot`. Every record's link
         * covered the *entire table*, stacked one over another, and the last
         * one in the markup was the one on top: on an iPad, tapping any row in
         * the register or in Bills opened the last subscriber on the page,
         * whichever name had been tapped.
         *
         * A transformed element is a containing block for absolutely positioned
         * descendants, that rule has no table exception, and WebKit implements
         * it — so an identity transform buys the containing block that
         * `relative` was supposed to. `translate(0)` and not `translateZ(0)`:
         * the 3D spelling promotes every row to its own compositing layer, and
         * a register is thirty of them.
         *
         * It also makes each row a stacking context. Nothing here depends on
         * rows painting through one another, the sticky header cells carry
         * `z-10` and so still paint over them, and every menu, tooltip and
         * dialog inside a row is portalled out of it.
         */
        linked && 'relative cursor-pointer [transform:translate(0)]',
        /*
         * **No radius on a row fill.** It was a pill, then a pill open at the
         * bottom, and both were the same mistake: a rounded fill is a shape for
         * something detached — a chip, a card, a menu item — and a table row is
         * neither. It is one band in a stack of bands, running the full measure
         * of the table, and its edges are where the neighbouring rows begin
         * rather than free corners. Square, the fill lands exactly on the row
         * and the hairlines above and below it stay straight to both edges.
         *
         * The fills are still set on `[&>td]` rather than on the `<tr>`.
         * `Table` is `border-separate`, and in that model a row background
         * paints as a layer *behind* the cells, so anything a cell draws — a
         * status tint, a zebra stripe — would sit on top of it.
         */
        /*
         * `has-aria-expanded` is the registry's, and it earns its place here:
         * a row whose actions menu is open stays lit while the pointer is off
         * in the menu, so you can still see which record you are acting on.
         *
         * Both selection spellings are honoured — the registry writes
         * `data-state="selected"`, this app's own call sites write
         * `data-selected="true"`.
         */
        /*
         * The hover fill is `--accent` at half strength — the system's ambient
         * hover tint, lightened so the rule between the rows still reads
         * through it. It used to be `--secondary/60`, the olive brand fill,
         * which made pointing at a row look like selecting it: `data-[selected]`
         * below is that same olive at full strength, so hover and selection
         * differed only in opacity.
         */
        /*
         * A whisper, not a fill: `--accent` (n-200) at a quarter strength lands
         * around #F8F9FA on white — enough to follow the pointer down a long
         * register without any single row looking *selected*. Selection below is
         * the olive at full strength, and the gap between the two is the point.
         */
        !plain && 'hover:[&>td]:bg-accent/25 has-aria-expanded:[&>td]:bg-accent/25',
        'data-[selected=true]:[&>td]:bg-secondary data-[state=selected]:[&>td]:bg-secondary',
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
        /*
         * `text-start`, not the registry's `text-left` — see the divergence
         * list at the top of this file. `whitespace-nowrap` is the registry's:
         * a column head that wraps makes the header strip taller than the rows
         * it names. Cells deliberately do *not* inherit it (see `TableCell`).
         */
        'px-3 py-2.5 text-start align-middle font-medium whitespace-nowrap',
        '[&:has([role=checkbox])]:pe-0',
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
      /*
       * The registry puts `whitespace-nowrap` on cells as well as heads. It is
       * left off here: the widest column in this app is a person's name, and a
       * name that cannot wrap forces the table wider than the page instead of
       * being truncated by the cell that holds it.
       */
      className={cn(
        'px-3 py-2.5 text-start align-middle',
        '[&:has([role=checkbox])]:pe-0',
        numeric && 'tabular',
        className,
      )}
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
  TableFooter,
  TableRow,
  TableHead,
  TableSortLabel,
  TableCell,
  TableCaption,
  TableEmpty,
};
export type { SortDirection };
