'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { SelectField } from '@/components/ui/select-field';
import { cn } from '@/lib/utils';

import { localizedName } from '../food-display';
import type { MealIngredientLine } from '../meal-ingredients';
import { baseServingKcal, dishGrams, dishTotals, roundForDisplay, roundGrams } from '../nutrition';
import type { CatalogEntry } from '../queries';
import { MAX_MEAL_SIDES, mealTypeForSlot } from '../schema';
import { sideChipStyle } from '../side-kind';

import { useEditorActions } from './board-dnd';
import { IngredientDisclosure } from './ingredient-disclosure';
import { MealIngredientAmounts } from './meal-ingredient-amounts';

/**
 * What stands beside the meal — the salad, the soup, the cup of yogurt.
 *
 * ## Why this exists
 *
 * The model could attach sides from the first day they existed, and it did:
 * every lunch and every dinner of a generated week came back carrying صحن سلطة,
 * because there was one salad in the catalog and no way for anyone to change it
 * afterwards. Two separate faults wearing one symptom — a catalog with a single
 * answer, and a plan with no control.
 *
 * The catalog now holds seventeen sides. This is the control: **which one, or
 * none at all.** A lunch does not always come with a salad, and when it does it
 * is not the same salad on Sunday and Thursday.
 *
 * ## One row per side, and the row is the whole side
 *
 * A side used to be a bare select in a list, with its ingredients printed some
 * distance below under the main's "also contains" — so a salad's lettuce sat in
 * a list headed as though the maqluba contained it, and the row that changed the
 * salad and the lines that described it were not visibly the same object.
 *
 * A side is now one row that holds everything about it: the glyph that says what
 * kind of thing it is (the same green leaf the meal card prints in its corner),
 * the select that changes it, its weight and energy, the control that removes
 * it, and its ingredients folded away behind a count. Nothing about that side is
 * anywhere else on the panel.
 *
 * ## Why a select per side, and not a list of chips to toggle
 *
 * The question a dietitian asks here is "which salad", not "which of these
 * seventeen things are on the plate". A select is a question with one answer,
 * and the row it sits in is the side it is changing — so swapping فتوش for
 * تبولة is one interaction on the thing being swapped, and the second row is
 * left alone. A grid of seventeen toggles would ask the reader to find the one
 * that is currently on before they could change it.
 *
 * The remove control is separate and destructive-shaped for the same reason:
 * "no side" is not one more salad in the list.
 *
 * ## What it offers
 *
 * Only sides the slot can carry: `mealTypeForSlot` narrows seventeen to the ones
 * marked for lunch, dinner or a snack, so a cup of yogurt is not offered beside
 * breakfast because it happens to exist. Allergens are already gone — the
 * catalog was loaded against the client's list — and a side that is already on
 * this meal is not offered twice.
 *
 * The energy is printed beside each name because a side is not free: a cup of
 * lentil soup is 120 kcal on a plate that was budgeted without it, and the
 * dietitian is the one who decides whether the day can take it.
 */
