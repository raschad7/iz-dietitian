'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { SelectField } from '@/components/ui/select-field';

import { localizedName } from '../food-display';
import { baseServingKcal } from '../nutrition';
import type { CatalogEntry } from '../queries';
import { MAX_MEAL_SIDES, mealTypeForSlot } from '../schema';

import { useEditorActions } from './board-dnd';

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
  catalog,
  locale,
  editable,
}: {
  mealId: string;
  slotKey: string;
  /** What is attached now, in the order it was attached. */
  sides: readonly { id: string; nameAr: string; nameEn: string }[];
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
    <section className="mt-6">
      <div className="flex items-baseline justify-between gap-2 pb-2">
        <h4 className="text-label font-semibold">{t('sidesLabel')}</h4>
        <span className="text-caption text-muted-foreground">{t('sidesHint')}</span>
      </div>

      {sides.length === 0 ? (
        <p className="pb-2 text-body-sm text-muted-foreground">{t('noSides')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sides.map((side, index) => (
            <li key={side.id} className="flex items-center gap-2">
              {editable ? (
                <SelectField
                  size="sm"
                  className="min-w-0 flex-1"
                  aria-label={t('sidesLabel')}
                  value={side.id}
                  onValueChange={(next) =>
                    replace(current.map((id, at) => (at === index ? next : id)))
                  }
                  options={optionsFor(side, index)}
                />
              ) : (
                <span className="min-w-0 flex-1 truncate text-body-sm" dir="auto">
                  {locale === 'en' && side.nameEn ? side.nameEn : side.nameAr}
                </span>
              )}

              {editable && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={t('removeSide')}
                  title={t('removeSide')}
                  onClick={() => replace(current.filter((_, at) => at !== index))}
                >
                  <Icon name="close" />
                </Button>
              )}
            </li>
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
