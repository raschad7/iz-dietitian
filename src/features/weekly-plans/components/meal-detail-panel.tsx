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
  dishGrams,
  roundForDisplay,
  roundGrams,
  type NutrientKey,
} from '@/features/weekly-plans/nutrition';
import { SERVING_STEP, snapServings } from '../similar';
import { dishTagAccentClass } from '../meal-tag-tone';

import { swapMealAction } from '../actions';
import { initialPlanActionState } from '../form-state';
import type { BoardMeal, CatalogEntry, SwapCandidate } from '../queries';
import type { RecentUse } from '../usage';

import { useEditorActions } from './board-dnd';
import { DishCatalog } from './dish-catalog';

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
  catalog,
  usage,
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
  /** The whole catalog, so an empty slot can be filled without leaving the panel. */
  catalog: readonly CatalogEntry[];
  usage: Record<string, RecentUse>;
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
  const { clear, place, remove } = useEditorActions();

  /*
   * An empty slot opens straight onto the catalog.
   *
   * The panel used to answer the click with a title, a short list and a button
   * that opened the catalog *somewhere else* — two steps and two surfaces to
   * answer the only question an empty slot asks. The catalog already defaults
   * its filters to the open slot's meal type and ranks by fit to its budget, so
   * dropping it in here loses nothing and removes the step: click the slot, pick
   * the dish, done. Filling it closes the panel, because the question is
   * answered.
   */
  if (editable && !meal.dish) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className={cn('shrink-0 border-b border-border px-5 pb-4 pt-5', embedded && 'pe-14')}>
          <p className="text-caption text-muted-foreground">
            {meal.label} · {meal.timeOfDay}
          </p>
          <h3 className="mt-1 font-heading text-heading-sm font-semibold leading-snug">
            {t('fillSlot')}
          </h3>
        </div>

        <div className="min-h-0 flex-1 px-5 py-3">
          <DishCatalog
            catalog={catalog}
            usage={usage}
            slot={{ slotKey: meal.slotKey, budgetKcal: meal.budgetKcal }}
            editable={editable}
            onPick={(dish, servings) => {
              place(meal.id, dish, servings);
              onClose();
            }}
          />
        </div>

        <section className="flex shrink-0 gap-3 border-t border-border bg-muted/45 px-5 py-3">
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
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className={cn('relative flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 pb-4 pt-5', embedded && 'pe-14')}>
        <div className="min-w-0">
          <p className="text-caption text-muted-foreground">
            {meal.label} · {meal.timeOfDay}
          </p>
          <h3 className="mt-1 font-heading text-heading-sm font-medium leading-snug" dir="auto">
            {meal.dish ? meal.dish.nameAr : t('emptySlot')}
          </h3>
          {meal.dish && <p className="text-caption text-muted-foreground">{meal.dish.nameEn}</p>}
          {meal.dish && (
            <span
              aria-hidden
              className={cn('mt-3 block h-1 w-20 rounded-full', dishTagAccentClass(meal.dish.tags))}
            />
          )}
        </div>

        {!embedded && (
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            {t('close')}
          </Button>
        )}
      </div>

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-5 py-4">
        {meal.dish && <Portion meal={meal} editable={editable} />}

        {/* Only a filled slot gets here: an empty one is answered by the catalog
            above, which is the same question asked earlier. */}
        {editable && meal.dish && (
          <section className="mt-6">
            <div className="flex items-baseline justify-between gap-2 pb-2">
              <h4 className="text-label font-semibold">{t('replacementOptions')}</h4>
              <span className="text-caption text-muted-foreground">{t('closestFirst')}</span>
            </div>

            {meal.options.length > 0 ? (
              <Alternatives meal={meal} planId={planId} locale={locale} />
            ) : (
              <SimilarDishes meal={meal} candidates={candidates} planId={planId} locale={locale} />
            )}

            <Button
              type="button"
              variant="default"
              className="mt-4 w-full max-w-none"
              onClick={onBrowseDishes}
            >
              <Icon name="dishes" />
              {t('browseAllDishes')}
            </Button>
          </section>
        )}

        {meal.dish && (
          <div className="mt-5 border-t border-border">
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
        <section className="flex shrink-0 gap-2 border-t border-border bg-muted/45 px-5 py-3">
          {meal.dish && (
            <Button
              type="button"
              variant="neutral"
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
    <section className="rounded-lg border border-border bg-card p-4 shadow-card">
      <h4 className="pb-3 text-label font-semibold text-foreground">{t('portionLabel')}</h4>

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
          variant="neutralGhost"
          size="icon-sm"
          className="rounded-md"
          aria-label={t('lessPortion')}
          disabled={!editable || dish.servings <= 0.25}
          onClick={() => setServings(meal.id, snapServings(dish.servings - SERVING_STEP))}
        >
          <span aria-hidden className="text-display-sm font-normal leading-none">−</span>
        </Button>

        <span className="min-w-20 text-center text-display-sm font-normal tabular-nums" dir="ltr">
          ×{dish.servings}
        </span>

        <Button
          type="button"
          variant="neutralGhost"
          size="icon-sm"
          className="rounded-md"
          aria-label={t('morePortion')}
          disabled={!editable || dish.servings >= 3}
          onClick={() => setServings(meal.id, snapServings(dish.servings + SERVING_STEP))}
        >
          <span aria-hidden className="text-display-sm font-normal leading-none">+</span>
        </Button>

        {/*
          The real weight at the chosen serving, not "×1.5 of a portion" — a
          figure the dietitian works in. The stepper beside it still shows the
          multiplier it is the control for; this is its result.
        */}
        <span className="ms-auto text-body-sm text-muted-foreground tabular-nums">
          {t('totalGrams', { value: roundGrams(dishGrams(dish.ingredients, dish.servings), 5) })}
        </span>
      </div>

      <p className={cn('mt-3 rounded-md bg-muted/70 px-3 py-2 text-body-sm', drift ? 'text-status-attention-fg' : 'text-muted-foreground')}>
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

function SwapSubmit({
  children,
  flagged,
}: {
  children: React.ReactNode;
  flagged?: boolean;
}) {
  const { pending } = useFormStatus();
  const t = useTranslations('weeklyPlans');

  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        'grid min-h-16 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md px-3 py-2.5 text-start text-body-sm transition-colors hover:bg-accent/70 disabled:opacity-50',
        flagged && 'ring-1 ring-inset ring-status-attention-fg/30',
      )}
    >
      {children}
      <span className="inline-flex items-center gap-1 font-semibold text-primary">
        {pending ? '…' : t('replaceMeal')}
        {!pending && <Icon name="chevronEnd" className="size-4" />}
      </span>
    </button>
  );
}

/** The alternatives the model offered, with an honest note when one is not a real swap. */
function Alternatives({ meal, planId, locale }: { meal: BoardMeal; planId: string; locale: string }) {
  const t = useTranslations('weeklyPlans');

  if (!meal.options.length) return null;

  return (
      <div className="grid gap-1">
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
      <div className="grid gap-1">
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
            {/* Kcal only, like the AI alternatives above: a swap candidate carries
                no ingredient rows, so its weight cannot be derived here, and its
                energy against the slot budget is the figure that matters anyway. */}
            <span className="mt-0.5 block text-muted-foreground">
              {t('kcalValue', { value: roundForDisplay('kcal', match.kcal) })}
            </span>
          </SwapButton>
        ))}
      </div>
  );
}
