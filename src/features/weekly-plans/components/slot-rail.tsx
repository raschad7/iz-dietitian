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
    <div className="sticky start-0 z-20 row-span-full grid w-20 grid-rows-subgrid bg-background md:w-24">
      {/* The corner. Blank, and deliberately so: it sits above both the day
          names and the slot labels, and anything written in it would belong to
          neither axis. */}
      <div className="sticky top-0 z-10 border-b border-border bg-background" />

      {rows.map((row) => (
        <div key={row.slotKey} className="planner-row-cell">
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

      {/* The add control lives on this axis, because what it adds is a row.
          It sat at the foot of every day column when a slot belonged to one
          day; seven copies of a control that now acts on the whole week would
          be seven ways to do one thing. */}
      {editable && <AddSlot rows={rows} />}
    </div>
  );
}
