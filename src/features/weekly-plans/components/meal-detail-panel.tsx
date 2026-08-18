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
  roundGrams,
  type NutrientKey,
} from '@/features/weekly-plans/nutrition';
import { localizedName, secondaryName } from '../food-display';
import { MAX_SERVINGS, MIN_SERVINGS, snapServings } from '../similar';
import { servingGuideFor, servingGuideLines, servingStepFor } from '../serving-guide';
import { dishTagAccentClass } from '../meal-tag-tone';

import { swapMealAction } from '../actions';
import { initialPlanActionState } from '../form-state';
import type { BoardMeal, CatalogEntry, SwapCandidate } from '../queries';
import type { RecentUse } from '../usage';

import { useEditorActions } from './board-dnd';
import { DishCatalog } from './dish-catalog';
import { MealIngredientAmounts } from './meal-ingredient-amounts';
import { ServingGuideList } from './serving-guide-list';

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
            {meal.dish ? localizedName(meal.dish, locale) : t('emptySlot')}
          </h3>
          {meal.dish && secondaryName(meal.dish, locale) && (
            <p className="text-caption text-muted-foreground" dir="auto">
              {secondaryName(meal.dish, locale)}
            </p>
          )}
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
        {meal.dish && <MealQuantity meal={meal} locale={locale} editable={editable} />}

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
            {/* The recipe, unchanged, one level down: this is what the nutrition
                is built from and what a dietitian checks the numbers against — but
                it is not the serving instruction, so it is not the card above. */}
            <Disclosure label={t('ingredients')}>
              <MealIngredientAmounts
                ingredients={meal.dish.ingredients}
                servings={meal.dish.servings}
                locale={locale}
              />
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

/**
 * How much of this meal to eat — as a serving instruction, not as a recipe and not
 * as a multiplier.
 *
 * Two wrong answers preceded this one. The first was `×2.25`, the raw `servings`
 * value: correct arithmetic, and meaningless to anyone who is not holding the base
 * recipe in their head. The second was the recipe itself, every line of it —
 * onion, oil, tomato paste, 2 g of cumin — which is a production list, not
 * something a person plates, and which buried the two numbers that matter under
 * nine that do not.
 *
 * What it states now is the dish's serving guide: **at most two lines**, written
 * per dish in `serving-guide.ts`. A dish with no guide states its weight and its
 * own serving label instead, because a guessed instruction is worse than a plain
 * one. The full recipe is still one disclosure below, for staff, where it is what
 * the arithmetic is checked against.
 *
 * The stepper is **not rendered at all** when the panel is read-only. It used to
 * render disabled, on the argument that a control which vanishes teaches nothing;
 * but on a published plan every quantity below it is a statement of what was
 * prescribed, and a greyed −/+ sitting on top of that reads as a thing that is
 * broken rather than a thing that is settled.
 */
function MealQuantity({
  meal,
  locale,
  editable,
}: {
  meal: BoardMeal;
  locale: string;
  editable: boolean;
}) {
  const t = useTranslations('weeklyPlans');
  const { setServings } = useEditorActions();
  const dish = meal.dish!;

  const kcal = roundForDisplay('kcal', meal.totals.kcal.value);
  const drift = driftState(kcal, meal.budgetKcal, MEAL_TOLERANCE);
  const totalGrams = t('totalGrams', { value: roundGrams(meal.grams, 5) });

  const guide = servingGuideFor(dish.slug);
  // The dish's own step where it has one — whole eggs step by one, a stew by half
  // — still snapped onto the global quarter grid so the stored value stays legal.
  const step = servingStepFor(guide);
  const lines = guide ? servingGuideLines(guide, dish.servings, locale) : [];

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pb-3">
        <h4 className="text-label font-semibold text-foreground">{t('mealQuantity')}</h4>
        {/* The whole meal's weight. On a read-only panel it is the only summary
            figure here, so it is stated rather than tucked beside a control. */}
        {!editable && (
          <span className="text-body-sm text-muted-foreground tabular-nums">{totalGrams}</span>
        )}
      </div>

      {editable && (
        <div className="flex items-center gap-3 pb-3">
          <Button
            type="button"
            variant="neutralGhost"
            size="icon-sm"
            className="rounded-md"
            aria-label={t('lessPortion')}
            disabled={dish.servings - step < MIN_SERVINGS}
            onClick={() => setServings(meal.id, snapServings(dish.servings - step))}
          >
            <span aria-hidden className="text-display-sm font-normal leading-none">−</span>
          </Button>

          {/*
            The stepper's readout is the meal's real weight, not the multiplier it
            is technically stepping. Both move together and only one of them is a
            quantity — and the guide underneath says what that weight looks like on
            a plate.
          */}
          <span className="min-w-24 text-center text-body-sm text-muted-foreground tabular-nums">
            {totalGrams}
          </span>

          <Button
            type="button"
            variant="neutralGhost"
            size="icon-sm"
            className="rounded-md"
            aria-label={t('morePortion')}
            disabled={dish.servings + step > MAX_SERVINGS}
            onClick={() => setServings(meal.id, snapServings(dish.servings + step))}
          >
            <span aria-hidden className="text-display-sm font-normal leading-none">+</span>
          </Button>
        </div>
      )}

      {lines.length > 0 ? (
        <ServingGuideList lines={lines} />
      ) : (
        /*
          No guide: the weight and the dish's own serving label, and nothing else.
          Not the recipe — "45 g onion, 10 g oil, 15 g tomato paste" is what the
          kitchen does, not what the patient is being told to eat, and printing it
          here is the mistake this card was corrected for.
        */
        <p className="text-body-sm text-muted-foreground" dir="auto">
          {/* The weight is already beside the stepper when there is one, so the
              fallback adds the serving label rather than repeating itself. */}
          {editable ? dish.baseServingLabel : `${totalGrams} · ${dish.baseServingLabel}`}
        </p>
      )}

      <p className={cn('mt-3 rounded-md bg-muted/70 px-3 py-2 text-body-sm', drift ? 'text-status-attention-fg' : 'text-muted-foreground')}>
        {t('kcalValue', { value: kcal })}
        {meal.budgetKcal > 0 && <> · {t('budget', { value: meal.budgetKcal })}</>}
      </p>
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
            <span className="block font-medium" dir="auto">{localizedName(option, locale)}</span>
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
            <span className="block font-medium" dir="auto">{localizedName(match.candidate, locale)}</span>
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
