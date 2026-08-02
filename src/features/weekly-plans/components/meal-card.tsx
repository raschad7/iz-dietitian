'use client';

import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

import { roundForDisplay } from '@/features/weekly-plans/nutrition';
import type { BoardMeal } from '../queries';
import { SERVING_STEP, snapServings } from '../similar';

import { useEditorActions } from './board-dnd';

/**
 * How far a meal may sit from its budget before the card says so.
 *
 * The same 15% band `similar.ts` uses for substitution — a meal that would not
 * count as a swap for its own slot is a meal worth a second look.
 */
const TOLERANCE = 0.15;

/** What the same slot held in the plan being compared against. */
export type GhostMeal = { nameAr: string; isRepeat: boolean };

/**
 * One meal in a day column.
 *
 * Both a drop target and a drag source: a dish arrives from the catalog, or a
 * dish already on the board moves here from another slot. The card itself is
 * still a button, because opening the detail panel is an action and has to be
 * reachable from the keyboard — the drag handle is separate so that dragging
 * never steals the click.
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
  const { setServings, clear, remove, dragging } = useEditorActions();

  const kcal = roundForDisplay('kcal', meal.totals.kcal.value);
  const drift = meal.budgetKcal > 0 ? (kcal - meal.budgetKcal) / meal.budgetKcal : 0;
  const offTarget = meal.dish !== null && Math.abs(drift) > TOLERANCE;

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

  // Only light up for a drop that would actually land — a drag over its own source
  // slot changes nothing, and saying otherwise is a lie the pointer can see.
  const wouldLand =
    isOver && dragging !== null && !(dragging.kind === 'meal' && dragging.mealId === meal.id);

  return (
    <div
      ref={setDropRef}
      className={cn(
        'rounded-md border transition-colors',
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
        className={cn(
          'w-full p-2 text-start text-xs',
          selected ? 'bg-primary/5' : 'hover:bg-accent/50',
        )}
      >
        <span className="flex items-baseline gap-1">
          <span className="min-w-0 flex-1 truncate text-[10px] uppercase tracking-wide text-muted-foreground">
            {meal.label}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground">{meal.timeOfDay}</span>
        </span>

        {meal.dish ? (
          <>
            <span className="mt-0.5 block font-medium leading-snug">{meal.dish.nameAr}</span>

            {!meal.dish.isActive && (
              <span className="mt-0.5 block text-[10px] text-muted-foreground">
                {t('retiredDish')}
              </span>
            )}

            <span className="mt-0.5 flex items-baseline gap-1 text-[10px] text-muted-foreground">
              <span className={cn(offTarget && 'font-medium text-status-attention-fg')}>
                {t('kcalValue', { value: kcal })}
              </span>
              {meal.budgetKcal > 0 && <span>/ {meal.budgetKcal}</span>}
            </span>
          </>
        ) : (
          <span className="mt-0.5 block leading-snug text-muted-foreground">{t('emptySlot')}</span>
        )}

        {ghost && (
          <span
            className={cn(
              'mt-1 block border-t border-dotted border-border pt-1 text-[10px]',
              ghost.isRepeat ? 'text-status-attention-fg' : 'text-muted-foreground',
            )}
          >
            {ghost.isRepeat
              ? `⟲ ${t('repeatedFromLastWeek', { date: compareDate ?? '' })}`
              : `← ${ghost.nameAr}`}
          </span>
        )}
      </button>

      {editable && (
        <div className="flex items-center gap-0.5 border-t border-border px-1 py-0.5">
          {meal.dish && (
            <>
              {/* A separate handle, so dragging never competes with the click that
                  opens the card. */}
              <span
                ref={setDragRef}
                {...listeners}
                {...attributes}
                aria-label={meal.dish.nameAr}
                className="cursor-grab px-1 text-[10px] leading-none text-muted-foreground"
              >
                ⠿
              </span>

              <Step
                label={t('lessPortion')}
                onClick={() => setServings(meal.id, snapServings(meal.dish!.servings - SERVING_STEP))}
                disabled={meal.dish.servings <= 0.25}
              >
                −
              </Step>

              <span className="min-w-6 text-center text-[10px] tabular-nums">
                {meal.dish.servings}
              </span>

              <Step
                label={t('morePortion')}
                onClick={() => setServings(meal.id, snapServings(meal.dish!.servings + SERVING_STEP))}
                disabled={meal.dish.servings >= 3}
              >
                +
              </Step>

              <Step label={t('clearMeal')} onClick={() => clear(meal.id)}>
                ×
              </Step>
            </>
          )}

          <Step
            label={t('removeMeal')}
            onClick={() => remove(meal.id)}
            className="ms-auto"
          >
            🗑
          </Step>
        </div>
      )}
    </div>
  );
}

function Step({
  label,
  onClick,
  disabled,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        'rounded px-1 text-[11px] leading-none text-muted-foreground hover:bg-accent disabled:opacity-30',
        className,
      )}
    >
      {children}
    </button>
  );
}
