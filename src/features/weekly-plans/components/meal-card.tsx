'use client';

import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useTranslations } from 'next-intl';

import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

import { MEAL_TOLERANCE, driftState } from '@/features/weekly-plans/drift';
import { roundForDisplay } from '@/features/weekly-plans/nutrition';
import type { BoardMeal } from '../queries';

import { useEditorActions } from './board-dnd';

/** What the same slot held in the plan being compared against. */
export type GhostMeal = { nameAr: string; isRepeat: boolean };

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
 * from the keyboard. The drag handle stays separate so dragging never steals
 * that click, and fades in on hover because dragging is a pointer gesture and a
 * handle nobody can use is chrome.
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
  onSelect: () => void;
  /** The same slot in the previous plan, when compare is on. */
  ghost?: GhostMeal | null;
  compareDate?: string;
  editable: boolean;
}) {
  const t = useTranslations('weeklyPlans');
  const { dragging } = useEditorActions();

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
            dishName: meal.dish.nameAr,
            kcal,
            servings: meal.dish.servings,
          }
        : undefined,
    },
  });

  // Only light up for a drop that would actually land — a drag over its own
  // source slot changes nothing, and saying otherwise is a lie the pointer can
  // see.
  const wouldLand =
    isOver && dragging !== null && !(dragging.kind === 'meal' && dragging.mealId === meal.id);
  const incomingName =
    dragging?.kind === 'meal'
      ? dragging.preview.dishName
      : dragging?.kind === 'dish'
        ? dragging.dish.nameAr
        : null;

  return (
    <div
      ref={setDropRef}
      className={cn(
        'group relative min-h-0 overflow-hidden rounded-lg rounded-ee-4xl border bg-card transition-[border-color,background-color,transform,opacity,box-shadow] duration-(--duration-sweep) ease-(--ease-sweep)',
        selected ? 'border-primary ring-1 ring-primary' : 'border-border',
        meal.dish === null && 'border-dashed bg-muted/40',
        wouldLand && '-translate-y-1 border-primary bg-secondary shadow-elevated',
        dragging && !isDragging && !wouldLand && 'opacity-70',
        isDragging && 'border-dashed bg-muted',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        // The budget is not printed on the card — it is the same five figures
        // repeated down every column. It stays reachable here, in the detail
        // panel, and in the rail's schedule.
        title={meal.budgetKcal > 0 ? t('budgetHint', { value: meal.budgetKcal }) : undefined}
        className={cn(
          'flex h-full min-h-0 w-full flex-col text-start',
          selected ? 'bg-primary/5' : 'hover:bg-accent/50',
        )}
      >
        <span className="flex shrink-0 items-baseline justify-between gap-1.5 px-3 pt-2.5 text-caption text-muted-foreground">
          <span className="min-w-0 truncate">{meal.label}</span>
          <span className="shrink-0" dir="ltr">
            {meal.timeOfDay}
          </span>
        </span>

        {/* Flexes, so the footer below pins to the card's block-end edge and
            every figure in a row shares a baseline. Clamped to two lines, or
            one long dish name sets the height of all thirty-five cards. */}
        <span
          className={cn(
            'mt-1.5 line-clamp-2 min-h-11 flex-1 px-3 font-heading text-body-md font-semibold leading-relaxed [text-wrap:pretty]',
            meal.dish === null && 'font-normal text-muted-foreground',
          )}
        >
          {meal.dish ? meal.dish.nameAr : t('emptySlot')}
        </span>

        {meal.dish && !meal.dish.isActive && (
          <span className="mt-1 block text-caption text-muted-foreground">{t('retiredDish')}</span>
        )}

        <span className="mt-2 flex shrink-0 items-baseline justify-between gap-2 border-t border-border/70 bg-muted/70 px-3 py-2.5">
          <span
            className={cn(
              'inline-flex items-baseline gap-1 font-heading text-heading-sm font-semibold tabular-nums',
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
              <small className="font-sans text-caption font-normal text-muted-foreground">kcal</small>
            )}
          </span>

          {meal.dish && (
            <span
              className="shrink-0 text-caption text-muted-foreground"
            >
              {t('portionShort', { servings: meal.dish.servings })}
            </span>
          )}
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
              ghost.nameAr
            )}
          </span>
        )}
      </button>

      {/* A separate handle, so dragging never competes with the click that opens
          the card. dnd-kit's `attributes` carry `role="button"` and `tabIndex`,
          so this span is focusable and the keyboard sensor can reach it — which
          is why it has to reappear on focus as well as on hover. */}
      {editable && meal.dish && (
        <span
          ref={setDragRef}
          {...listeners}
          {...attributes}
          aria-label={meal.dish.nameAr}
          className="absolute end-1 top-7 z-30 cursor-grab rounded-full p-1.5 text-muted-foreground opacity-0 transition-[opacity,background-color,color] hover:bg-secondary hover:text-primary group-hover:opacity-100 focus-visible:bg-secondary focus-visible:text-primary focus-visible:opacity-100 max-md:opacity-100"
        >
          <Icon name="dragHandle" className="size-3.5" />
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
