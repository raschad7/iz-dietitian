'use client';

import * as React from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

import { MEAL_TOLERANCE, driftState } from '@/features/weekly-plans/drift';
import {
  NUTRIENT_KEYS,
  NUTRIENT_UNITS,
  roundForDisplay,
  type NutrientKey,
} from '@/features/weekly-plans/nutrition';
import { SERVING_STEP, snapServings } from '../similar';

import { swapMealAction } from '../actions';
import { initialPlanActionState } from '../form-state';
import type { BoardMeal, SwapCandidate } from '../queries';

import { useEditorActions } from './board-dnd';

/**
 * Everything about one meal: what it is, what it contains, why it was chosen, and
 * what could replace it.
 *
 * Occupies the same end-side rail as the context panel rather than a modal — the
 * dietitian compares a meal against the rest of the week while reading it, and a
 * dialog would cover the board they are comparing it to.
 */
export function MealDetailPanel({
  meal,
  candidates,
  planId,
  locale,
  editable,
  model,
  onClose,
  onBrowseDishes,
  embedded = false,
}: {
  meal: BoardMeal;
  candidates: readonly SwapCandidate[];
  planId: string;
  locale: string;
  editable: boolean;
  model?: string | null;
  onClose: () => void;
  onBrowseDishes: () => void;
  /** The anchored inspector owns the close button in its floating frame. */
  embedded?: boolean;
}) {
  const t = useTranslations('weeklyPlans');
  const { clear, remove } = useEditorActions();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className={cn('flex shrink-0 items-start justify-between gap-3 border-b border-border pb-3', embedded && 'pe-10')}>
        <div className="min-w-0">
          <p className="text-caption text-muted-foreground">
            {meal.label} · {meal.timeOfDay}
          </p>
          <h3 className="mt-1 font-heading text-heading-sm font-semibold leading-snug" dir="auto">
            {meal.dish ? meal.dish.nameAr : t('emptySlot')}
          </h3>
          {meal.dish && <p className="text-caption text-muted-foreground">{meal.dish.nameEn}</p>}
        </div>

        {!embedded && (
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            {t('close')}
          </Button>
        )}
      </div>

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pt-4">
        {meal.dish && <Portion meal={meal} editable={editable} />}

        {editable && meal.dish && (
          <section className="mt-5">
            <div className="flex items-baseline justify-between gap-2 pb-2">
              <h4 className="text-label font-semibold">{t('replacementOptions')}</h4>
              <span className="text-caption text-muted-foreground">{t('closestFirst')}</span>
            </div>

            {meal.options.length > 0 ? (
              <Alternatives meal={meal} planId={planId} locale={locale} />
            ) : (
              <SimilarDishes meal={meal} candidates={candidates} planId={planId} locale={locale} />
            )}

            <Button type="button" variant="outline" className="mt-3 w-full" onClick={onBrowseDishes}>
              {t('browseAllDishes')}
            </Button>
          </section>
        )}

        {meal.dish && (
          <div className="mt-4 border-t border-border">
            <Disclosure label={t('ingredients')}>
              <Ingredients meal={meal} />
            </Disclosure>
            <Disclosure label={t('nutrition')}>
              <Nutrients meal={meal} />
            </Disclosure>
            {meal.rationaleAr && (
              <Disclosure label={t('whyThisMeal')}>
                <Rationale text={meal.rationaleAr} />
              </Disclosure>
            )}
          </div>
        )}

        {model && <span className="sr-only">{t('generatedBy')} · {model}</span>}
      </div>

      {/*
       * Pinned to the panel, not parked at the end of the scroller.
       *
       * These two are the panel's only destructive controls and they were the
       * last thing in a column that also holds the replacement list, the
       * ingredients, the nutrition table and the model's rationale — so
       * emptying a slot meant scrolling past all of it, and on a short window
       * they sat below the fold with nothing indicating they existed. A footer
       * outside the scroller costs 60px of the list and makes them reachable
       * from wherever the panel happens to be scrolled to.
       *
       * `shrink-0` is load-bearing: the sibling above is `flex-1 min-h-0`, and
       * without it a long ingredient list would compress the footer rather than
       * scroll under it.
       */}
      {editable && (
        <section className="flex shrink-0 gap-3 border-t border-border pt-3">
          {meal.dish && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-w-0 flex-1"
              onClick={() => clear(meal.id)}
            >
              <Icon name="clearSlot" />
              {t('clearMeal')}
            </Button>
          )}
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="min-w-0 flex-1"
            onClick={() => remove(meal.id)}
          >
            <Icon name="trash" />
            {t('removeMeal')}
          </Button>
        </section>
      )}
    </div>
  );
}

