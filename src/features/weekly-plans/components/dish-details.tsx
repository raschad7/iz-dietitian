'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { membersOf } from '@/lib/enum';

import { loadDishDetailAction } from '../catalog-actions';
import { localizedName, localizedPortionLabel, secondaryName } from '../food-display';
import { NUTRIENT_UNITS, roundForDisplay } from '../nutrition';
import type { DishDetailView } from '../queries';
import { ALLERGENS, DISH_AXES, MEAL_TYPES, axisMessageKey } from '../schema';

/**
 * The read-only dish detail drawer (spec §8).
 *
 * Opened from a catalog row. Shows what browsing deliberately leaves out — the
 * recipe — in the terms it was entered in: each ingredient by its friendly name
 * ("أرز أبيض", not "Rice, white, cooked") in its own household unit ("1 كوب",
 * "150 غرام"), reconstructed from the saved unit by the same `resolveSavedRow` the
 * editor uses, so the drawer and the editor never disagree. Macros come
 * pre-computed from the server; nothing here sums nutrition.
 *
 * A clinic dish offers **Edit** (delegated up via `onEdit`, the same editor the
 * row menu opens). A system dish is read-only and shows no edit affordance.
 */
export function DishDetails({
  locale,
  dishId,
  onClose,
  onEdit,
}: {
  locale: string;
  /** The dish to show, or null when the drawer is closed. */
  dishId: string | null;
  onClose: () => void;
  onEdit: (dishId: string) => void;
}) {
  const t = useTranslations('dishes');
  const tUnits = useTranslations('dishEditor.editor.units');
  const tNutrients = useTranslations('weeklyPlans.nutrients');

  // Keyed by the dish it belongs to, so a stale response for a dish the reader has
  // since closed (or swapped) is ignored, and loading is derived rather than set
  // synchronously in the effect: the drawer is "loading" whenever the open dish is
  // not the one the last fetch resolved.
  const [resolved, setResolved] = useState<{ dishId: string; detail: DishDetailView | null } | null>(
    null,
  );

  useEffect(() => {
    if (!dishId) return;
    let live = true;
    loadDishDetailAction(locale, dishId).then((data) => {
      if (live) setResolved({ dishId, detail: data });
    });
    return () => {
      live = false;
    };
  }, [dishId, locale]);

  const detail = resolved && resolved.dishId === dishId ? resolved.detail : null;
  const loading = dishId !== null && (resolved === null || resolved.dishId !== dishId);
  const editable = detail !== null && detail.clinicId !== null;

  // Meal category then a couple of qualities — the same quiet line the row shows.
  const meta = detail
    ? [
        ...membersOf(MEAL_TYPES, detail.mealTypes).map((type) => t(`mealTypes.${type}`)),
        ...DISH_AXES.map(({ key }) => t(axisMessageKey(key, detail[key]))),
      ].join(' · ')
    : '';

  return (
    <Sheet open={dishId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="inline-end" className="w-full gap-0 p-0 sm:max-w-md">
        {loading ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <Spinner />
          </div>
        ) : !detail ? null : (
          <>
            <SheetHeader className="gap-1 border-b border-border p-5">
              {/* The dish in the reader's language, the other name quietly under it. */}
              <SheetTitle className="font-heading text-heading-sm" dir="auto">
                {localizedName(detail, locale)}
              </SheetTitle>
              {secondaryName(detail, locale) && (
                <SheetDescription dir="auto">{secondaryName(detail, locale)}</SheetDescription>
              )}
              {meta && <p className="pt-1 text-body-sm text-muted-foreground">{meta}</p>}
            </SheetHeader>

            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5">
              {/* Nutrition: energy leads, the three macros in one aligned strip
                  beneath it (spec §10). */}
              <section>
                <p className="font-heading text-heading-lg font-semibold tabular-nums" dir="ltr">
                  {roundForDisplay('kcal', detail.baseKcal)}{' '}
                  <span className="text-body-sm font-normal text-muted-foreground">
                    {NUTRIENT_UNITS.kcal}
                  </span>
                </p>
                <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-body-sm">
                  {(['protein', 'carbs', 'fat'] as const).map((key) => (
                    <span key={key} className="text-muted-foreground">
                      <span className="font-semibold text-foreground tabular-nums" dir="ltr">
                        {roundForDisplay(key, detail.totals[key].value)}
                        {NUTRIENT_UNITS[key]}
                      </span>{' '}
                      {tNutrients(key)}
                    </span>
                  ))}
                </div>
              </section>

              {/* Allergens stay a real medical flag, not a quiet meta word. */}
              {detail.allergenTags.length > 0 && (
                <section className="flex flex-wrap gap-1.5">
                  {membersOf(ALLERGENS, detail.allergenTags).map((tag) => (
                    <Badge key={tag} variant="medical" size="sm">
                      {t(`allergens.${tag}`)}
                    </Badge>
                  ))}
                </section>
              )}

              {/* The recipe, each line by its friendly name and its own unit. */}
              <section className="border-t border-border pt-5">
                <h3 className="pb-2 text-label font-semibold">{t('detail.ingredients')}</h3>
                <ul className="flex flex-col divide-y divide-border">
                  {detail.ingredients.map((ingredient, index) => {
                    /*
                     * Shown in the unit it was entered in, grams otherwise.
                     *
                     * The portion arrives already resolved from the join, so a
                     * portion that has since been retired (`portion_id` is
                     * `on delete set null`) simply reads as its stored weight
                     * rather than as a blank or a rescaled amount.
                     */
                    const amount = ingredient.portion
                      ? Math.round((ingredient.portionQuantity ?? 0) * 1000) / 1000
                      : Math.round(ingredient.quantityGrams);
                    const unit = ingredient.portion
                      ? localizedPortionLabel(ingredient.portion, locale)
                      : tUnits('g');
                    const secondary = secondaryName(ingredient.food, locale);

                    return (
                      <li
                        key={`${ingredient.food.id}-${index}`}
                        className="flex items-center justify-between gap-3 py-2.5 text-body-sm"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block [overflow-wrap:anywhere]" dir="auto">
                            {localizedName(ingredient.food, locale)}
                          </span>
                          {secondary && (
                            <span className="block text-caption text-muted-foreground" dir="auto">
                              {secondary}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 tabular-nums text-muted-foreground" dir="auto">
                          {amount} {unit}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>

            {editable && (
              <SheetFooter className="border-t border-border p-4">
                <Button type="button" onClick={() => onEdit(detail.id)}>
                  <Icon name="edit" />
                  {t('detail.edit')}
                </Button>
              </SheetFooter>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
