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
    data: { kind: 'meal', mealId: meal.id },
  });

  // Only light up for a drop that would actually land — a drag over its own
  // source slot changes nothing, and saying otherwise is a lie the pointer can
  // see.
  const wouldLand =
    isOver && dragging !== null && !(dragging.kind === 'meal' && dragging.mealId === meal.id);

  return (
    <div
      ref={setDropRef}
      className={cn(
        'group relative rounded-lg border transition-colors',
        selected ? 'border-primary ring-1 ring-primary' : 'border-border',
        meal.dish === null && 'border-dashed bg-muted/40',
        wouldLand && 'border-primary bg-primary/10',
        isDragging && 'opacity-40',
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
          'flex h-full w-full flex-col p-3 text-start',
          selected ? 'bg-primary/5' : 'hover:bg-accent/50',
        )}
      >
        <span className="flex items-baseline justify-between gap-1.5 text-caption text-muted-foreground">
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
            'mt-1 line-clamp-2 flex-1 text-body-sm font-medium leading-snug',
            meal.dish === null && 'font-normal text-muted-foreground',
          )}
        >
          {meal.dish ? meal.dish.nameAr : t('emptySlot')}
        </span>

        {meal.dish && !meal.dish.isActive && (
          <span className="mt-1 block text-caption text-muted-foreground">{t('retiredDish')}</span>
        )}

        <span className="mt-2 flex items-baseline justify-between gap-1.5">
          <span
            className={cn(
              'inline-flex items-baseline gap-1 text-body-sm font-semibold',
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
          </span>

          {meal.dish && meal.dish.servings !== 1 && (
            <span
              className="shrink-0 rounded-full bg-primary/10 px-2 text-caption font-semibold text-primary"
              dir="ltr"
            >
              ×{meal.dish.servings}
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
          className="absolute end-1 top-1 cursor-grab rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Icon name="dragHandle" className="size-3.5" />
        </span>
      )}
    </div>
  );
}
