'use client';

import { useCallback, type TouchEventHandler } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useLocale, useTranslations } from 'next-intl';

import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

import { MEAL_TOLERANCE, driftState } from '@/features/weekly-plans/drift';
import { roundForDisplay } from '@/features/weekly-plans/nutrition';
import { localizedName } from '../food-display';
import { dishTagAccentClass } from '../meal-tag-tone';
import type { BoardMeal } from '../queries';

import { useEditorActions } from './board-dnd';

/** What the same slot held in the plan being compared against. */
export type GhostMeal = { nameAr: string; nameEn: string; isRepeat: boolean };

/**
 * One meal in a day column.
 *
 * Information only. Every control that used to sit here — the stepper, clear,
 * remove — is in the detail panel this card opens, at a size the button spec
 * allows; five 16px targets on each of thirty-five cards was both unhittable
 * and the loudest thing on the board.
 *
 * Still both a drop target and a drag source: a dish arrives from the catalog,
 * or a dish already on the board moves here from another slot. The card is a
 * button, because opening the detail panel is an action and has to be reachable
 * from the keyboard.
 *
 * **How it is picked up depends on what is picking it up.** A mouse grabs the
 * grip in the leading corner, which stays separate so a drag can never steal the
 * click that opens the card, and stays hidden until the card is hovered because
 * a handle nobody can use is chrome. A finger holds the card itself for a
 * moment — there is no grip on a touch screen, because a hold cannot be confused
 * with the tap beneath it or the scroll around it, and a strip down the leading
 * edge was 2rem taken off the dish name on the one size that could least afford
 * it. See the listener split below.
 */
