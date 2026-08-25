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
  /** Where it currently sits, which is what a drop is measured against. */
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
  const [over, setOver] = useState(false);

  const drop = (event: DragEvent<HTMLTableCellElement>) => {
    event.preventDefault();
    setOver(false);

    const moved = event.dataTransfer.getData(DRAG_TYPE);
    if (moved && moved !== columnKey) onMove(moved as BillsColumnKey, index);
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
              setDragging(true);
            }
          : undefined
      }
      onDragEnd={draggable ? () => setDragging(false) : undefined}
      onDragOver={
        draggable
          ? (event) => {
              /* Without `preventDefault` the browser refuses the drop and shows
                 a "no entry" cursor over a target that would have accepted it. */
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              setOver(true);
            }
          : undefined
      }
      onDragLeave={draggable ? () => setOver(false) : undefined}
      onDrop={draggable ? drop : undefined}
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
        draggable && 'cursor-grab select-none',
        draggable && 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
        /* The heading being carried recedes; the one under the cursor shows the
           edge its neighbour would land against. */
        dragging && 'cursor-grabbing opacity-50',
        over && !dragging && 'border-s-2 border-s-primary',
      )}
      title={draggable ? label : undefined}
    >
      {label}
    </TableHead>
  );
}

/** The drag payload's type, shared by the handle and its drop targets. */
const DRAG_TYPE = 'text/x-bills-column';
