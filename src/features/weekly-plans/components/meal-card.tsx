'use client';

import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useLocale, useTranslations } from 'next-intl';

import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

import { MEAL_TOLERANCE, driftState } from '@/features/weekly-plans/drift';
import { roundForDisplay, roundGrams } from '@/features/weekly-plans/nutrition';
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
  onSelect: (anchor: HTMLButtonElement) => void;
  /** The same slot in the previous plan, when compare is on. */
  ghost?: GhostMeal | null;
  compareDate?: string;
  editable: boolean;
}) {
  const t = useTranslations('weeklyPlans');
  const locale = useLocale();
  const { dragging, settledMealId } = useEditorActions();

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
            dishName: localizedName(meal.dish, locale),
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
        ? localizedName(dragging.dish, locale)
        : null;

  return (
    <div
      ref={setDropRef}
      className={cn(
        'group relative min-h-0 overflow-hidden rounded-lg border bg-card transition-[border-color,background-color,transform,opacity,box-shadow] duration-(--duration-sweep) ease-(--ease-sweep)',
        selected ? 'border-primary ring-1 ring-primary' : 'border-border',
        meal.dish === null && 'border-dashed bg-muted/40',
        wouldLand && 'scale-[1.01] border-primary bg-secondary shadow-elevated',
        isDragging && 'border-dashed bg-muted',
        settledMealId === meal.id && 'planner-drop-settled',
      )}
    >
      <button
        type="button"
        onClick={(event) => onSelect(event.currentTarget)}
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
        <span
          className={cn(
            'relative mt-1 flex shrink-0 items-baseline justify-between gap-2 px-2 pb-1.5 pt-2.5',
          )}
        >
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

          {meal.dish && (
            <span className="shrink-0 text-caption text-muted-foreground tabular-nums">
              {t('totalGrams', { value: roundGrams(meal.grams, 5) })}
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
              localizedName(ghost, locale)
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
          aria-label={localizedName(meal.dish, locale)}
          // `top-1`, not `top-7`. The old offset cleared the metadata row that
          // used to sit above the dish name; with that row in the slot rail the
          // handle would have floated in the middle of the name it belongs to.
          className="planner-drag-handle absolute end-0.5 top-0.5 z-30 cursor-grab rounded-full p-1.5 text-muted-foreground opacity-0 transition-[opacity,background-color,color] hover:bg-secondary hover:text-primary active:cursor-grabbing group-hover:opacity-100 focus-visible:bg-secondary focus-visible:text-primary focus-visible:opacity-100 max-md:opacity-100"
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

      <span
        className={cn(
          'relative mt-1 flex shrink-0 items-baseline justify-between gap-2 px-2 pb-1.5 pt-2.5',
        )}
      >
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

        {meal.dish && (
          <span className="text-caption text-muted-foreground tabular-nums">
            {t('totalGrams', { value: roundGrams(meal.grams, 5) })}
          </span>
        )}
      </span>
    </div>
  );
}