export function MealSides({
  mealId,
  slotKey,
  sides,
  lines,
  catalog,
  locale,
  editable,
}: {
  mealId: string;
  slotKey: string;
  /** What is attached now, in the order it was attached. */
  sides: readonly { id: string; nameAr: string; nameEn: string }[];
  /**
   * The meal's whole ingredient list. Each side's own lines are picked out of it
   * by `line.side.id` — they arrive mixed in with the main's on purpose, so that
   * every total in the app counts the salad without knowing it exists (see
   * `MealIngredientLine.side`), and this is the one surface that has to take
   * them apart again.
   */
  lines: readonly MealIngredientLine[];
  /** The whole board catalog. Sides are picked out here — see `available`. */
  catalog: readonly CatalogEntry[];
  locale: string;
  editable: boolean;
}) {
  const t = useTranslations('weeklyPlans');
  const { setSides } = useEditorActions();

  /** Every side this slot could carry, cheapest question first: is it a side. */
  const available = useMemo(() => {
    const mealType = mealTypeForSlot(slotKey);

    return catalog
      .filter((dish) => dish.isSide && dish.mealTypes.includes(mealType))
      .map((dish) => ({
        id: dish.id,
        label: `${localizedName(dish, locale)} · ${Math.round(baseServingKcal(dish.ingredients))} kcal`,
        dish,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, locale));
  }, [catalog, slotKey, locale]);

  const byId = useMemo(() => new Map(available.map((one) => [one.id, one.dish])), [available]);

  /** Each attached side's own lines, keyed by the side that contributed them. */
  const linesBySide = useMemo(() => {
    const grouped = new Map<string, MealIngredientLine[]>();

    for (const line of lines) {
      if (!line.side) continue;
      const bucket = grouped.get(line.side.id);
      if (bucket) bucket.push(line);
      else grouped.set(line.side.id, [line]);
    }

    return grouped;
  }, [lines]);

  /** The current set as ids, which is the only thing the writes deal in. */
  const current = sides.map((side) => side.id);

  function replace(next: readonly string[]) {
    // A side that has left the catalog since the plan was written — retired, or
    // hidden by this clinic — has no recipe to cost, so it is dropped rather
    // than sent back as an id the server would refuse.
    setSides(
      mealId,
      next.flatMap((id) => {
        const dish = byId.get(id);
        return dish ? [dish] : [];
      }),
    );
  }

  /**
   * The rows one attached side's select may offer.
   *
   * Its own value always leads, **named from the meal rather than the catalog**.
   * A select whose value matches none of its rows renders the raw value, and the
   * raw value here is a uuid — which is what a dietitian would see for a side
   * that has since been retired, hidden by the clinic, or whose meal types no
   * longer include this slot. The meal already knows what it is called.
   *
   * After it, everything else this slot can carry that is not already on the
   * plate: offering a side twice would produce a set the write deduplicates back
   * to one, which reads as the click having done nothing.
   */
  function optionsFor(side: (typeof sides)[number], index: number) {
    const others = current.filter((_, at) => at !== index);
    const rest = available.filter((one) => one.id !== side.id && !others.includes(one.id));

    return [
      { value: side.id, label: byId.get(side.id) ? labelOf(side.id) : localizedName(side, locale) },
      ...rest.map((one) => ({ value: one.id, label: one.label })),
    ];
  }

  /** The catalog's own label — name plus energy — for a side that is still in it. */
  function labelOf(id: string): string {
    return available.find((one) => one.id === id)?.label ?? id;
  }

  // Nothing to say and nothing to offer. A heading over an empty box on a
  // published plan is furniture.
  if (!editable && sides.length === 0) return null;
  if (editable && available.length === 0 && sides.length === 0) return null;

  const room = MAX_MEAL_SIDES - sides.length;

  return (
    <section className="mt-4">
      <div className="flex items-baseline justify-between gap-2 pb-2">
        <h4 className="text-label font-semibold">{t('sidesLabel')}</h4>
        <span className="text-caption text-muted-foreground">{t('sidesHint')}</span>
      </div>

      {sides.length === 0 ? (
        <p className="pb-2 text-body-sm text-muted-foreground">{t('noSides')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sides.map((side, index) => (
            <SideRow
              key={side.id}
              side={side}
              lines={linesBySide.get(side.id) ?? []}
              locale={locale}
              editable={editable}
              options={editable ? optionsFor(side, index) : []}
              onChange={(next) => replace(current.map((id, at) => (at === index ? next : id)))}
              onRemove={() => replace(current.filter((_, at) => at !== index))}
            />
          ))}
        </ul>
      )}

      {editable && room > 0 && available.some((one) => !current.includes(one.id)) && (
        <SelectField
          size="sm"
          className="mt-2 w-full"
          // Uncontrolled by design: this is a *command*, not a field. It has no
          // value of its own — choosing a row adds a side and the row below
          // becomes that side's own select — so `value={null}` keeps the
          // placeholder showing whatever was picked last.
          value={null}
          placeholder={t('addSide')}
          aria-label={t('addSide')}
          onValueChange={(next) => replace([...current, next])}
          options={available
            .filter((one) => !current.includes(one.id))
            .map((one) => ({ value: one.id, label: one.label }))}
        />
      )}
    </section>
  );
}

/**
 * One side, whole.
 *
 * A card rather than a bare row, so the select, the figures and the fold read as
 * belonging to the same object — two sides in a list of loose controls is four
 * controls a reader has to pair up by position.
 *
 * The glyph on the leading edge is the same one the meal card prints in its
 * corner for this side, in the same colour. That is the point of it being here:
 * the mark a dietitian reads on the board at a glance is identified by name
 * exactly once, in the panel they opened to change it.
 */
function SideRow({
  side,
  lines,
  locale,
  editable,
  options,
  onChange,
  onRemove,
}: {
  side: { id: string; nameAr: string; nameEn: string };
  lines: readonly MealIngredientLine[];
  locale: string;
  editable: boolean;
  options: { value: string; label: string }[];
  onChange: (next: string) => void;
  onRemove: () => void;
}) {
  const t = useTranslations('weeklyPlans');
  const { icon, className: tone } = sideChipStyle(side);

  /*
   * The side's own weight and energy, from its own lines.
   *
   * `servings: 1` because these lines are already absolute — a side stands beside
   * the meal at one serving and `meal-ingredients.ts` resolved the amounts before
   * they reached any screen. Nothing here multiplies.
   *
   * Both are omitted rather than printed as zero when the side contributed no
   * lines, which happens for a side attached before its recipe was written. A
   * "0 kcal" salad is a claim; a missing figure is the truth.
   */
  const kcal = lines.length > 0 ? roundForDisplay('kcal', dishTotals(lines, 1).kcal.value) : null;
  const grams = lines.length > 0 ? roundGrams(dishGrams(lines, 1), 5) : null;

  return (
    <li className="rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className={cn('grid size-7 shrink-0 place-items-center rounded-md', tone)}>
          <Icon name={icon} className="size-4" />
        </span>

        {editable ? (
          <SelectField
            size="sm"
            className="min-w-0 flex-1"
            aria-label={t('sidesLabel')}
            value={side.id}
            onValueChange={onChange}
            options={options}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-body-sm" dir="auto">
            {localizedName(side, locale)}
          </span>
        )}

        {editable && (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={t('removeSide')}
            title={t('removeSide')}
            onClick={onRemove}
          >
            <Icon name="close" />
          </Button>
        )}
      </div>

      {/*
        Indented past the glyph, so the figures and the fold hang under the name
        rather than under the mark — the same alignment a list item's own
        continuation would take.
      */}
      {lines.length > 0 && (
        <div className="mt-1 ps-9">
          {/* The figures the select's label already carries for the *catalog*
              row, restated here for the side actually on the plate — the label
              is what you choose by, this is what you chose. */}
          <p className="text-caption tabular-nums text-muted-foreground">
            {grams !== null && t('totalGrams', { value: grams })}
            {grams !== null && kcal !== null && <span aria-hidden> · </span>}
            {kcal !== null && t('kcalValue', { value: kcal })}
          </p>

          <IngredientDisclosure label={t('sideIngredients')} count={lines.length}>
            <MealIngredientAmounts lines={lines} locale={locale} flat />
          </IngredientDisclosure>
        </div>
      )}
    </li>
  );
}
