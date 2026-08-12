'use client';

import { createContext, useContext, useEffect, useOptimistic, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';

import type { DishDetail } from '@/features/weekly-plans/nutrition';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

import {
  addMealAction,
  addWeekMealAction,
  clearMealAction,
  moveMealAction,
  placeDishAction,
  removeMealAction,
  removeWeekMealAction,
  setServingsAction,
} from '../editor-actions';
import { applyEdit, type BoardEdit } from '../editor-state';
import { initialPlanActionState, type PlanActionState } from '../form-state';
import type { Board } from '../queries';

/**
 * The message keys an edit can fail with.
 *
 * Narrowed from `PlanActionState` rather than widened to `string`, so the header
 * can hand it straight to `useTranslations` — next-intl only accepts keys it can
 * see, and a `string` here would force a cast at the one place a typo would be
 * invisible until it rendered.
 */
type EditErrorKey = Extract<PlanActionState, { status: 'error' }>['messageKey'];

/**
 * The board's editing layer.
 *
 * Every edit is applied to a local copy through `applyEdit` and rendered at once,
 * while the matching server action persists it. That is not a cosmetic choice: a
 * `revalidatePath` round trip per drop makes drag-and-drop feel broken, and the
 * board already carries the ingredient lists needed to recompute totals with the
 * same arithmetic the server would use — so the optimistic numbers are the real
 * ones, not a guess that will be corrected a moment later.
 *
 * A failed edit reverts (React discards the optimistic state when the transition
 * ends) and writes into the board's quiet persistence status region. Completed
 * moves use the shared toast because they include the reversible Undo action.
 */

type EditorValue = {
  board: Board;
  editable: boolean;
  /** True while a live plan is being edited on purpose. */
  allowPublished: boolean;
  pending: boolean;
  /** A message key from the last failed edit, or null. */
  error: EditErrorKey | null;
};

type SavedMove = {
  fromMealId: string;
  toMealId: string;
  dishName: string;
  toastId: string;
};

const EditorContext = createContext<EditorValue | null>(null);

export function useEditor(): EditorValue {
  const value = useContext(EditorContext);
  if (!value) throw new Error('useEditor must be used inside BoardEditor');
  return value;
}

/** What a draggable puts in `data`, so drop handling stays type-safe. */
export type DragPayload =
  | { kind: 'dish'; dish: DishDetail; servings: number }
  | {
      kind: 'meal';
      mealId: string;
      preview: {
        label: string;
        timeOfDay: string;
        dishName: string;
        kcal: number;
        servings: number;
      };
    };

export function BoardEditor({
  board,
  editable,
  allowPublished,
  locale,
  onDishDragStart,
  children,
}: {
  board: Board;
  editable: boolean;
  allowPublished: boolean;
  locale: string;
  onDishDragStart?: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations('weeklyPlans');
  const [optimisticBoard, applyOptimistic] = useOptimistic(board, applyEdit);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<EditErrorKey | null>(null);
  const [dragging, setDragging] = useState<DragPayload | null>(null);
  /**
   * The size of the card that was lifted, so the thing under the pointer is the
   * size of the thing it came from.
   *
   * The overlay used to be a fixed `w-40` regardless of source: lifting a board
   * card in a wide column visibly shrank it, and a catalog row — a full-width
   * strip — became a small card the moment it left the drawer. dnd-kit measures
   * the source node at drag start, so the real dimensions are already there for
   * the asking.
   */
  const [dragSize, setDragSize] = useState<{ width: number; height: number } | null>(null);
  const [settledMealId, setSettledMealId] = useState<string | null>(null);
  const moveToastSequence = useRef(0);

  useEffect(() => {
    if (!settledMealId) return;
    const timeout = window.setTimeout(() => setSettledMealId(null), 520);
    return () => window.clearTimeout(timeout);
  }, [settledMealId]);

  // Pointer covers mouse and pen; Touch is what makes the board work on a tablet;
  // Keyboard is not optional, because every card is a real button today and an
  // editor reachable only by mouse would be a regression.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  function formFor(fields: Record<string, string | number>): FormData {
    const form = new FormData();
    form.set('locale', locale);
    form.set('planId', board.id);
    if (allowPublished) form.set('allowPublished', 'on');
    for (const [key, value] of Object.entries(fields)) form.set(key, String(value));
    return form;
  }

  /**
   * Applies an edit locally and persists it.
   *
   * Both inside one transition: `useOptimistic` only holds its value for the life
   * of the transition that set it, so applying outside would flash the old board
   * back before the action had even started. When the transition ends, React drops
   * the optimistic value and the revalidated server board takes over — which is
   * also, for free, the revert on failure.
   */
  function runAction(
    edit: BoardEdit,
    action: (state: typeof initialPlanActionState, form: FormData) => Promise<typeof initialPlanActionState>,
    fields: Record<string, string | number>,
    onSuccess?: () => void,
  ): void {
    setError(null);

    startTransition(async () => {
      applyOptimistic(edit);
      const result = await action(initialPlanActionState, formFor(fields));
      if (result.status === 'error') {
        setSettledMealId(null);
        setError(result.messageKey);
        return;
      }

      onSuccess?.();
    });
  }

  function undoMove(move: SavedMove): void {
    toast.dismiss(move.toastId);
    runAction(
      { kind: 'move', fromMealId: move.toMealId, toMealId: move.fromMealId, mode: 'move' },
      moveMealAction,
      { fromMealId: move.toMealId, toMealId: move.fromMealId, mode: 'move' },
    );
  }

  function showMoveToast(move: SavedMove): void {
    toast.success(t('mealMoved', { name: move.dishName }), {
      id: move.toastId,
      description: t('mealMovedHint'),
      action: {
        label: t('undo'),
        onClick: () => undoMove(move),
      },
    });
  }

  function onDragStart(event: DragStartEvent): void {
    setSettledMealId(null);
    const payload = (event.active.data.current as DragPayload | undefined) ?? null;
    setDragging(payload);

    const rect = event.active.rect.current.initial;
    setDragSize(rect ? { width: rect.width, height: rect.height } : null);

    if (payload?.kind === 'dish') onDishDragStart?.();
  }

  function endDrag(): void {
    setDragging(null);
    setDragSize(null);
  }

  function onDragEnd(event: DragEndEvent): void {
    /*
     * The payload captured at drag start, not `event.active.data.current`.
     *
     * dnd-kit reads that through the source node's own ref, and a dish drag
     * closes the catalog — so by the time the drop lands the row that was lifted
     * has unmounted and the ref holds an empty object. That is not a missing
     * payload the guard below catches: `{}` is truthy, fails the `dish` test,
     * and fell through to the meal branch, where reading `preview.dishName` threw
     * and the dish was never placed. The drag we started is the drag we finish.
     */
    const payload = dragging;
    const target = event.over?.data.current as { mealId: string } | undefined;

    endDrag();

    if (!target || !payload || !editable) return;

    if (payload.kind === 'dish') {
      setSettledMealId(target.mealId);
      runAction(
        { kind: 'place', mealId: target.mealId, dish: payload.dish, servings: payload.servings },
        placeDishAction,
        { mealId: target.mealId, dishId: payload.dish.id, servings: payload.servings },
      );
      return;
    }

    if (payload.mealId === target.mealId) return;

    const move: SavedMove = {
      fromMealId: payload.mealId,
      toMealId: target.mealId,
      dishName: payload.preview.dishName,
      toastId: `${board.id}-move-${++moveToastSequence.current}`,
    };
    setSettledMealId(target.mealId);

    runAction(
      { kind: 'move', fromMealId: payload.mealId, toMealId: target.mealId, mode: 'move' },
      moveMealAction,
      { fromMealId: payload.mealId, toMealId: target.mealId, mode: 'move' },
      () => showMoveToast(move),
    );
  }

  const value: EditorValue = {
    board: optimisticBoard,
    editable,
    allowPublished,
    pending,
    error,
  };

  return (
    <EditorContext.Provider value={value}>
      {/*
        `id` is not decoration. Without it dnd-kit builds the drag handles'
        `aria-describedby` from a module-level counter (`useUniqueId` in
        @dnd-kit/utilities), which starts at zero on the server and continues from
        wherever the client happens to be — so every handle hydrates with a
        mismatched attribute and React warns. A fixed id makes the value
        deterministic on both sides.
      */}
      <DndContext
        id="weekly-plan-board"
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={endDrag}
      >
        <EditorActionsContext.Provider
          value={{
            setServings: (mealId, servings) => {
              runAction({ kind: 'servings', mealId, servings }, setServingsAction, {
                mealId,
                servings,
              });
            },
            place: (mealId, dish, servings) => {
              runAction({ kind: 'place', mealId, dish, servings }, placeDishAction, {
                mealId,
                dishId: dish.id,
                servings,
              });
              setSettledMealId(mealId);
            },
            clear: (mealId) => {
              runAction({ kind: 'clear', mealId }, clearMealAction, { mealId });
            },
            remove: (mealId) => {
              runAction({ kind: 'remove', mealId }, removeMealAction, { mealId });
            },
            add: (dayOfWeek, slotKey, label, timeOfDay) => {
              runAction({ kind: 'add', dayOfWeek, slotKey, label, timeOfDay }, addMealAction, {
                dayOfWeek,
                slotKey,
                label,
                timeOfDay,
              });
            },
            removeWeek: (slotKey) => {
              runAction({ kind: 'removeWeek', slotKey }, removeWeekMealAction, { slotKey });
            },
            addWeek: (slotKey, label, timeOfDay) => {
              runAction({ kind: 'addWeek', slotKey, label, timeOfDay }, addWeekMealAction, {
                slotKey,
                label,
                timeOfDay,
              });
            },
            dragging,
            settledMealId,
          }}
        >
          {children}
        </EditorActionsContext.Provider>

        <DragOverlay dropAnimation={{ duration: 240, easing: 'cubic-bezier(.16,1,.3,1)' }}>
          {dragging ? <DragPreview payload={dragging} size={dragSize} /> : null}
        </DragOverlay>
      </DndContext>
    </EditorContext.Provider>
  );
}

function DragPreview({
  payload,
  size,
}: {
  payload: DragPayload;
  size: { width: number; height: number } | null;
}) {
  const isMeal = payload.kind === 'meal';
  const name = isMeal ? payload.preview.dishName : payload.dish.nameAr;

  /*
   * A lifted card keeps the size it had in its column; a dish lifted out of the
   * catalog does not, because the row it came from is a full-width strip and the
   * thing it is about to become is a card. So the meal drag is measured and the
   * dish drag falls back to the card's own width.
   */
  const measured = isMeal && size ? { width: size.width, height: size.height } : undefined;

  return (
    /*
     * The thing under the pointer has to be the thing being moved.
     *
     * This still had the old card's anatomy — a metadata row above the name and
     * a tinted shelf under it — so lifting a card visibly changed it into a
     * different object mid-drag. It now matches `meal-card.tsx` exactly: name
     * centred at the top, a hairline, figures at the foot, no fill. The slot
     * label and time are gone from it for the same reason they are gone from
     * the card — they belong to the row, and a card in flight is between rows.
     */
    /*
     * No rotation and no scale either. Both were the same mistake as the fixed
     * width in a different register: the card the pointer picked up has to be
     * the card it put down, and a tilt is a second, smaller lie about what is
     * being moved. What says "lifted" now is the shadow, which is what depth is
     * for.
     */
    <div
      style={measured}
      className={cn(
        'flex cursor-grabbing flex-col overflow-hidden rounded-lg border border-primary bg-card shadow-overlay',
        !measured && 'w-40',
      )}
    >
      <span className="flex min-h-0 flex-1 items-center justify-center px-2 pt-2">
        <span
          className="line-clamp-2 text-center font-heading text-body-md font-medium leading-snug [text-wrap:balance]"
          dir="auto"
        >
          {name}
        </span>
      </span>

      {isMeal && (
        <span className="mt-1 flex shrink-0 items-baseline justify-between gap-2 px-2 pb-1.5 pt-2.5">
          <span className="inline-flex items-baseline gap-1 text-body-sm font-semibold tabular-nums" dir="ltr">
            {payload.preview.kcal}
            <small className="text-caption font-normal text-muted-foreground">kcal</small>
          </span>
          <span className="shrink-0 text-caption text-muted-foreground" dir="ltr">
            ×{payload.preview.servings}
          </span>
        </span>
      )}
    </div>
  );
}

/** The edits a card or column can trigger without a drag. */
type EditorActions = {
  /**
   * Puts a dish in a slot without a drag.
   *
   * The same edit the drop handler runs, reachable by a click — which is what
   * the catalog inside the meal inspector needs, and what a keyboard has always
   * needed.
   */
  place: (mealId: string, dish: DishDetail, servings: number) => void;
  setServings: (mealId: string, servings: number) => void;
  clear: (mealId: string) => void;
  remove: (mealId: string) => void;
  /** Restores one day's skipped slot. The exception — see `addWeek`. */
  add: (dayOfWeek: number, slotKey: string, label: string, timeOfDay: string) => void;
  /** Adds a slot to all seven days. How a schedule normally grows. */
  addWeek: (slotKey: string, label: string, timeOfDay: string) => void;
  /** Drops a slot from all seven days. Confirmed by the caller. */
  removeWeek: (slotKey: string) => void;
  /** What is currently in flight, so drop targets can light up. */
  dragging: DragPayload | null;
  /** The slot that just received a drop, for one bounded settle animation. */
  settledMealId: string | null;
};

const EditorActionsContext = createContext<EditorActions | null>(null);

export function useEditorActions(): EditorActions {
  const value = useContext(EditorActionsContext);
  if (!value) throw new Error('useEditorActions must be used inside BoardEditor');
  return value;
}