export function MealCard({
  meal,
  selected,
  onSelect,
  ghost,
  compareDate,
  editable,
}: {
  meal: BoardMeal;
  selected: boolean;
  onSelect: (anchor: HTMLButtonElement) => void;
  /** The same slot in the previous plan, when compare is on. */
  ghost?: GhostMeal | null;
  compareDate?: string;
  editable: boolean;
}) {
  const t = useTranslations('weeklyPlans');
  const locale = useLocale();
  const { dragging, settledMealId, holdingId } = useEditorActions();

  const kcal = roundForDisplay('kcal', meal.totals.kcal.value);
  const drift = meal.dish === null ? null : driftState(kcal, meal.budgetKcal, MEAL_TOLERANCE);

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `slot:${meal.id}`,
    disabled: !editable,
    data: { mealId: meal.id },
  });

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    setActivatorNodeRef,
    isDragging,
  } = useDraggable({
    id: `meal:${meal.id}`,
    disabled: !editable || meal.dish === null,
    data: {
      kind: 'meal',
      mealId: meal.id,
      preview: meal.dish
        ? {
            label: meal.label,
            timeOfDay: meal.timeOfDay,
            dishName: localizedName(meal.dish, locale),
            kcal,
            servings: meal.dish.servings,
            tags: meal.dish.tags,
          }
        : undefined,
    },
  });

  /*
   * ── The mouse grabs the grip; the finger holds the card ──
   *
   * dnd-kit hands back one listener per sensor — `onMouseDown`, `onTouchStart`,
   * `onKeyDown` — and they do not have to live on the same element. That is the
   * whole of the tablet change: the two pointer listeners stay on the grip,
   * where a mouse has always found them and where the keyboard sensor requires
   * them (it refuses any key press whose target is not the activator node), and
   * `onTouchStart` moves out to the card.
   *
   * So on a mouse nothing moved: the grip is still the only place a drag can
   * begin, and a click anywhere else still opens the detail panel. On glass the
   * whole card is the handle, held rather than grabbed — which is why the grip
   * stops being drawn there at all (see `globals.css`) and gives the dish name
   * back the 2rem strip it was renting.
   *
   * The tap survives the change. dnd-kit swallows the click that follows a
   * gesture it activated, so a hold that lifts the card cannot also open the
   * panel underneath it — and a hold too short to activate never suppresses
   * anything, so it stays an ordinary tap.
   */
  const { onTouchStart, ...pointerListeners } = listeners ?? {};

  // Only light up for a drop that would actually land — a drag over its own
  // source slot changes nothing, and saying otherwise is a lie the pointer can
  // see.
  const wouldLand =
    isOver && dragging !== null && !(dragging.kind === 'meal' && dragging.mealId === meal.id);
  const incomingName =
    dragging?.kind === 'meal'
      ? dragging.preview.dishName
      : dragging?.kind === 'dish'
        ? localizedName(dragging.dish, locale)
        : null;

  /*
   * No tip on the card, of any kind.
   *
   * The budget lived here as a `title` and then briefly as a real tooltip, and
   * the real one is what made the problem visible: thirty-five cards that each
   * raise a panel when the pointer crosses them turn an ordinary sweep across
   * the board into a trail of popups. The figure it carried is the same five
   * numbers repeated down every column, and it is already in the meal's detail
   * panel and in the rail's schedule — both places you go on purpose.
   */
  /*
   * **The draggable node is the card; the handle is only the activator.**
   *
   * `setNodeRef` used to sit on the grip, which made a 32px span the thing
   * dnd-kit was dragging — and `onDragStart` measures `active.rect` to size the
   * overlay, so the card under the pointer was sized from the grip and not from
   * the card. dnd-kit splits these on purpose: `setNodeRef` marks *what moves*
   * and `setActivatorNodeRef` marks *what you grab it by*. With the two
   * separated the lifted card is exactly the size of the card it came from, at
   * every column width, every time.
   *
   * Composed with the drop ref rather than replacing it: this element is both
   * ends of a drag — the thing you can pick up, and the thing another card can
   * land on.
   */
  const setCardRef = useCallback(
    (node: HTMLDivElement | null) => {
      setDropRef(node);
      setDragRef(node);
    },
    [setDropRef, setDragRef],
  );

  return (
    <div
      ref={setCardRef}
      // What `onDragStart` measures the lifted card against — see `board-dnd.tsx`.
      data-meal-card=""
      /*
        The touch activator, on the card rather than on the grip.

        No `touch-action: none` goes with it, and that is the point: the column
        under this card scrolls and the week beside it pans, so the finger has to
        keep both. A hold is the one gesture that costs the scroller nothing,
        because a finger that has not moved is not scrolling yet — see
        `HOLD_TO_DRAG_MS`.
      */
      onTouchStart={onTouchStart as TouchEventHandler<HTMLDivElement> | undefined}
      className={cn(
        'planner-meal-card group relative min-h-0 overflow-hidden rounded-lg border bg-card transition-[border-color,background-color,transform,opacity,box-shadow] duration-(--duration-sweep) ease-(--ease-sweep)',
        selected ? 'border-primary ring-1 ring-primary' : 'border-border',
        meal.dish === null && 'border-dashed bg-muted/40',
        wouldLand && 'scale-[1.01] border-primary bg-secondary shadow-elevated',
        isDragging && 'border-dashed bg-muted',
        settledMealId === meal.id && 'planner-drop-settled',
        holdingId === `meal:${meal.id}` && 'planner-holding',
      )}
    >
      <button
        type="button"
        onClick={(event) => onSelect(event.currentTarget)}
        aria-pressed={selected}
        className={cn(
          'flex h-full min-h-0 w-full flex-col text-start',
          selected ? 'bg-primary/5' : 'hover:bg-accent/50',
        )}
      >
        {/* No label and no time. They are the row's, not the card's — printed
            once in the slot rail rather than thirty-five times over the dish
            names they were competing with. What the card gets back is its whole
            top edge, which is why the name can now be the first thing on it.

            Centred, and flexing so the figures below pin to the card's
            block-end edge and every figure in a row shares a baseline. Clamped
            to two lines, or one long dish name sets the height of all
            thirty-five cards. */}
        {/* Two elements, because `line-clamp-2` compiles to `display:
            -webkit-box` — the clamped element cannot also be a flex container,
            so the centring has to happen on a wrapper around it. The wrapper
            takes the free space and centres the name in it; the name keeps the
            clamp. A one-line name now sits in the middle of the card instead of
            hanging off its top edge. */}
        <span className="flex min-h-0 flex-1 items-center justify-center px-2 pt-2">
          <span
            className={cn(
              'line-clamp-2 text-center font-heading text-body-md font-medium leading-snug [text-wrap:balance]',
              meal.dish === null && 'font-normal text-muted-foreground',
            )}
          >
            {meal.dish ? localizedName(meal.dish, locale) : t('emptySlot')}
          </span>
        </span>

        {meal.dish && !meal.dish.isActive && (
          <span className="mt-1 block text-caption text-muted-foreground">{t('retiredDish')}</span>
        )}

        {/* The figures, on the card rather than on a shelf. The tinted band and
            its hairline are gone: with the metadata row gone too, the card is
            one surface with a name at the top and its numbers at the foot, and
            a second fill inside it only cut the card in half.

            The figure sits a step *below* the dish name, not two above it. At
            `text-heading-sm` in the display face it was the loudest thing on a
            board of thirty-five cards, and the card is about the dish. 14px is
            the dense-table step, and the UI face is where the tabular figures
            actually live. */}
        {/* One figure at the foot, centred under the name.
            The dish's total weight used to sit opposite it. It is a number
            nobody plans against — the target is calories, the portion is set by
            ingredient in the detail panel — and printing it on all thirty-five
            cards made every card a two-column table whose second column was
            never read. With it gone the calories stop being pushed to one edge
            and sit under the dish they belong to. */}
        <span className="relative mt-1 flex shrink-0 items-baseline justify-center gap-2 px-2 pb-1.5 pt-2.5">
          <span
            aria-hidden
            className={cn(
              'absolute start-4 end-4 top-0 h-[3px] rounded-full',
              meal.dish ? dishTagAccentClass(meal.dish.tags) : 'bg-border',
            )}
          />
          <span
            className={cn(
              'inline-flex items-baseline gap-1 text-body-sm font-semibold tabular-nums',
              drift !== null && 'text-status-attention-fg',
              meal.dish === null && 'font-normal text-muted-foreground',
            )}
          >
            {drift !== null && (
              <Icon
                name={drift === 'over' ? 'driftUp' : 'driftDown'}
                className="size-3.5 self-center"
                label={t(drift === 'over' ? 'overBudget' : 'underBudget')}
              />
            )}
            <span dir="ltr">{meal.dish ? kcal : '—'}</span>
            {meal.dish && (
              <small className="text-caption font-normal text-muted-foreground">kcal</small>
            )}
          </span>
        </span>

        {ghost && (
          <span
            className={cn(
              'mt-2 flex items-center gap-1 border-t border-dotted border-border pt-1.5 text-caption',
              ghost.isRepeat ? 'text-status-attention-fg' : 'text-muted-foreground',
            )}
          >
            {ghost.isRepeat ? (
              <>
                <Icon name="repeat" className="size-3.5" />
                {t('repeatedFromLastWeek', { date: compareDate ?? '' })}
              </>
            ) : (
              localizedName(ghost, locale)
            )}
          </span>
        )}
      </button>

      {/* A separate handle, so dragging never competes with the click that opens
          the card. dnd-kit's `attributes` carry `role="button"` and `tabIndex`,
          so this span is focusable and the keyboard sensor can reach it — which
          is why it has to reappear on focus as well as on hover.

          It carries the mouse and keyboard activators only; the finger's is on
          the card itself. On a coarse pointer the grip is not drawn and cannot
          be touched — it stays in the DOM, and in the tab order, because a
          tablet with a keyboard attached is still a keyboard. */}
      {editable && meal.dish && (
        <span
          ref={setActivatorNodeRef}
          {...pointerListeners}
          {...attributes}
          aria-label={localizedName(meal.dish, locale)}
          /*
            `start`, not `end` — the leading corner of the card.

            In Arabic that is the top right, which is where the reader's eye
            enters the card and where every other leading affordance in this app
            sits; `end` put it at the top left, the corner an RTL reader arrives
            at last. It mirrors to the top left in English for the same reason,
            so the grip is always the first thing in the card rather than always
            on one physical side.
          */
          /*
            `max-md:opacity-100` is gone with the coarse-pointer strip it was
            half of. It made the grip permanent on every narrow screen, which is
            the case that no longer has a grip: below `md` the pointer is a
            finger and the gesture is a hold. What is left is the mouse's rule —
            invisible until the card is hovered or the grip itself is focused.
          */
          className="planner-drag-handle absolute start-0.5 top-0.5 z-30 cursor-grab rounded-full p-1.5 text-muted-foreground opacity-0 transition-[opacity,background-color,color] hover:bg-secondary hover:text-primary active:cursor-grabbing group-hover:opacity-100 focus-visible:bg-secondary focus-visible:text-primary focus-visible:opacity-100"
        >
          <Icon name="dragHandle" className="size-5" />
        </span>
      )}

      {isDragging && (
        <span className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-muted/95 px-3 text-center text-label font-semibold text-muted-foreground">
          {t('originalPosition')}
        </span>
      )}

      {wouldLand && incomingName && (
        <span className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-secondary/95 px-3 text-center">
          <span>
            <span className="block text-caption font-semibold text-primary">
              {meal.dish ? t('swapWith') : t('moveHere')}
            </span>
            <strong className="mt-1 block font-heading text-body-sm leading-relaxed" dir="auto">
              {incomingName}
            </strong>
          </span>
        </span>
      )}
    </div>
  );
}

