'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';

import {
  groupComponents,
  nextComponentTotal,
  scaleComponentLines,
  VISIBLE_CONTROLS,
  type DishComponent,
} from '../dish-components';
import { localizedName } from '../food-display';
import {
  MAX_INGREDIENT_GRAMS,
  nextIngredientAmount,
  type IngredientAmountChange,
  type MealIngredientLine,
  type RecipeLine,
} from '../meal-ingredients';

import { useEditorActions } from './board-dnd';
import { IngredientDisclosure } from './ingredient-disclosure';
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
 * ## The control belongs to a component, not to a line
 *
 * A **component** is what the client is actually served — see `dish-components.ts`.
 * Sometimes that is one line (the chicken on a plate) and sometimes it is four
 * cooked into one thing (the rice, lentils, onion and oil that became مجدرة).
 * The panel used to put a control on each marked *line*, which offered to raise
 * the rice in a مجدرة and leave the lentils — an instruction nobody can
 * follow. One control over the group moves all four together and keeps the ratio
 * the recipe was written with.
 *
 * Everything not adjustable is listed underneath, quiet, because it is context
 * rather than instruction: a control on the cumin is a control nobody will ever
 * press, and putting one there would bury the two that matter among nine that do
 * not.
 *
 * A dish with nothing marked shows a plain list and no controls at all. That is a
 * data gap rather than a broken screen, and it degrades to exactly what the panel
 * showed before this existed.
 */
