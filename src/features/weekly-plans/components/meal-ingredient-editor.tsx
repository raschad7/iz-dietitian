'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

import {
  MAX_INGREDIENT_GRAMS,
  nextIngredientAmount,
  primaryLines,
  type MealIngredientLine,
} from '../meal-ingredients';

import { useEditorActions } from './board-dnd';
import { IngredientRow, MealIngredientAmounts } from './meal-ingredient-amounts';

/**
 * The meal's ingredients, with a `−/+` on the ones a dietitian actually moves.
 *
 * This is what replaced the whole-dish stepper. That control multiplied every line
 * at once, which is arithmetically tidy and clinically wrong: raising the chicken
 * in a maqluba raised the eggplant, the oil and the pine nuts with it, and no
 * dietitian prescribes a meal that way. She sets the chicken in grams and the rice
 * in spoons, separately, and leaves the rest of the recipe alone.
 *
 * ## Two groups, and only one of them has controls
 *
 * Primary lines — `dish_ingredients.is_primary`, two or three per dish — carry the
 * controls and are set in the foreground. Everything else is listed underneath,
 * quiet and unadjustable, because it is context rather than instruction: a control
 * on the cumin is a control nobody will ever press, and putting one there would
 * bury the two that matter among nine that do not.
 *
 * A dish with nothing marked primary shows a plain list and no controls at all. That
 * is a data gap rather than a broken screen, and it degrades to exactly what the
 * panel showed before this existed.
 */
export function MealIngredientEditor({
  mealId,
  lines,
  locale,
  hasOwnAmounts,
}: {
  mealId: string;
  lines: readonly MealIngredientLine[];
  locale: string;
  /** True once amounts were set by hand, which is the only time "back to recipe" means anything. */
  hasOwnAmounts: boolean;
}) {
  const t = useTranslations('weeklyPlans');
  const { setIngredient, resetIngredients } = useEditorActions();

  const primary = primaryLines(lines);
  const rest = lines.filter((line) => !line.isPrimary);

  // Nothing is marked on this dish, so there is nothing to put a control on. The
  // plain list is the honest rendering, not a fallback that hides a problem.
  if (!primary.length) return <MealIngredientAmounts lines={lines} locale={locale} />;

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2 text-body-sm">
        {primary.map((line) => (
          <IngredientRow
            key={line.food.id}
            line={line}
            locale={locale}
            emphasis
            trailing={
              <span className="flex shrink-0 items-center gap-1">
                <Step
                  direction={-1}
                  label={t('lessIngredient')}
                  line={line}
                  onPress={(amount) => setIngredient(mealId, amount)}
                />
                <Step
                  direction={1}
                  label={t('moreIngredient')}
                  line={line}
                  onPress={(amount) => setIngredient(mealId, amount)}
                />
              </span>
            }
          />
        ))}
      </ul>

      {rest.length > 0 && (
        <div className="border-t border-border pt-3">
          <p className="pb-1.5 text-caption text-muted-foreground">{t('alsoContains')}</p>
          <MealIngredientAmounts lines={rest} locale={locale} />
        </div>
      )}

      {hasOwnAmounts && (
        <Button
          type="button"
          variant="neutralGhost"
          size="sm"
          className="self-start"
          onClick={() => resetIngredients(mealId)}
        >
          {t('backToRecipe')}
        </Button>
      )}
    </div>
  );
}

/**
 * One press.
 *
 * Disabled at the ends rather than clamped silently: the amount stops moving
 * either way, and a button that still depresses while nothing changes reads as a
 * broken control instead of a limit. The lower end is one step — an ingredient at
 * zero has been removed, not made smaller, and removing one is not this control's
 * job.
 */
function Step({
  direction,
  label,
  line,
  onPress,
}: {
  direction: -1 | 1;
  label: string;
  line: MealIngredientLine;
  onPress: (amount: ReturnType<typeof nextIngredientAmount>) => void;
}) {
  const next = nextIngredientAmount(line, direction);

  const disabled =
    direction === 1
      ? next.quantityGrams > MAX_INGREDIENT_GRAMS
      : next.quantityGrams >= line.quantityGrams;

  return (
    <Button
      type="button"
      variant="neutralGhost"
      size="icon-sm"
      className="rounded-md"
      aria-label={label}
      disabled={disabled}
      onClick={() => onPress(next)}
    >
      <span aria-hidden className="text-body font-normal leading-none">
        {direction === 1 ? '+' : '−'}
      </span>
    </Button>
  );
}
