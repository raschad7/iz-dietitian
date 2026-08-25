'use client';

import { Icon } from '@/components/ui/icon';

import type { BoardRow } from '../board-rows';
import { mealIconForSlot } from '../meal-icons';

import { AddSlot, RemoveSlot } from './day-column';

/**
 * One glyph per kind of meal.
 *
 * Keyed off the slot key's own meal type rather than off the label, so a
 * dietitian who renames "غداء" to "الوجبة الرئيسية" keeps the fork. A slot
 * added on the board stores the chosen type in its slot key; legacy `extra_N`
 * slots continue to resolve to lunch through `mealTypeForSlot`'s fallback.
 */
/**
 * The week's slots, as the board's row headers.
 *
 * This is the column that lets every meal card stop introducing itself. The
 * label and the time used to be printed on all thirty-five cards — the same
 * seven strings repeated down every column, above the dish name they were
 * competing with. Said once per row, they cost a fifth of a column and give the
 * cards their whole top edge back.
 *
 * It is **sticky at the inline-start**, which is what makes the week's sideways
 * scroll usable: seven columns do not fit most monitors, and scrolling to
 * Thursday with the slot names gone means counting rows to work out whether you
 * are looking at lunch or dinner. Together with the day headers' `top-0` this is
 * an ordinary frozen-header table, and the corner cell has to out-rank both.
 */
export function SlotRail({
  rows,
  editable,
}: {
  rows: readonly BoardRow[];
  editable: boolean;
}) {
  return (
    /* A subgrid spanning every row, exactly like a `DayColumn` — so the labels
       inherit the same tracks the cards do and can never drift out of step with
       them. `sticky` applies to the whole column rather than to each cell,
       because it spans the full template and travels as one. */
    <div className="planner-slot-rail sticky start-0 z-20 row-span-full grid w-20 grid-rows-subgrid bg-background md:w-24">
      {/*
        The corner, and the control that adds a row to the week.

        It was blank on the grounds that it sits above both axes and belongs to
        neither — which is true of anything *written* there and not of a control
        that acts on the rail itself. What it adds is a row, so the rail is
        where it goes, and the corner is the one cell of the rail that is not a
        row.

        It used to sit at the foot instead, which cost a 2.75rem track plus a
        gutter across all eight columns: 56px of board reserved for one button,
        held even after publishing so that hiding the control could not resize
        every meal row. In the corner it costs nothing at all — that cell exists
        either way — and it is at the top of the rail rather than below the fold
        of a board that scrolls.
      */}
      <div className="sticky top-0 z-10 grid min-w-0 place-items-center bg-background pb-1">
        {editable && <AddSlot rows={rows} />}
      </div>

      {rows.map((row, rowIndex) => (
        <div
          key={row.slotKey}
          className="planner-row-cell"
          data-first-row={rowIndex === 0 || undefined}
        >
          <div className="group/slot relative flex flex-col items-center justify-center gap-1 px-1.5 text-center">
            <Icon
              name={mealIconForSlot(row.slotKey)}
              className="size-8 text-muted-foreground md:size-9"
            />
            <span className="text-label leading-tight [text-wrap:balance]">{row.label}</span>
            {/* Latin digits inside Arabic keep their own direction. */}
            <span className="text-caption text-muted-foreground" dir="ltr">
              {row.timeOfDay}
            </span>

            {editable && <RemoveSlot row={row} />}
          </div>
        </div>
      ))}

    </div>
  );
}
