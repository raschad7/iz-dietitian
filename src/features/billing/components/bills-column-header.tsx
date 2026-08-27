'use client';

import { useState, type DragEvent } from 'react';

import { TableHead } from '@/components/ui/table';
import { cn } from '@/lib/utils';

import type { BillsColumnKey } from './bills-columns';
import { useFinePointer } from './use-fine-pointer';

/**
 * A Bills column heading that can be dragged to another position.
 *
 * ## Desktop only, and checked rather than assumed
 *
 * The grip, the cursor and every drag handler are attached only where
 * `(pointer: fine)` says there is a mouse — see `useFinePointer`. On a touch
 * screen the heading is an ordinary `TableHead`: `dragstart` never fires there,
 * so the affordance would be a lie, and a draggable element across the widest
 * part of the table would fight the browser's own touch scrolling.
 *
 * ## The keyboard is not left behind
 *
 * Drag-and-drop is unreachable without a pointer, so the same move is on the
 * keyboard: focus a heading and press Ctrl (or ⌘) with an arrow key to walk the
 * column one place along. Ctrl, because a bare arrow key inside a table is how
 * a screen reader moves between cells, and taking that over would break reading
 * the table in order to allow rearranging it.
 *
 * `start`/`end` rather than left/right: the arrow that means "earlier in the
 * reading order" is the left one in English and the right one in Arabic, and a
 * reader of either presses the key that points the way they read.
 *
 * ## Why the header row and not a settings panel
 *
 * The heading *is* the column. Dragging the thing you want to move is the whole
 * gesture, and a dialog listing seven column names with up and down arrows is a
 * second place to learn, for the same result.
 */
export function BillsColumnHeader({
  columnKey,
  /** Where it currently sits, which is what a move is measured against. */
  index,
  label,
  numeric,
  rtl,
  onMove,
}: {
  columnKey: BillsColumnKey;
  index: number;
  label: string;
  numeric: boolean;
  rtl: boolean;
  onMove: (key: BillsColumnKey, to: number) => void;
}) {
  const draggable = useFinePointer();
  const [dragging, setDragging] = useState(false);

  /*
    The move happens as the heading is crossed, not when it is let go of.

    Dragging Debt onto Remaining swaps the two there and then — `onMove`
    writes the new order and the table redraws from it. What the reader is
    dragging over is therefore always the table they will get, so the drop
    confirms an arrangement they have already seen rather than promising one
    they have to wait for.

    This is why there is no insertion line. A thin rule between two headings is
    a *description* of where the column would land, and it was describing
    something the table can simply show.
  */
  const crossed = (event: DragEvent<HTMLTableCellElement>) => {
    /* Without `preventDefault` the browser refuses the drop and shows a
       "no entry" cursor over a target that would have accepted it. */
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    /*
      `dataTransfer.getData` is deliberately empty during a drag — only `drop`
      may read the payload, so that a page cannot snoop on what is being dragged
      across it. The key is therefore kept beside the drag instead. It is a
      module-level value rather than state because nothing renders from it: it
      is read by whichever heading the pointer is over, which is never the one
      holding it.
    */
    if (!carried || carried === columnKey) return;

    /* `move` already returns early when the column is where it is being sent,
       so crossing the same heading twice costs nothing. */
    onMove(carried, index);
  };

  return (
    <TableHead
      numeric={numeric}
      /*
        `draggable` and its handlers are only ever set on a pointer device.
        Attaching them unconditionally would leave dead listeners on a phone and
        an element the browser thinks is draggable when it is not.
      */
      draggable={draggable || undefined}
      tabIndex={draggable ? 0 : undefined}
      onDragStart={
        draggable
          ? (event) => {
              /*
                A custom type, not `text/plain`: a plain-text payload is
                something any other drop target on the page will accept, and a
                column name landing in the search box is not a feature.
              */
              event.dataTransfer.setData(DRAG_TYPE, columnKey);
              event.dataTransfer.effectAllowed = 'move';
              carried = columnKey;
              setDragging(true);
            }
          : undefined
      }
      onDragEnd={
        draggable
          ? () => {
              setDragging(false);
              carried = null;
            }
          : undefined
      }
      onDragOver={draggable ? crossed : undefined}
      /*
        The column is already where it was dragged to, so a drop has nothing
        left to do but accept the gesture — without this the browser animates
        the heading flying back to where it started, over a table that has
        already moved on.
      */
      onDrop={draggable ? (event) => event.preventDefault() : undefined}
      onKeyDown={
        draggable
          ? (event) => {
              if (!event.ctrlKey && !event.metaKey) return;

              const back = rtl ? 'ArrowRight' : 'ArrowLeft';
              const forward = rtl ? 'ArrowLeft' : 'ArrowRight';

              if (event.key === back) {
                event.preventDefault();
                onMove(columnKey, index - 1);
              } else if (event.key === forward) {
                event.preventDefault();
                onMove(columnKey, index + 1);
              }
            }
          : undefined
      }
      className={cn(
        /*
           Centred, because the table is laid out on equal fixed shares: a
           heading anchored to the start edge of a column wider than the word
           in it drifts away from the figures it names.

           Full name is the exception, and it follows its column rather than
           the rule: the names under it are aligned to the start so they read
           as one edge, and a heading centred over a start-aligned column is a
           label floating away from the thing it labels.
         */        columnKey === 'name' ? 'text-start' : 'text-center',
        draggable && 'cursor-grab select-none',
        draggable && 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
        /* The heading being carried recedes, the way something lifted off a
           surface does. */
        dragging && 'cursor-grabbing opacity-50',
      )}
      title={draggable ? label : undefined}
    >
      {label}
    </TableHead>
  );
}

/** The drag payload's type, shared by the handle and its drop targets. */
const DRAG_TYPE = 'text/x-bills-column';

/**
 * The column currently being dragged, for as long as it is in the air.
 *
 * A module-level value, because `dataTransfer` cannot be read until the drop
 * and this has to be known on every `dragover` before then. Nothing renders
 * from it, so it is not state: the heading being crossed reads it to ask "what
 * is being brought to me", and the answer changing does not change how anything
 * looks — the reorder that follows is driven by the order, not by this.
 *
 * One drag exists at a time in a browser, so one value is enough. It is cleared
 * on `dragend`, which fires whether the drag was dropped or abandoned.
 */
let carried: BillsColumnKey | null = null;
