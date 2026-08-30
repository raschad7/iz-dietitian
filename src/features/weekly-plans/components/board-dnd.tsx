'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragPendingEvent,
  type DragStartEvent,
  type Modifier,
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
  resetMealIngredientsAction,
  restoreWeekMealAction,
  setMealIngredientAction,
  setServingsAction,
} from '../editor-actions';
import { applyEdit, type BoardEdit } from '../editor-state';
import { localizedName } from '../food-display';
import { dishTagAccentClass } from '../meal-tag-tone';
import { initialPlanActionState, type PlanActionState } from '../form-state';
import type { Board, BoardMeal } from '../queries';

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

/** Everything needed to put a removed slot back — see `undoSlotRemoval`. */
type SavedSlotRemoval = {
  slotKey: string;
  label: string;
  timeOfDay: string;
  meals: readonly { dayOfWeek: number; meal: BoardMeal }[];
  toastId: string;
};

/**
 * How long a finger has to rest on a card before it picks it up.
 *
 * A touch surface cannot spend a gesture on dragging the way a mouse can. Every
 * swipe across this board is a scroll — the week pans sideways, the columns run
 * off the bottom — so "moved a few pixels" cannot mean "began a drag" without
 * taking scrolling away from the finger. A hold can mean it, because nothing
 * else on a touch screen is a hold.
 *
 * 320ms is long enough that a flick past a card never trips it and short enough
 * that a deliberate press does not feel like waiting. It is also the length of
 * the card's arming animation, which is why the number is in
 * `--duration-hold` in `globals.css` as well — the two have to agree, or the
 * card finishes charging before or after the drag it is charging towards.
 */
export const HOLD_TO_DRAG_MS = 320;

/**
 * How far the finger may drift during the hold before it counts as a scroll.
 *
 * Small on purpose. A finger resting on glass wanders a pixel or two; a finger
 * that has travelled 8px is on its way somewhere, and the surface under it
 * belongs to the scroller.
 */
const HOLD_TOLERANCE_PX = 8;

/** Where a pointer event is on the screen, for mouse and touch alike. */
function pointerCoordinates(event: Event): { x: number; y: number } | null {
  if (typeof TouchEvent !== 'undefined' && event instanceof TouchEvent) {
    const touch = event.touches[0] ?? event.changedTouches[0];
    return touch ? { x: touch.clientX, y: touch.clientY } : null;
  }

  if (typeof MouseEvent !== 'undefined' && event instanceof MouseEvent) {
    return { x: event.clientX, y: event.clientY };
  }

  return null;
}

const EditorContext = createContext<EditorValue | null>(null);

export function useEditor(): EditorValue {
  const value = useContext(EditorContext);
  if (!value) throw new Error('useEditor must be used inside BoardEditor');
  return value;
}

/** What a draggable puts in `data`, so drop handling stays type-safe. */
export type DragPayload =
  | {
      kind: 'dish';
      dish: DishDetail;
      servings: number;
      /**
       * The energy the catalog row was showing, carried so the lifted card can
       * show the same figure a meal card would. Taken from the row rather than
       * recomputed here: the row already has `baseKcal × servings`, and a second
       * derivation is a second chance for the two to disagree.
       */
      kcal: number;
    }
  | {
      kind: 'meal';
      mealId: string;
      preview: {
        label: string;
        timeOfDay: string;
        dishName: string;
        kcal: number;
        servings: number;
        /**
         * The dish's tags, carried purely so the lifted card can draw the same
         * coloured rule its resting self does. Without them the preview loses
         * the one mark that says *which kind* of dish is in flight, at the
         * moment that is the only thing on screen answering the question.
         */
        tags: string[];
      };
    };

