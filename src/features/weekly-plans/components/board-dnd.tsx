'use client';

import { createContext, useContext, useEffect, useOptimistic, useState, useTransition } from 'react';
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

import {
  addMealAction,
  clearMealAction,
  moveMealAction,
  placeDishAction,
  removeMealAction,
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
 * ends) and writes into the header's status region. There is no toast primitive in
 * `src/components/ui/`, and this feature is not a good reason to invent one.
 */

type EditorValue = {
  board: Board;
  editable: boolean;
  /** True while a live plan is being edited on purpose. */
  allowPublished: boolean;
  pending: boolean;
  /** A message key from the last failed edit, or null. */
  error: EditErrorKey | null;
  lastMove: { dishName: string } | null;
  undoLastMove: () => void;
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
  children,
}: {
  board: Board;
  editable: boolean;
  allowPublished: boolean;
  locale: string;
  children: React.ReactNode;
}) {
  const [optimisticBoard, applyOptimistic] = useOptimistic(board, applyEdit);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<EditErrorKey | null>(null);
  const [dragging, setDragging] = useState<DragPayload | null>(null);
  const [lastMove, setLastMove] = useState<{
    fromMealId: string;
    toMealId: string;
    dishName: string;
  } | null>(null);

  useEffect(() => {
    if (!lastMove) return;
    const timeout = window.setTimeout(() => setLastMove(null), 8000);
    return () => window.clearTimeout(timeout);
  }, [lastMove]);

  // Pointer covers mouse and pen; Touch is what makes the board work on a tablet;
  // Keyboard is not optional, because every card is a real button today and an
  // editor reachable only by mouse would be a regression.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
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
  ): void {
    setError(null);

    startTransition(async () => {
      applyOptimistic(edit);
      const result = await action(initialPlanActionState, formFor(fields));
      if (result.status === 'error') {
        setLastMove(null);
        setError(result.messageKey);
      }
    });
  }

  function onDragStart(event: DragStartEvent): void {
    setDragging((event.active.data.current as DragPayload | undefined) ?? null);
  }

  function onDragEnd(event: DragEndEvent): void {
    setDragging(null);

    const target = event.over?.data.current as { mealId: string } | undefined;
    const payload = event.active.data.current as DragPayload | undefined;

    if (!target || !payload || !editable) return;

    if (payload.kind === 'dish') {
      setLastMove(null);
      runAction(
        { kind: 'place', mealId: target.mealId, dish: payload.dish, servings: payload.servings },
        placeDishAction,
        { mealId: target.mealId, dishId: payload.dish.id, servings: payload.servings },
      );
      return;
    }

    if (payload.mealId === target.mealId) return;

    setLastMove({
      fromMealId: payload.mealId,
      toMealId: target.mealId,
      dishName: payload.preview.dishName,
    });

    runAction(
      { kind: 'move', fromMealId: payload.mealId, toMealId: target.mealId, mode: 'move' },
      moveMealAction,
      { fromMealId: payload.mealId, toMealId: target.mealId, mode: 'move' },
    );
  }

  function undoLastMove(): void {
    if (!lastMove || pending) return;
    const move = lastMove;
    setLastMove(null);
    runAction(
      { kind: 'move', fromMealId: move.toMealId, toMealId: move.fromMealId, mode: 'move' },
      moveMealAction,
      { fromMealId: move.toMealId, toMealId: move.fromMealId, mode: 'move' },
    );
  }

  const value: EditorValue = {
    board: optimisticBoard,
    editable,
    allowPublished,
    pending,
    error,
    lastMove: lastMove ? { dishName: lastMove.dishName } : null,
    undoLastMove,
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
        onDragCancel={() => setDragging(null)}
      >
        <EditorActionsContext.Provider
          value={{
            setServings: (mealId, servings) => {
              setLastMove(null);
              runAction({ kind: 'servings', mealId, servings }, setServingsAction, {
                mealId,
                servings,
              });
            },
            clear: (mealId) => {
              setLastMove(null);
              runAction({ kind: 'clear', mealId }, clearMealAction, { mealId });
            },
            remove: (mealId) => {
              setLastMove(null);
              runAction({ kind: 'remove', mealId }, removeMealAction, { mealId });
            },
            add: (dayOfWeek, slotKey, label, timeOfDay) => {
              setLastMove(null);
              runAction({ kind: 'add', dayOfWeek, slotKey, label, timeOfDay }, addMealAction, {
                dayOfWeek,
                slotKey,
                label,
                timeOfDay,
              });
            },
            dragging,
          }}
        >
          {children}
        </EditorActionsContext.Provider>

        <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(.2,.6,.2,1)' }}>
          {dragging ? <DragPreview payload={dragging} /> : null}
        </DragOverlay>
      </DndContext>
    </EditorContext.Provider>
  );
}

function DragPreview({ payload }: { payload: DragPayload }) {
  const isMeal = payload.kind === 'meal';
  const name = isMeal ? payload.preview.dishName : payload.dish.nameAr;

  return (
    <div className="w-52 overflow-hidden rounded-lg rounded-ee-4xl border border-primary bg-card shadow-overlay">
      {isMeal && (
        <div className="flex items-baseline justify-between gap-2 px-3 pt-2.5 text-caption text-muted-foreground">
          <span className="truncate">{payload.preview.label}</span>
          <span dir="ltr">{payload.preview.timeOfDay}</span>
        </div>
      )}
      <p className="px-3 py-3 font-heading text-body-md font-semibold leading-relaxed" dir="auto">
        {name}
      </p>
      {isMeal && (
        <div className="flex items-baseline justify-between border-t border-border bg-muted/70 px-3 py-2.5">
          <strong className="font-heading text-heading-sm tabular-nums" dir="ltr">
            {payload.preview.kcal} <small className="font-sans text-caption font-normal">kcal</small>
          </strong>
          <span className="text-caption text-muted-foreground" dir="ltr">
            ×{payload.preview.servings}
          </span>
        </div>
      )}
    </div>
  );
}

/** The edits a card or column can trigger without a drag. */
type EditorActions = {
  setServings: (mealId: string, servings: number) => void;
  clear: (mealId: string) => void;
  remove: (mealId: string) => void;
  add: (dayOfWeek: number, slotKey: string, label: string, timeOfDay: string) => void;
  /** What is currently in flight, so drop targets can light up. */
  dragging: DragPayload | null;
};

const EditorActionsContext = createContext<EditorActions | null>(null);

export function useEditorActions(): EditorActions {
  const value = useContext(EditorActionsContext);
  if (!value) throw new Error('useEditorActions must be used inside BoardEditor');
  return value;
}
