'use client';

import { createContext, useContext, useOptimistic, useState, useTransition } from 'react';
import {
  DndContext,
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
};

const EditorContext = createContext<EditorValue | null>(null);

export function useEditor(): EditorValue {
  const value = useContext(EditorContext);
  if (!value) throw new Error('useEditor must be used inside BoardEditor');
  return value;
}

/** What a draggable puts in `data`, so drop handling stays type-safe. */
type DragPayload =
  | { kind: 'dish'; dish: DishDetail; servings: number }
  | { kind: 'meal'; mealId: string };

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
      if (result.status === 'error') setError(result.messageKey);
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
      runAction(
        { kind: 'place', mealId: target.mealId, dish: payload.dish, servings: payload.servings },
        placeDishAction,
        { mealId: target.mealId, dishId: payload.dish.id, servings: payload.servings },
      );
      return;
    }

    if (payload.mealId === target.mealId) return;

    runAction(
      { kind: 'move', fromMealId: payload.mealId, toMealId: target.mealId, mode: 'move' },
      moveMealAction,
      { fromMealId: payload.mealId, toMealId: target.mealId, mode: 'move' },
    );
  }

  const value: EditorValue = { board: optimisticBoard, editable, allowPublished, pending, error };

  return (
    <EditorContext.Provider value={value}>
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <EditorActionsContext.Provider
          value={{
            setServings: (mealId, servings) =>
              runAction({ kind: 'servings', mealId, servings }, setServingsAction, {
                mealId,
                servings,
              }),
            clear: (mealId) => runAction({ kind: 'clear', mealId }, clearMealAction, { mealId }),
            remove: (mealId) => runAction({ kind: 'remove', mealId }, removeMealAction, { mealId }),
            add: (dayOfWeek, slotKey, label, timeOfDay) =>
              runAction({ kind: 'add', dayOfWeek, slotKey, label, timeOfDay }, addMealAction, {
                dayOfWeek,
                slotKey,
                label,
                timeOfDay,
              }),
            dragging,
          }}
        >
          {children}
        </EditorActionsContext.Provider>
      </DndContext>
    </EditorContext.Provider>
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