export function MealIngredientEditor({
  mealId,
  lines,
  recipe,
  locale,
  hasOwnAmounts,
}: {
  mealId: string;
  lines: readonly MealIngredientLine[];
  /**
   * The dish's recipe at one serving — what a grouped component's steps are
   * measured from.
   *
   * A single line carries its own grid: bread moves by half a loaf whatever it
   * currently holds. A group has no unit of its own, so its step is a share of
   * what the recipe specifies, and that origin is what lets a press be undone
   * exactly rather than approximately. Empty for an unfilled slot, and unused by
   * dishes with no groups.
   */
  recipe: readonly RecipeLine[];
  locale: string;
  /** True once amounts were set by hand, which is the only time "back to recipe" means anything. */
  hasOwnAmounts: boolean;
}) {
  const t = useTranslations('weeklyPlans');
  const { setIngredient, resetIngredients } = useEditorActions();

  /*
   * The main's lines, and nothing else.
   *
   * A side is a whole dish standing beside the meal at one serving, and the
   * server has no write that changes an amount inside one: `setMealIngredient`
   * resolves the main's lines and refuses a food it does not find among them.
   * So a salad's tomato can never take a `−/+`, and this used to say so by
   * filtering the sides out of the controls and letting their lines fall through
   * to the read-only list underneath.
   *
   * They do not arrive here at all now. **A side owns its own row** — its name,
   * its energy and its ingredients folded behind it, in `MealSides` — which is
   * the same separation the plate itself has: the main is the thing you adjust,
   * a side is a thing you choose. Mixing the two lists put a salad's lettuce
   * under a heading that said "also contains", as though the maqluba had lettuce
   * in it.
   *
   * The caller passes main lines only. This filter stays as the guard for that
   * contract rather than as the mechanism, so a caller that forgets still gets a
   * correct panel instead of a stepper that silently moves the wrong food.
   */
  const main = lines.filter((line) => line.side === null);
  const components = groupComponents(main);
  const adjustable = components.filter((component) => component.adjustable);
  const rest = main.filter((line) => !line.isPrimary);

  // What the recipe specifies for each component, which is the origin a grouped
  // component's steps are measured from. Built from the recipe rather than from
  // the meal, because the meal is where the adjustments already are.
  const baseGrams = new Map<string, number>();
  for (const component of groupComponents(recipe)) {
    baseGrams.set(component.key, component.totalGrams);
  }

  // Nothing is marked on this dish, so there is nothing to put a control on. The
  // plain list is the honest rendering, not a fallback that hides a problem.
  if (!adjustable.length) return <MealIngredientAmounts lines={main} locale={locale} />;

  /*
    A small set in the foreground, the remainder behind a fold.

    The seed used to cap a dish at three adjustable lines so this list would stay
    short, which turned a display decision into a claim about food — a mixed
    grill with four separately served parts had to pretend one of them was fixed.
    The cap is gone and the panel handles it, so a dish may have as many parts as
    it really has.
  */
  const shown = adjustable.slice(0, VISIBLE_CONTROLS);
  const folded = adjustable.slice(VISIBLE_CONTROLS);

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
        {shown.map((component) => (
          <ComponentStepper
            key={component.key}
            component={component}
            baseGrams={baseGrams.get(component.key) ?? component.totalGrams}
            locale={locale}
            onChange={(amounts) => setIngredient(mealId, amounts)}
          />
        ))}
      </ul>

      {/*
        The rest of the controls, where a dish genuinely has more than a few.

        Rare — most plates have two or three separately served parts — which is
        exactly why the extras fold rather than the list scrolling: the common
        dish should look the way it always did.
      */}
      {folded.length > 0 && (
        <IngredientDisclosure label={t('moreServings')} count={folded.length}>
          <ul className="flex flex-col gap-2 pt-2">
            {folded.map((component) => (
              <ComponentStepper
                key={component.key}
                component={component}
                baseGrams={baseGrams.get(component.key) ?? component.totalGrams}
                locale={locale}
                onChange={(amounts) => setIngredient(mealId, amounts)}
              />
            ))}
          </ul>
        </IngredientDisclosure>
      )}

      {/*
        Folded, where it used to be printed.

        "Also contains" is nine lines of a maqluba's recipe — the onion, the oil,
        the two grams of cumin — and it is *reference*: read once when a dish is
        new, then scrolled past every time after. Open, it pushed the sides and
        the replacement list below the fold of a panel whose two most-used
        controls are the steppers directly above it. Folded, it costs one 28px
        row and says on that row how many lines are behind it, which is the part
        that makes it worth opening or not.
      */}
      {rest.length > 0 && (
        <div className="border-t border-border pt-2">
          <IngredientDisclosure label={t('alsoContains')} count={rest.length}>
            <MealIngredientAmounts lines={rest} locale={locale} />
          </IngredientDisclosure>
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
 * One served thing, and the control that moves it.
 *
 * Both kinds render the same shape — `[−] 150 غ [+]` — because to a dietitian
 * they are the same act: less of this, more of that. What differs is underneath.
 *
 * - **One line.** Its own unit, its own step, its own ceiling: bread by the half
 *   loaf, eggs by the piece, chicken by weight. `nextIngredientAmount` decides
 *   it, exactly as it did before components existed.
 * - **A group.** No unit of its own, so it moves in tenths of what the recipe
 *   specifies and every line inside follows by the same ratio. The row reads
 *   «مجدرة ٤١٠ غ», which is the plate, rather than four rows describing a pot.
 */
function ComponentStepper({
  component,
  baseGrams,
  locale,
  onChange,
}: {
  component: DishComponent<MealIngredientLine>;
  /** What the recipe holds for this component — the origin of a group's grid. */
  baseGrams: number;
  locale: string;
  onChange: (amounts: readonly IngredientAmountChange[]) => void;
}) {
  const t = useTranslations('weeklyPlans');
  const [first] = component.lines;
  if (!first) return null;

  const grouped = component.grouped;

  // The figure between the buttons. A group has no count to show, so its portion
  // is stripped and the shared formatter spells the weight; a lone line keeps
  // whatever unit it was written in.
  const shown: MealIngredientLine = grouped
    ? { ...first, quantityGrams: component.totalGrams, portion: null, portionQuantity: null }
    : first;

  const move = (direction: -1 | 1): readonly IngredientAmountChange[] => {
    if (!grouped) {
      const next = nextIngredientAmount(first, direction);
      return [{ ...next, foodId: first.food.id }];
    }

    const total = nextComponentTotal(component.totalGrams, baseGrams, direction);
    return scaleComponentLines(component, total);
  };

  /*
    Disabled at the ends rather than clamped silently: the amount stops moving
    either way, and a button that still depresses while nothing changes reads as
    a broken control instead of a limit. The lower end is one step — a component
    at zero has been removed, not made smaller, and removing one is not this
    control's job.

    A group is measured on its total, a line on its own grams, which is the same
    test written against whichever number the row is showing.
  */
  const atEnd = (direction: -1 | 1): boolean => {
    const next = move(direction);
    const nextTotal = next.reduce((sum, amount) => sum + amount.quantityGrams, 0);

    return direction === 1
      ? nextTotal > MAX_INGREDIENT_GRAMS
      : nextTotal >= component.totalGrams;
  };

  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
      <span className="min-w-0 flex-1 text-body-md [overflow-wrap:anywhere]" dir="auto">
        {/* The served thing's name for a group, the food's for a lone line —
            `groupComponents` has already chosen between them. */}
        {localizedName({ nameAr: component.nameAr, nameEn: component.nameEn }, locale)}
      </span>

      <span className="flex shrink-0 items-center gap-1 rounded-[12px] bg-muted p-1">
        <Step
          direction={-1}
          label={t('lessIngredient')}
          disabled={atEnd(-1)}
          onPress={() => onChange(move(-1))}
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
          line={shown}
          locale={locale}
          className="min-w-28 px-1 text-center text-body-lg"
        />
        <Step
          direction={1}
          label={t('moreIngredient')}
          disabled={atEnd(1)}
          onPress={() => onChange(move(1))}
        />
      </span>
    </li>
  );
}

/** One press. */
function Step({
  direction,
  label,
  disabled,
  onPress,
}: {
  direction: -1 | 1;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Button
      type="button"
      variant="neutral"
      size="icon-sm"
      aria-label={label}
      disabled={disabled}
      onClick={onPress}
    >
      {/* The registry's glyphs rather than a `+` and a `−` set in the body
          font: a typographic minus is a hyphen's width at whatever size the row
          happens to be, and these two are the most-pressed controls in the
          panel. */}
      <Icon name={direction === 1 ? 'add' : 'minus'} className="size-5" />
    </Button>
  );
}