export function BoardEditor({
  board,
  editable,
  locale,
  onDishDragStart,
  children,
}: {
  board: Board;
  editable: boolean;
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
   *
   * **What it measures is the card, and only since `setActivatorNodeRef`.** The
   * draggable node used to be the grip inside the card, so `active.rect` was a
   * 32px square and the "measured" size was the size of the handle — which is
   * why a lifted card sometimes came out far smaller than the card it left, and
   * why it depended on where in the card you happened to grab it. See
   * `meal-card.tsx`.
   */
  const [dragSize, setDragSize] = useState<{ width: number; height: number } | null>(null);
  const [settledMealId, setSettledMealId] = useState<string | null>(null);
  /**
   * The draggable a finger is currently resting on, while the hold counts down.
   *
   * A press-and-hold that gives nothing back until it fires is a gesture nobody
   * believes in: the finger is down, the screen is still, and there is no way to
   * know whether anything is happening or whether the card simply does not do
   * this. So the card arms visibly for the length of the hold — see
   * `.planner-holding` — and that is also how the gesture teaches itself, since
   * a tablet has no grip to point at any more.
   *
   * Set from dnd-kit's pending phase, which is fired the moment a constraint
   * starts counting and again on every move until it resolves.
   */
  const [holdingId, setHoldingId] = useState<string | null>(null);
  const moveToastSequence = useRef(0);
  /**
   * The gesture in flight, in screen coordinates: the box it was lifted from,
   * where the pointer went down, and where the pointer is now.
   *
   * This is the whole of the lifted card's position — see `pinToPointer`. Null on
   * a keyboard drag, which has no pointer and keeps dnd-kit's own arithmetic.
   */
  const gesture = useRef<{
    origin: { left: number; top: number };
    start: { x: number; y: number };
    now: { x: number; y: number };
  } | null>(null);

  /*
   * ── The lifted card is placed from the finger, not from a measurement ──
   *
   * dnd-kit draws the overlay as `position: fixed` with `left`/`top` set to the
   * source node's rect and a `transform` for the distance travelled since. Both
   * halves come out of its own measuring pass, and on a tablet the anchor was
   * the half that went wrong: scroll the week sideways, then press and hold, and
   * the card was drawn from a box measured before the scroll — so it trailed by
   * exactly how far the week had been panned.
   *
   * It only ever showed on a tablet because that is the only place the week
   * overflows. On a desktop the seven days fit, so every scroll offset is zero
   * and a stale measurement is indistinguishable from a fresh one.
   *
   * Correcting the transform is not enough, and was tried: the anchor is added
   * after any modifier runs. So the anchor is taken away instead — `left: 0` and
   * `top: 0` on the overlay (see the `style` prop, which dnd-kit spreads *after*
   * its own rect and which is therefore the one place either can be overridden)
   * — and this modifier supplies the absolute screen position on its own.
   *
   * What it returns is not an offset: it is where the card's inline-start top
   * corner belongs, which is the box it was lifted from plus the distance the
   * finger has travelled. Nothing dnd-kit measured takes part, so nothing it
   * cached can be stale. A scroll *during* the drag needs no correction either —
   * the anchor is a place on the screen, not a place in the week, so a board
   * panning underneath does not drag the card along with it.
   *
   * This is the overlay's own modifier. It changes what is drawn and nothing
   * about what a drop lands on.
   */
  const pinToPointer = useCallback<Modifier>(({ transform }) => {
    const current = gesture.current;
    if (!current) return transform;

    return {
      ...transform,
      x: current.origin.left + (current.now.x - current.start.x),
      y: current.origin.top + (current.now.y - current.start.y),
    };
  }, []);

  useEffect(() => {
    if (!settledMealId) return;
    const timeout = window.setTimeout(() => setSettledMealId(null), 520);
    return () => window.clearTimeout(timeout);
  }, [settledMealId]);

  /*
   * Keeps `pointer` current for the life of a drag.
   *
   * Capture phase, so the ref is already updated by the time dnd-kit's own
   * listeners run on the same event and re-render the overlay — the modifier
   * reads this during that render, and a frame-late pointer would be a lag of
   * its own. Passive: this only observes, and the sensors decide what the
   * gesture is allowed to do.
   *
   * `mousemove` and `touchmove` rather than `pointermove`, to match the two
   * sensors exactly — see the note on `sensors` for why those are separate here.
   */
  useEffect(() => {
    if (!dragging) return;

    function track(event: MouseEvent | TouchEvent): void {
      const coordinates = pointerCoordinates(event);
      if (coordinates && gesture.current) gesture.current.now = coordinates;
    }

    const options = { capture: true, passive: true } as const;
    window.addEventListener('mousemove', track, options);
    window.addEventListener('touchmove', track, options);

    return () => {
      window.removeEventListener('mousemove', track, options);
      window.removeEventListener('touchmove', track, options);
    };
  }, [dragging]);

  /*
   * ── Mouse and touch are two different gestures, so they are two sensors ──
   *
   * This was one `PointerSensor` with `{ distance: 6 }`, and a single sensor is
   * exactly what could not work here: `pointerdown` fires *before* `touchstart`,
   * so on a tablet the pointer sensor captured every gesture and the touch
   * sensor beside it never ran. A finger therefore got the mouse's rule — start
   * dragging after 6px of travel — which is indistinguishable from the first 6px
   * of a scroll. The board survived it only because the grip claimed
   * `touch-action: none`; the catalog rows did not, so a finger on a dish
   * scrolled the list and the dish could not be dragged out at all.
   *
   * `MouseSensor` activates on `mousedown` and `TouchSensor` on `touchstart`, so
   * each input gets its own constraint and neither can swallow the other's
   * gesture. Pen keeps working through the compatibility mouse events it already
   * fires.
   *
   * The mouse rule is unchanged, deliberately: 6px of travel, from the grip. The
   * finger's rule is a press and hold — see `HOLD_TO_DRAG_MS`.
   */
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: HOLD_TO_DRAG_MS, tolerance: HOLD_TOLERANCE_PX },
    }),
    useSensor(KeyboardSensor),
  );

  function formFor(fields: Record<string, string | number>): FormData {
    const form = new FormData();
    form.set('locale', locale);
    form.set('planId', board.id);
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

  /**
   * Puts a removed slot back exactly as it was — dishes, portions and budgets.
   *
   * The removal takes seven meals at once and any dish in them, which used to
   * make it the one edit on this board with no way back: `addWeek` would have
   * returned seven empty cells, so an Undo built on it would have been a button
   * that quietly did something else. `restoreWeekMealAction` writes the rows
   * themselves, and `saved` is where they still exist — captured off the board
   * before the delete, because a moment later they exist nowhere at all.
   */
  function undoSlotRemoval(saved: SavedSlotRemoval): void {
    toast.dismiss(saved.toastId);

    runAction(
      { kind: 'restoreWeek', meals: saved.meals },
      restoreWeekMealAction,
      {
        slotKey: saved.slotKey,
        label: saved.label,
        timeOfDay: saved.timeOfDay,
        days: JSON.stringify(
          saved.meals.map(({ dayOfWeek, meal }) => ({
            dayOfWeek,
            dishId: meal.dish?.id ?? null,
            servings: meal.dish?.servings ?? 1,
            budgetKcal: meal.budgetKcal,
          })),
        ),
      },
    );
  }

  function showSlotRemovedToast(saved: SavedSlotRemoval): void {
    toast.success(t('slotRemoved', { slot: saved.label }), {
      id: saved.toastId,
      description: t('slotRemovedHint'),
      action: {
        label: t('undo'),
        onClick: () => undoSlotRemoval(saved),
      },
    });
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

  /**
   * A constraint has started counting.
   *
   * Only the hold is drawn. The mouse's constraint is a distance and fires this
   * on every pixel of a gesture that has already visibly begun — arming a card
   * under a pointer that is mid-drag would be chrome describing the past.
   */
  function onDragPending(event: DragPendingEvent): void {
    if (!('delay' in event.constraint)) return;
    setHoldingId(String(event.id));
  }

  /** The hold was abandoned — the finger left, or travelled far enough to scroll. */
  function onDragAbort(): void {
    setHoldingId(null);
  }

  function onDragStart(event: DragStartEvent): void {
    setHoldingId(null);
    setSettledMealId(null);
    const payload = (event.active.data.current as DragPayload | undefined) ?? null;
    setDragging(payload);

    /*
     * The card's own box, measured here, rather than `active.rect.current.initial`.
     *
     * That field is dnd-kit's *measured* rect and it is filled in by the
     * measuring pass, which has not necessarily run by the time `onDragStart`
     * fires — so it was `null` about as often as it was not, and the overlay
     * silently fell through to its fixed fallback width. The same card came out
     * its real size on one drag and 176px on the next, which is exactly the
     * "sometimes it gets smaller" this looked like from the outside.
     *
     * `activatorEvent` is the pointer event that began the gesture, so its
     * target is the grip and `closest` walks up to the card the grip belongs
     * to. Reading the box off the DOM is synchronous and always available.
     */
    const activator = event.activatorEvent.target;
    const node =
      activator instanceof Element ? activator.closest('[data-drag-origin]') : null;

    const rect = node?.getBoundingClientRect() ?? event.active.rect.current.initial;
    setDragSize(rect ? { width: rect.width, height: rect.height } : null);

    /*
     * Where the gesture began, and the box it began in.
     *
     * `activatorEvent` is the `mousedown` or `touchstart` the sensor activated
     * on, so the coordinates are the pointer's own starting point rather than an
     * approximation of it — which matters, because the lifted card's position is
     * a distance measured from here. Both are read now, in the same frame, off a
     * box that is still on screen: a dish drag closes the catalog a few lines
     * below and the row this was measured from stops existing.
     *
     * A keyboard drag has neither, and leaves this null so `pinToPointer` stands
     * aside and dnd-kit's own arithmetic runs.
     */
    const start = pointerCoordinates(event.activatorEvent);
    gesture.current =
      start && rect ? { origin: { left: rect.left, top: rect.top }, start, now: start } : null;

    if (payload?.kind === 'dish') onDishDragStart?.();
  }

  function endDrag(): void {
    setDragging(null);
    setDragSize(null);
    setHoldingId(null);
    /*
     * Cleared here rather than left for the next `onDragStart` to overwrite. The
     * drop animation renders the overlay for 240ms after this runs, and a stale
     * gesture would spend them positioning it from a finger that has lifted.
     */
    gesture.current = null;
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
        /*
          Re-measure the slots as the week pans, instead of once when the drag
          began.

          dnd-kit's default is `WhileDragging`, which measures every drop target
          the moment a card is lifted and then trusts those boxes for the rest of
          the gesture. On a board that fits, they stay true. On a tablet the week
          scrolls under the drag — the auto-scroll below is *why* it scrolls —
          and from the first pixel of that pan every box it is holding describes
          where a day used to be. That is what made a card dragged towards a day
          off the edge feel stuck: the days it was passing over had not moved as
          far as dnd-kit believed, so the target under the finger kept being the
          wrong one, or none at all.

          `Always` re-measures each frame of the drag. It costs a layout pass per
          frame over thirty-five cells, which is real but bounded, and it is the
          only strategy that stays correct while the surface underneath moves.
        */
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        /*
          Reaching a day that is off the edge.

          The default threshold asks the drag to come within 5% of the frame's
          edge before the week starts panning — about 40px on this board, and a
          band a finger tends to overshoot into the bezel rather than land in.
          A quarter of the frame gives the gesture somewhere to aim, which is
          what "drag it to the first day" needs on a surface where the first day
          is not on screen.
        */
        autoScroll={{ threshold: { x: 0.25, y: 0.15 }, acceleration: 12 }}
        onDragPending={onDragPending}
        onDragAbort={onDragAbort}
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
            setIngredient: (mealId, amount) => {
              runAction(
                {
                  kind: 'ingredient',
                  mealId,
                  foodId: amount.foodId,
                  quantityGrams: amount.quantityGrams,
                  portionQuantity: amount.portionQuantity,
                },
                setMealIngredientAction,
                {
                  mealId,
                  foodId: amount.foodId,
                  quantityGrams: amount.quantityGrams,
                  // A grams line sends both fields empty. `formFor` writes the
                  // value it is given, and '' is what the action reads back as
                  // "no portion" — the pair stays whole in both directions.
                  portionId: amount.portionId ?? '',
                  portionQuantity: amount.portionQuantity ?? '',
                },
              );
            },
            resetIngredients: (mealId) => {
              runAction({ kind: 'resetIngredients', mealId }, resetMealIngredientsAction, {
                mealId,
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
              /*
                Captured before the edit, not after: `applyOptimistic` is about
                to filter these rows out of the board, and once the server's
                delete lands they are gone from the database too. This closure
                is the last place the week's dishes for this slot exist.
              */
              const saved: SavedSlotRemoval = {
                slotKey,
                label:
                  optimisticBoard.days
                    .flatMap((day) => day.meals)
                    .find((meal) => meal.slotKey === slotKey)?.label ?? slotKey,
                timeOfDay:
                  optimisticBoard.days
                    .flatMap((day) => day.meals)
                    .find((meal) => meal.slotKey === slotKey)?.timeOfDay ?? '12:00',
                meals: optimisticBoard.days.flatMap((day) =>
                  day.meals
                    .filter((meal) => meal.slotKey === slotKey)
                    .map((meal) => ({ dayOfWeek: day.dayOfWeek, meal })),
                ),
                toastId: `${board.id}-slot-${++moveToastSequence.current}`,
              };

              runAction({ kind: 'removeWeek', slotKey }, removeWeekMealAction, { slotKey }, () =>
                showSlotRemovedToast(saved),
              );
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
            holdingId,
          }}
        >
          {children}
        </EditorActionsContext.Provider>

        <DragOverlay
          modifiers={[pinToPointer]}
          /*
            The anchor, taken off dnd-kit and given to `pinToPointer`.

            `PositionedOverlay` builds its style as its own rect first and this
            prop spread last, so these four are the only way to override what it
            measured. `left`/`top` go to zero because the modifier now returns an
            absolute position rather than an offset; `width`/`height` go to `auto`
            because the card inside already sizes itself — a lifted meal from the
            box it left (`dragSize`), a lifted dish to a card's own footprint —
            and a measured size on the wrapper is one more thing that can be
            stale for the same reason the anchor was.
          */
          style={{ left: 0, top: 0, width: 'auto', height: 'auto' }}
          dropAnimation={{ duration: 240, easing: 'cubic-bezier(.16,1,.3,1)' }}
        >
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
  const locale = useLocale();
  const isMeal = payload.kind === 'meal';
  // A meal's preview name was already localized when the drag started; a dish
  // dragged out of the catalog carries both names and is localized here.
  const name = isMeal ? payload.preview.dishName : localizedName(payload.dish, locale);
  const tags = isMeal ? payload.preview.tags : payload.dish.tags;
  const kcal = isMeal ? payload.preview.kcal : payload.kcal;

  /*
   * A lifted card keeps the size it had in its column; a dish lifted out of the
   * catalog cannot, because the row it came from is a full-width strip and the
   * thing it is about to become is a card. So the meal drag is measured and the
   * dish drag takes a card's own footprint instead — `w-44` and the board's own
   * `4.5rem` row floor, which is the smallest a real meal card is ever drawn.
   *
   * `size` is the *card's* rect now, not the grip's: see `setActivatorNodeRef`
   * in `meal-card.tsx`. That is what fixed lifted cards coming out smaller than
   * the cards they left.
   */
  const measured = isMeal && size ? { width: size.width, height: size.height } : undefined;

  return (
    /*
     * The thing under the pointer has to be the thing being moved.
     *
     * **Including when it comes from the catalog.** A dish drag used to render
     * as a name in a box with no figures and no rule — so dragging out of the
     * drawer produced an object that existed nowhere else in the product, and
     * the dietitian could not tell from it what they were about to drop. Both
     * kinds draw the same card now: name centred, coloured tag rule, calories
     * at the foot. The slot label and time are on neither, for the same reason
     * they are on no resting card — they belong to the row, and a card in
     * flight is between rows.
     *
     * No rotation and no scale. The card the pointer picked up has to be the
     * card it puts down, and a tilt is a second, smaller lie about what is
     * being moved. What says "lifted" is the shadow, which is what depth is for.
     */
    <div
      style={measured}
      className={cn(
        'planner-drag-preview flex cursor-grabbing flex-col overflow-hidden rounded-lg border border-primary bg-card shadow-overlay',
        !measured && 'min-h-[4.5rem] w-44',
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

      <span className="relative mt-1 flex shrink-0 items-baseline justify-center gap-2 px-2 pb-1.5 pt-2.5">
        <span
          aria-hidden
          className={cn('absolute start-4 end-4 top-0 h-[3px] rounded-full', dishTagAccentClass(tags))}
        />
        <span className="inline-flex items-baseline gap-1 text-body-sm font-semibold tabular-nums" dir="ltr">
          {kcal}
          <small className="text-caption font-normal text-muted-foreground">kcal</small>
        </span>
      </span>
    </div>
  );
}

/** The edits a card or column can trigger without a drag. */
export type EditorActions = {
  /**
   * Puts a dish in a slot without a drag.
   *
   * The same edit the drop handler runs, reachable by a click — which is what
   * the catalog inside the meal inspector needs, and what a keyboard has always
   * needed.
   */
  place: (mealId: string, dish: DishDetail, servings: number) => void;
  setServings: (mealId: string, servings: number) => void;
  /**
   * Moves one ingredient inside one meal.
   *
   * Takes the whole amount rather than a direction, because the arithmetic —
   * which unit, what step, what that is in grams — belongs to the control that
   * knows the line, not to a context that would have to look it up again.
   */
  setIngredient: (
    mealId: string,
    amount: {
      foodId: string;
      quantityGrams: number;
      portionId: string | null;
      portionQuantity: number | null;
    },
  ) => void;
  /** Puts a meal back on its dish's recipe, discarding hand-set amounts. */
  resetIngredients: (mealId: string) => void;
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
  /**
   * The draggable id — `meal:…` or `dish:…` — a finger is holding down on, for
   * the length of the press that is about to become a drag. Null on a mouse.
   */
  holdingId: string | null;
};

/**
 * Exported for the dev harness at `/{locale}/dev/meals`, which renders
 * `MealDetailPanel` outside a real board so the meal-quantity UI can be driven and
 * screenshotted without a staff session. Nothing in the product reads it directly;
 * use {@link useEditorActions}.
 */
export const EditorActionsContext = createContext<EditorActions | null>(null);

export function useEditorActions(): EditorActions {
  const value = useContext(EditorActionsContext);
  if (!value) throw new Error('useEditorActions must be used inside BoardEditor');
  return value;
}