function Disclosure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="group border-b border-border">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 text-label font-semibold text-muted-foreground outline-none focus-visible:text-foreground [&::-webkit-details-marker]:hidden">
        {label}
        <Icon name="chevronDown" className="size-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="pb-3">{children}</div>
    </details>
  );
}

function Portion({ meal, editable }: { meal: BoardMeal; editable: boolean }) {
  const t = useTranslations('weeklyPlans');
  const { setServings } = useEditorActions();
  const dish = meal.dish!;

  const kcal = roundForDisplay('kcal', meal.totals.kcal.value);
  const drift = driftState(kcal, meal.budgetKcal, MEAL_TOLERANCE);

  return (
    <section className="rounded-lg bg-muted/60 p-3">
      <h4 className="pb-2 text-label font-semibold text-muted-foreground">{t('portionLabel')}</h4>

      {/*
        The stepper holds its place on a published plan rather than being
        replaced by a line of text.

        Removing it meant the panel silently changed shape the moment a plan was
        published, and the only way to learn that portions were still adjustable
        was to find the "edit published" toggle by accident. Rendering it
        disabled says both things at once: this is the control, and it is not
        available yet. The design system asks for exactly this — and for the
        explanation to sit on a *wrapping* element, because
        `disabled:pointer-events-none` means a `title` on the button itself can
        never be hovered.
      */}
      <div
        className="flex items-center gap-3"
        title={editable ? undefined : t('editPublishedDisabled')}
      >
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={t('lessPortion')}
          disabled={!editable || dish.servings <= 0.25}
          onClick={() => setServings(meal.id, snapServings(dish.servings - SERVING_STEP))}
        >
          <Icon name="minus" />
        </Button>

        <span className="min-w-14 text-center text-heading-sm font-semibold tabular-nums" dir="ltr">
          ×{dish.servings}
        </span>

        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={t('morePortion')}
          disabled={!editable || dish.servings >= 3}
          onClick={() => setServings(meal.id, snapServings(dish.servings + SERVING_STEP))}
        >
          <Icon name="add" />
        </Button>

        <span className="ms-auto text-body-sm text-muted-foreground">
          {t('portion', { servings: dish.servings, label: dish.baseServingLabel })}
        </span>
      </div>

      <p className={cn('mt-2 border-t border-border pt-2 text-body-sm', drift ? 'text-status-attention-fg' : 'text-muted-foreground')}>
        {t('kcalValue', { value: kcal })}
        {meal.budgetKcal > 0 && <> · {t('budget', { value: meal.budgetKcal })}</>}
      </p>
    </section>
  );
}

