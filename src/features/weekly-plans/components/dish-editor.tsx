'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldError, FieldHint } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatGrid, StatTile } from '@/components/ui/stat-tile';
import { ALLERGENS } from '@/features/clients/nutrition';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

import { createDishAction } from '../catalog-actions';
import { initialCatalogFormState, type CatalogFormState } from '../catalog-form-state';
import {
  dishTotals,
  nutritionCategory,
  NUTRIENT_UNITS,
  roundForDisplay,
  type DishIngredientDetail,
} from '../nutrition';
import type { FoodSearchResult } from '../queries';
import { DISH_TAGS, MEAL_TYPES } from '../schema';

import { FoodPicker } from './food-picker';

/**
 * Creates a dish for the clinic's own catalog, with the same recipe the AI and
 * the board later read: a list of foods and grams, scaled to one base serving.
 *
 * The nutrition label under the recipe is never typed in — it is `dishTotals`
 * and `nutritionCategory` run on the rows on screen, the same functions the
 * meal-detail panel already runs on a placed dish. That is the whole point of
 * building the editor on top of them rather than asking a dietitian to guess
 * "high protein" by eye: the label can never drift from the recipe that
 * produced it.
 */

/** The manual labels a dietitian may still choose by hand — everything except
 * `high_protein`, which is computed from the recipe now and would otherwise be
 * two conflicting answers to the same question. */
const DISH_LABELS = DISH_TAGS.filter((tag) => tag !== 'high_protein');

let rowSeq = 0;

type IngredientRowState = {
  key: string;
  food: FoodSearchResult | null;
  quantityGrams: string;
  displayNameAr: string;
  householdLabel: string;
  householdGrams: string;
};

function emptyRow(): IngredientRowState {
  rowSeq += 1;
  return {
    key: `row-${rowSeq}`,
    food: null,
    quantityGrams: '',
    displayNameAr: '',
    householdLabel: '',
    householdGrams: '',
  };
}

