'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';

import { localizedName } from '../food-display';
import {
  MAX_INGREDIENT_GRAMS,
  nextIngredientAmount,
  primaryLines,
  type MealIngredientLine,
} from '../meal-ingredients';

import { useEditorActions } from './board-dnd';
import { IngredientAmount, MealIngredientAmounts } from './meal-ingredient-amounts';

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

  /*
   * Only the *main's* primary lines get a stepper.
   *
   * A side is a whole dish standing beside the meal at one serving, and the
   * server has no write that changes an amount inside one: `setMealIngredient`
   * resolves the main's lines and refuses a food it does not find among them.
   * Without this filter a salad's tomato would be offered a `−/+` that either
   * did nothing or moved the main's tomato instead. The side's lines still
   * appear below, read-only and grouped under their dish's name.
   */
  const primary = primaryLines(lines.filter((line) => line.side === null));
  const rest = lines.filter((line) => !line.isPrimary || line.side !== null);

  // Nothing is marked on this dish, so there is nothing to put a control on. The
  // plain list is the honest rendering, not a fallback that hides a problem.
  if (!primary.length) return <MealIngredientAmounts lines={lines} locale={locale} />;

  return (
    <div className="flex flex-col gap-3">
      {/*
        Each adjustable line is its own row, and the amount sits *between* the
        two buttons rather than off at the end of the line.

        It used to borrow the read-only row: a 14px name, a 14px amount, and two
        32px ghost buttons carrying a typographic `−` and `+` at 16px. Three
        problems in one control. The buttons read as text rather than as
        targets, since a ghost button has no box until it is hovered and these
        never sat still long enough to be hovered; the glyphs were smaller than
        the labels around them, on the one control in the panel a dietitian
        presses over and over; and the number they changed was two elements away
        from them, so nothing said which figure a press would move.

        A stepper says it in one shape: `[−] 150 غ [+]`, the buttons white on a
        tinted well so they are visibly pressable at rest, the figure between
        them at body size with `min-w` enough for "13 ملعقة كبيرة" so the
        buttons do not shuffle sideways as it changes.
      */}
      <ul className="flex flex-col gap-2">
        {primary.map((line) => (
          <li
            key={line.food.id}
            className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
          >
            <span
              className="min-w-0 flex-1 text-body-md [overflow-wrap:anywhere]"
              dir="auto"
            >
              {localizedName(line.food, locale)}
            </span>

            <span className="flex shrink-0 items-center gap-1 rounded-[12px] bg-muted p-1">
              <Step
                direction={-1}
                label={t('lessIngredient')}
                line={line}
                onPress={(amount) => setIngredient(mealId, amount)}
              />
              {/*
                18px at normal weight, not 16px at semibold.

                It is the one figure on the row that changes, and the weight was
                doing the work of making it findable — which is what a heavier
                face is for when a bigger one is available and the row has the
                height to spend. Setting it a step up the scale and letting it
                sit at the same weight as the name beside it reads as a quantity
                rather than as a label shouting.

                **Never `font-light` here.** Almarai's 300 is loaded and is for
                atmosphere only — see the ⚠ in `[locale]/layout.tsx`. This is a
                prescribed amount, which is as close to "instruction" as this
                app gets.
              */}
              <IngredientAmount
                line={line}
                locale={locale}
                className="min-w-28 px-1 text-center text-body-lg"
              />
              <Step
                direction={1}
                label={t('moreIngredient')}
                line={line}
                onPress={(amount) => setIngredient(mealId, amount)}
              />
            </span>
          </li>
        ))}
      </ul>

      {rest.length > 0 && (
        <div className="border-t border-border pt-3">
          <p className="pb-1.5 text-caption text-muted-foreground">{t('alsoContains')}</p>
          <MealIngredientAmounts lines={rest} locale={locale} />
        </div>
      )}

      {/*
        A button that looks like one, in the middle.

        This was `neutralGhost` — no box, no icon, black text — pinned to the
        inline start, which is to say it was a sentence sitting under a list of
        sentences and there was nothing to tell you it could be pressed. It is
        the undo for every press above it, so it takes a real edge, the
        counter-clockwise arrow that means "put it back", and the centre of the
        card, where an action that belongs to the whole list rather than to any
        one row goes.
      */}
      {hasOwnAmounts && (
        <Button
          type="button"
          variant="neutral"
          size="sm"
          className="self-center"
          onClick={() => resetIngredients(mealId)}
        >
          <Icon name="undo" />
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
      variant="neutral"
      size="icon-sm"
      aria-label={label}
      disabled={disabled}
      onClick={() => onPress(next)}
    >
      {/* The registry's glyphs rather than a `+` and a `−` set in the body
          font: a typographic minus is a hyphen's width at whatever size the row
          happens to be, and these two are the most-pressed controls in the
          panel. */}
      <Icon name={direction === 1 ? 'add' : 'minus'} className="size-5" />
    </Button>
  );
}
