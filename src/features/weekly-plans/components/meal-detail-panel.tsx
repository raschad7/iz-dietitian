'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import {
  NUTRIENT_KEYS,
  NUTRIENT_UNITS,
  roundForDisplay,
  type NutrientKey,
} from '@/features/meal-plans/nutrition';

import { swapMealAction } from '../actions';
import { initialPlanActionState } from '../form-state';
import type { BoardMeal, SwapCandidate } from '../queries';

import { RegenerateMealButton } from './regenerate-buttons';

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
  onClose,
}: {
  meal: BoardMeal;
  candidates: readonly SwapCandidate[];
  planId: string;
  locale: string;
  editable: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('weeklyPlans');

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            {meal.label} · {meal.timeOfDay}
          </p>
          <h3 className="mt-0.5 text-base font-semibold leading-tight">
            {meal.dish ? meal.dish.nameAr : t('emptySlot')}
          </h3>
          {meal.dish && <p className="text-xs text-muted-foreground">{meal.dish.nameEn}</p>}
        </div>

        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          {t('close')}
        </Button>
      </div>

      {meal.dish && (
        <>
          <Portion meal={meal} />
          <Ingredients meal={meal} />
          <Nutrients meal={meal} />
        </>
      )}

      {meal.rationaleAr && <Rationale text={meal.rationaleAr} />}

      {editable && (
        <>
          <Alternatives meal={meal} planId={planId} locale={locale} />
          <SimilarDishes meal={meal} candidates={candidates} planId={planId} locale={locale} />

          <section className="border-t border-border pt-3">
            <h4 className="pb-1.5 text-xs font-semibold text-muted-foreground">
              {t('regenerateMeal')}
            </h4>
            <RegenerateMealButton planId={planId} mealId={meal.id} locale={locale} />
          </section>
        </>
      )}
    </div>
  );
}

function Portion({ meal }: { meal: BoardMeal }) {
  const t = useTranslations('weeklyPlans');
  const kcal = roundForDisplay('kcal', meal.totals.kcal.value);

  return (
    <section className="rounded-md bg-muted/50 p-2.5 text-xs">
      <p>
        {t('portion', { servings: meal.dish!.servings, label: meal.dish!.baseServingLabel })}
      </p>
      <p className="mt-1 text-muted-foreground">
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
      <h4 className="pb-1.5 text-xs font-semibold text-muted-foreground">
        {t('ingredients')}
      </h4>

      <ul className="flex flex-col gap-1 text-xs">
        {ingredients.map((ingredient) => (
          <li key={ingredient.food.id} className="flex justify-between gap-2">
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
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
  const tNutrients = useTranslations('mealPlans.nutrients');

  return (
    <section>
      <h4 className="pb-1.5 text-xs font-semibold text-muted-foreground">
        {t('nutrition')}
      </h4>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
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
  const t = useTranslations('weeklyPlans');

  return (
    <section className="border-s-2 border-primary/40 ps-2.5">
      <h4 className="text-xs font-semibold text-muted-foreground">
        {t('whyThisMeal')}
      </h4>
      <p className="mt-1 text-xs leading-relaxed">{text}</p>
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
  const [, formAction] = useActionState(swapMealAction, initialPlanActionState);

  return (
    <form action={formAction}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="mealId" value={mealId} />
      <input type="hidden" name="dishId" value={dishId} />
      <input type="hidden" name="servings" value={servings} />
      <SwapSubmit flagged={flagged}>{children}</SwapSubmit>
    </form>
  );
}

function SwapSubmit({ children, flagged }: { children: React.ReactNode; flagged?: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        'w-full rounded-md border border-border p-2 text-start text-xs transition-colors hover:bg-accent/60 disabled:opacity-50',
        flagged && 'border-status-attention-fg/40',
      )}
    >
      {children}
    </button>
  );
}

/** The alternatives the model offered, with an honest note when one is not a real swap. */
function Alternatives({ meal, planId, locale }: { meal: BoardMeal; planId: string; locale: string }) {
  const t = useTranslations('weeklyPlans');

  if (!meal.options.length) return null;

  return (
    <section>
      <h4 className="pb-1.5 text-xs font-semibold text-muted-foreground">
        {t('aiAlternatives')}
      </h4>

      <div className="flex flex-col gap-1.5">
        {meal.options.map((option) => (
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
    </section>
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
    <section>
      <h4 className="pb-1.5 text-xs font-semibold text-muted-foreground">
        {t('similarDishes')}
      </h4>

      <div className="flex flex-col gap-1.5">
        {candidates.slice(0, 6).map((match) => (
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
    </section>
  );
}