export function DishEditor({
  locale,
  onSuccess,
  onCancel,
}: {
  locale: string;
  /**
   * Called instead of the page redirect when the dish is created. Set by
   * `DishDialog`, which closes itself and refreshes the catalog rather than
   * navigating anywhere — the form still lives on `/app/dishes`, it is just
   * shown inside a dialog now.
   */
  onSuccess?: () => void;
  /** Overrides the Cancel button's page redirect for the same reason. */
  onCancel?: () => void;
}): React.JSX.Element {
  const t = useTranslations('dishEditor');
  const tCommon = useTranslations('common');
  const tNutrients = useTranslations('weeklyPlans.nutrients');
  // Meal times, labels and allergens already have translated names in the
  // catalog table (`dishes.mealTypes` / `.tags` / `.allergens`) — reused here
  // rather than duplicated, since a dish created in the editor and the same
  // dish read back in the table must say the same thing.
  const tDishes = useTranslations('dishes');

  const [state, formAction] = useActionState(createDishAction, initialCatalogFormState);

  const [mealTypes, setMealTypes] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [allergenTags, setAllergenTags] = useState<string[]>([]);
  const [rows, setRows] = useState<IngredientRowState[]>(() => [emptyRow()]);
  const [attempted, setAttempted] = useState(false);

  function toggle(list: string[], value: string, setList: (next: string[]) => void) {
    setList(list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]);
  }

  function updateRow(key: string, patch: Partial<IngredientRowState>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function pickFood(key: string, food: FoodSearchResult) {
    setRows((prev) =>
      prev.map((row) =>
        row.key === key
          ? { ...row, food, displayNameAr: row.displayNameAr || food.description }
          : row,
      ),
    );
  }

  /*
   * What the recipe actually is: the rows that have a food and a positive
   * amount. Rows still missing one or the other simply do not count yet — the
   * dietitian is mid-edit, not making a mistake.
   */
  const completeRows = useMemo(
    () => rows.filter((row) => row.food !== null && Number(row.quantityGrams) > 0),
    [rows],
  );

  const nutritionDetails: DishIngredientDetail[] = useMemo(
    () =>
      completeRows.map((row) => ({
        quantityGrams: Number(row.quantityGrams),
        food: row.food!,
      })),
    [completeRows],
  );

  const totals = useMemo(() => dishTotals(nutritionDetails, 1), [nutritionDetails]);
  const category = useMemo(() => nutritionCategory(totals), [totals]);

  const ingredientsJson = useMemo(
    () =>
      JSON.stringify(
        completeRows.map((row) => {
          const entry: Record<string, unknown> = {
            foodId: row.food!.id,
            quantityGrams: Number(row.quantityGrams),
          };
          if (row.displayNameAr.trim()) entry.displayNameAr = row.displayNameAr.trim();
          if (row.householdLabel.trim()) entry.householdLabel = row.householdLabel.trim();
          const householdGrams = Number(row.householdGrams);
          if (row.householdGrams.trim() && householdGrams > 0) entry.householdGrams = householdGrams;
          return entry;
        }),
      ),
    [completeRows],
  );

  const mealTypesValid = mealTypes.length > 0;
  const ingredientsValid = completeRows.length > 0;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (!mealTypesValid || !ingredientsValid) {
      event.preventDefault();
      setAttempted(true);
    }
  }

  const router = useRouter();
  useEffect(() => {
    if (state.status !== 'done') return;
    if (onSuccess) onSuccess();
    else router.push('/app/dishes');
  }, [state, router, onSuccess]);

  return (
    <form action={formAction} onSubmit={handleSubmit} className="flex flex-col gap-6">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="ingredients" value={ingredientsJson} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <Label htmlFor="nameAr">{t('editor.nameAr')}</Label>
          <Input id="nameAr" name="nameAr" dir="rtl" required maxLength={120} />
        </Field>

        <Field>
          <Label htmlFor="nameEn">{t('editor.nameEn')}</Label>
          <Input id="nameEn" name="nameEn" required maxLength={120} />
        </Field>
      </div>

      <Field className="sm:max-w-xs">
        <Label htmlFor="baseServingLabel">{t('editor.baseServingLabel')}</Label>
        <Input
          id="baseServingLabel"
          name="baseServingLabel"
          dir="auto"
          required
          maxLength={60}
          defaultValue="حصة"
        />
        <FieldHint>{t('editor.baseServingHint')}</FieldHint>
      </Field>

      <div>
        <PillCheckboxGroup
          legend={t('editor.mealTypesLegend')}
          name="mealTypes"
          options={MEAL_TYPES.map((value) => ({ value, label: tDishes(`mealTypes.${value}`) }))}
          selected={mealTypes}
          onToggle={(value) => toggle(mealTypes, value, setMealTypes)}
        />
        {attempted && !mealTypesValid && (
          <FieldError className="mt-2">{t('editor.errors.mealTypeRequired')}</FieldError>
        )}
      </div>

      <PillCheckboxGroup
        legend={t('editor.labelsLegend')}
        name="tags"
        options={DISH_LABELS.map((value) => ({ value, label: tDishes(`tags.${value}`) }))}
        selected={tags}
        onToggle={(value) => toggle(tags, value, setTags)}
      />

      <div>
        <PillCheckboxGroup
          legend={t('editor.allergensLegend')}
          name="allergenTags"
          options={ALLERGENS.map((value) => ({ value, label: tDishes(`allergens.${value}`) }))}
          selected={allergenTags}
          onToggle={(value) => toggle(allergenTags, value, setAllergenTags)}
          tone="medical"
        />
        <FieldHint className="mt-2">{t('editor.allergensHint')}</FieldHint>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-heading-sm font-semibold">{t('editor.ingredientsHeading')}</h2>

        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <IngredientRow
              key={row.key}
              row={row}
              locale={locale}
              removable={rows.length > 1}
              onChange={(patch) => updateRow(row.key, patch)}
              onPick={(food) => pickFood(row.key, food)}
              onChangeFood={() => updateRow(row.key, { food: null })}
              onRemove={() => setRows((prev) => prev.filter((entry) => entry.key !== row.key))}
            />
          ))}
        </div>

        {attempted && !ingredientsValid && (
          <FieldError>{t('editor.errors.ingredientRequired')}</FieldError>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setRows((prev) => [...prev, emptyRow()])}
        >
          <Icon name="add" />
          {t('editor.addIngredient')}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2" size="sm">
            {t('editor.liveNutrition')}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">{t(`editor.categories.${category}`)}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <StatGrid columns={4}>
            <StatTile
              label={tNutrients('kcal')}
              value={roundForDisplay('kcal', totals.kcal.value)}
              unit={NUTRIENT_UNITS.kcal}
            />
            <StatTile
              label={tNutrients('protein')}
              value={roundForDisplay('protein', totals.protein.value)}
              unit={NUTRIENT_UNITS.protein}
            />
            <StatTile
              label={tNutrients('carbs')}
              value={roundForDisplay('carbs', totals.carbs.value)}
              unit={NUTRIENT_UNITS.carbs}
            />
            <StatTile
              label={tNutrients('fat')}
              value={roundForDisplay('fat', totals.fat.value)}
              unit={NUTRIENT_UNITS.fat}
            />
          </StatGrid>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <FormMessage state={state} />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ms-auto"
          onClick={() => (onCancel ? onCancel() : router.push('/app/dishes'))}
        >
          {tCommon('cancel')}
        </Button>
        <SubmitButton label={t('editor.submit')} pendingLabel={t('editor.submitting')} />
      </div>
    </form>
  );
}