/**
 * A presentational copy of the selected card rendered above the inspector's
 * blurred backdrop. It deliberately has no controls or DnD registration: the
 * real card remains the anchor and receives focus again when the inspector
 * closes.
 */
export function MealCardSnapshot({ meal }: { meal: BoardMeal }) {
  const t = useTranslations('weeklyPlans');
  const locale = useLocale();
  const kcal = roundForDisplay('kcal', meal.totals.kcal.value);
  const drift = meal.dish === null ? null : driftState(kcal, meal.budgetKcal, MEAL_TOLERANCE);

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-lg border border-primary bg-card text-start ring-2 ring-primary shadow-elevated">
      <span className="flex min-h-0 flex-1 items-center justify-center px-2 pt-2">
        <span
          className={cn(
            'line-clamp-2 text-center font-heading text-body-md font-medium leading-snug [text-wrap:balance]',
            meal.dish === null && 'font-normal text-muted-foreground',
          )}
          dir="auto"
        >
          {meal.dish ? localizedName(meal.dish, locale) : t('emptySlot')}
        </span>
      </span>

      <span className="relative mt-1 flex shrink-0 items-baseline justify-center gap-2 px-2 pb-1.5 pt-2.5">
        <span
          aria-hidden
          className={cn(
            'absolute start-4 end-4 top-0 h-[3px] rounded-full',
            meal.dish ? dishTagAccentClass(meal.dish.tags) : 'bg-border',
          )}
        />
        <span
          className={cn(
            'inline-flex items-baseline gap-1 text-body-sm font-semibold tabular-nums',
            drift !== null && 'text-status-attention-fg',
            meal.dish === null && 'font-normal text-muted-foreground',
          )}
        >
          <span dir="ltr">{meal.dish ? kcal : '—'}</span>
          {meal.dish && <small className="text-caption font-normal text-muted-foreground">kcal</small>}
        </span>
      </span>
    </div>
  );
}