/** The recipe, at the portion actually planned — not per base serving. */
function Ingredients({ meal }: { meal: BoardMeal }) {
  const t = useTranslations('weeklyPlans');
  const { servings, ingredients } = meal.dish!;

  return (
    <section>
      <ul className="flex flex-col gap-1 text-body-sm">
        {ingredients.map((ingredient) => (
          <li key={ingredient.food.id} className="flex justify-between gap-2">
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere] text-muted-foreground">
              {ingredient.food.description}
            </span>
            <span className="shrink-0 tabular-nums">
              {t('grams', { value: roundForDisplay('protein', ingredient.quantityGrams * servings) })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Nutrients({ meal }: { meal: BoardMeal }) {
  const t = useTranslations('weeklyPlans');
  const tNutrients = useTranslations('weeklyPlans.nutrients');

  return (
    <section>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-body-sm">
        {NUTRIENT_KEYS.map((key: NutrientKey) => {
          const total = meal.totals[key];

          return (
            <div key={key} className="flex justify-between gap-2">
              <dt className="truncate text-muted-foreground">{tNutrients(key)}</dt>
              <dd className="shrink-0 tabular-nums">
                {roundForDisplay(key, total.value)} {NUTRIENT_UNITS[key]}
                {/* "Not measured" is not zero, and a total built partly from
                    unmeasured foods is a floor rather than an answer. */}
                {total.unmeasured > 0 && (
                  <span className="text-muted-foreground" title={t('unmeasured')}>
                    {' '}
                    +
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

/**
 * The model's explanation, visually separated.
 *
 * Marked as the AI's words rather than presented as clinic copy: it is a suggestion
 * a dietitian may disagree with, and the page should not let it read as a clinical
 * claim the software is making.
 */
function Rationale({ text }: { text: string }) {
  return (
    <section>
      <p className="text-body-sm leading-relaxed">{text}</p>
    </section>
  );
}

function SwapButton({
  planId,
  mealId,
  dishId,
  servings,
  locale,
  children,
  flagged,
}: {
  planId: string;
  mealId: string;
  dishId: string;
  servings: number;
  locale: string;
  children: React.ReactNode;
  flagged?: boolean;
}) {
  const t = useTranslations('weeklyPlans');
  /*
   * The swap revalidates the board, so the new dish is simply *there* on the
   * next render — which is the problem this reports. A row quietly changing in
   * a panel the eye has already left is indistinguishable from nothing having
   * happened, and the failures were worse: the action's result used to be
   * thrown away entirely, so a swap refused for a published plan looked
   * exactly like a successful one.
   *
   * Awaited here rather than read back through `useActionState` and announced
   * from an effect: the announcement belongs to *this* submission, and an
   * effect watching a result object has to be keyed carefully to fire twice
   * for two identical outcomes. Awaiting has neither problem.
   */
  async function formAction(formData: FormData): Promise<void> {
    const state = await swapMealAction(initialPlanActionState, formData);
    if (state.status === 'done') {
      toast.success(t('mealReplaced'), {
        description: t('mealReplacedHint'),
      });
      return;
    }

    if (state.status === 'error') {
      toast.error(t(state.messageKey));
    }
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="mealId" value={mealId} />
      <input type="hidden" name="dishId" value={dishId} />
      <input type="hidden" name="servings" value={servings} />
      <SwapSubmit flagged={flagged}>
        <span className="min-w-0">{children}</span>
      </SwapSubmit>
    </form>
  );
}

function SwapSubmit({ children, flagged }: { children: React.ReactNode; flagged?: boolean }) {
  const { pending } = useFormStatus();
  const t = useTranslations('weeklyPlans');

  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border px-0 py-2.5 text-start text-body-sm transition-colors hover:bg-accent/60 disabled:opacity-50',
        flagged && 'border-status-attention-fg/40',
      )}
    >
      {children}
      <span className="rounded-md border border-primary px-2.5 py-1.5 font-semibold text-primary">
        {pending ? '…' : t('replaceMeal')}
      </span>
    </button>
  );
}

/** The alternatives the model offered, with an honest note when one is not a real swap. */
function Alternatives({ meal, planId, locale }: { meal: BoardMeal; planId: string; locale: string }) {
  const t = useTranslations('weeklyPlans');

  if (!meal.options.length) return null;

  return (
      <div className="border-t border-border">
        {meal.options.slice(0, 3).map((option) => (
          <SwapButton
            key={option.id}
            planId={planId}
            mealId={meal.id}
            dishId={option.dishId}
            servings={option.servings}
            locale={locale}
            flagged={!option.isSimilar}
          >
            <span className="block font-medium">{option.nameAr}</span>
            <span className="mt-0.5 block text-muted-foreground">
              {t('kcalValue', { value: roundForDisplay('kcal', option.kcal) })}
              {!option.isSimilar && (
                <span className="text-status-attention-fg"> · {t('offBudget')}</span>
              )}
            </span>
          </SwapButton>
        ))}
      </div>
  );
}

/**
 * The deterministic swap list.
 *
 * Distinct from the AI's alternatives on purpose: these are computed from the
 * catalog by calorie proximity, cost nothing, and are the same every time — so the
 * dietitian knows which suggestions came from a model and which from arithmetic.
 */
function SimilarDishes({
  meal,
  candidates,
  planId,
  locale,
}: {
  meal: BoardMeal;
  candidates: readonly SwapCandidate[];
  planId: string;
  locale: string;
}) {
  const t = useTranslations('weeklyPlans');

  if (!candidates.length) return null;

  return (
      <div className="border-t border-border">
        {candidates.slice(0, 3).map((match) => (
          <SwapButton
            key={match.candidate.id}
            planId={planId}
            mealId={meal.id}
            dishId={match.candidate.id}
            servings={match.servings}
            locale={locale}
          >
            <span className="block font-medium">{match.candidate.nameAr}</span>
            <span className="mt-0.5 block text-muted-foreground">
              {t('portionShort', { servings: match.servings })} ·{' '}
              {t('kcalValue', { value: roundForDisplay('kcal', match.kcal) })}
            </span>
          </SwapButton>
        ))}
      </div>
  );
}