/**
 * A group of pill checkboxes over a closed set — the same construction
 * `AllergenField` uses on the client intake form: a real `<input
 * type="checkbox">`, visually hidden, with the pill drawn on the label around
 * it by `:has-checked`. That keeps the group a plain HTML checkbox group (so it
 * submits with the rest of an uncontrolled-looking form and works for a screen
 * reader) while reading as a row of chips rather than a column of boxes.
 *
 * `tone="medical"` is for allergens only: ticking one is a clinical exclusion,
 * not a preference, and olive here would read as "selected" rather than
 * "excluded" — the same reasoning `AllergenField` documents.
 */
function PillCheckboxGroup({
  legend,
  name,
  options,
  selected,
  onToggle,
  tone = 'neutral',
}: {
  legend: string;
  name: string;
  options: readonly { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  tone?: 'neutral' | 'medical';
}) {
  const uid = useId();

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-body-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const inputId = `${uid}-${option.value}`;
          const checked = selected.includes(option.value);

          return (
            <label
              key={option.value}
              htmlFor={inputId}
              className={cn(
                'flex h-10 cursor-pointer items-center rounded-full border border-input px-4',
                'text-body-sm font-medium text-foreground transition-colors duration-180 ease-out',
                'not-has-checked:hover:border-(--input-hover) not-has-checked:hover:bg-secondary',
                tone === 'medical'
                  ? 'has-checked:border-transparent has-checked:bg-status-medical-bg has-checked:font-semibold has-checked:text-status-medical-fg'
                  : 'has-checked:border-transparent has-checked:bg-secondary has-checked:font-semibold has-checked:text-primary',
              )}
            >
              <input
                id={inputId}
                type="checkbox"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onToggle(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** One recipe line: a food, its grams, and the optional client-facing extras. */
function IngredientRow({
  row,
  locale,
  removable,
  onChange,
  onPick,
  onChangeFood,
  onRemove,
}: {
  row: IngredientRowState;
  locale: string;
  removable: boolean;
  onChange: (patch: Partial<IngredientRowState>) => void;
  onPick: (food: FoodSearchResult) => void;
  onChangeFood: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations('dishEditor');

  return (
    <Card variant="tile">
      <div className="flex items-start justify-between gap-2">
        {row.food ? (
          <div className="min-w-0 flex-1">
            <p className="font-medium" dir="auto">
              {row.food.description}
            </p>
            <p className="text-caption text-muted-foreground">
              {t('foodPicker.kcalPer100g', { kcal: Math.round(row.food.kcal) })}
            </p>
          </div>
        ) : (
          <p className="text-body-sm text-muted-foreground">{t('editor.pickFoodHint')}</p>
        )}

        <Button
          type="button"
          size="icon-sm"
          variant="destructiveGhost"
          disabled={!removable}
          aria-label={t('editor.removeIngredient')}
          onClick={onRemove}
        >
          <Icon name="trash" />
        </Button>
      </div>

      {row.food ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <Label htmlFor={`${row.key}-grams`}>{t('editor.quantityGrams')}</Label>
              <Input
                id={`${row.key}-grams`}
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                required
                value={row.quantityGrams}
                onChange={(event) => onChange({ quantityGrams: event.target.value })}
              />
            </Field>

            <Field>
              <Label htmlFor={`${row.key}-name-ar`}>{t('editor.displayNameAr')}</Label>
              <Input
                id={`${row.key}-name-ar`}
                dir="rtl"
                maxLength={120}
                value={row.displayNameAr}
                onChange={(event) => onChange({ displayNameAr: event.target.value })}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <Label htmlFor={`${row.key}-household-label`}>{t('editor.householdLabel')}</Label>
              <Input
                id={`${row.key}-household-label`}
                dir="auto"
                maxLength={60}
                value={row.householdLabel}
                onChange={(event) => onChange({ householdLabel: event.target.value })}
              />
            </Field>

            <Field>
              <Label htmlFor={`${row.key}-household-grams`}>{t('editor.householdGrams')}</Label>
              <Input
                id={`${row.key}-household-grams`}
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={row.householdGrams}
                onChange={(event) => onChange({ householdGrams: event.target.value })}
              />
            </Field>
          </div>

          <Button type="button" variant="link" size="sm" className="self-start" onClick={onChangeFood}>
            <Icon name="edit" />
            {t('editor.changeFood')}
          </Button>
        </>
      ) : (
        <FoodPicker locale={locale} onPick={onPick} />
      )}
    </Card>
  );
}

function FormMessage({ state }: { state: CatalogFormState }) {
  const t = useTranslations('weeklyPlans');
  if (state.status !== 'error') return null;

  return (
    <p role="alert" className="text-body-sm text-destructive">
      {t(state.messageKey)}
    </p>
  );
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

