'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field, FieldError, FieldHint } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { ALLERGENS } from '@/features/clients/nutrition';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

import { createDishAction, updateDishAction } from '../catalog-actions';
import { initialCatalogFormState, type CatalogFormState } from '../catalog-form-state';
import { getFoodDisplayName } from '../food-display';
import {
  deriveUnitOptions,
  defaultUnitKey,
  findUnit,
  rowGrams,
  resolveSavedRow,
  GRAMS_UNIT,
  type UnitOption,
} from '../ingredient-units';
import {
  dishTotals,
  nutritionCategory,
  NUTRIENT_UNITS,
  roundForDisplay,
  type DishIngredientDetail,
} from '../nutrition';
import type { RefinedFood } from '../ingredient-refine';
import type { DishEditData, FoodSearchResult } from '../queries';
import { DISH_TAGS, MEAL_TYPES } from '../schema';

import { IngredientSearch } from './food-picker';

/**
 * The dish builder (spec Part C). A workspace, not a long form: the dietitian
 * names the dish, then *builds* its recipe — search a food, choose a natural
 * quantity, watch the nutrition update — and the ingredient builder is what
 * dominates the page.
 *
 * The nutrition label is never typed in. It is `dishTotals` and `nutritionCategory`
 * run live on the rows on screen — the same functions the meal-detail panel runs
 * on a placed dish — so "high protein" is a fact derived from the recipe, never a
 * claim the dietitian can hand-set to disagree with the food (spec §32, §34).
 */

/**
 * The manual labels a dietitian may choose by hand — exactly `DISH_TAGS`, the
 * practical set. Nutrition labels are absent by design (see the module note).
 */
const DISH_LABELS = DISH_TAGS;

/** Meal categories in the order the spec's chips read: breakfast, lunch, dinner, snack. */
const MEAL_CATEGORY_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

let rowSeq = 0;

type IngredientRowState = {
  key: string;
  /** Always a real food now — a row *is* a chosen ingredient (spec §15). */
  food: FoodSearchResult;
  /** What the dietitian typed — a count of `unitKey`, not grams. */
  quantity: string;
  /** One of the units `deriveUnitOptions(food)` offers. */
  unitKey: string;
};

/** Formats a reloaded quantity for the input: whole numbers plain, else trimmed to 3 dp. */
function formatQuantity(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded);
}

/**
 * Turns a saved ingredient back into an editable row.
 *
 * The recipe's stored grams are authoritative — `resolveSavedRow` expresses them
 * back in the saved unit without rescaling, so reopening and saving an untouched
 * dish writes the same grams it held (spec §49 Scenario C). See `ingredient-units.ts`.
 */
function rowFromIngredient(ingredient: DishEditData['ingredients'][number]): IngredientRowState {
  rowSeq += 1;
  const { unitKey, quantity } = resolveSavedRow(ingredient.food, {
    quantityGrams: ingredient.quantityGrams,
    householdLabel: ingredient.householdLabel,
    householdGrams: ingredient.householdGrams,
  });
  return { key: `row-${rowSeq}`, food: ingredient.food, quantity: formatQuantity(quantity), unitKey };
}

export function DishEditor({
  locale,
  dish,
  onSuccess,
  onCancel,
  onDirtyChange,
  search,
}: {
  locale: string;
  /**
   * An existing clinic dish to edit. Absent for the "add" flow. When present the
   * form preloads its fields and submits through `updateDishAction`, carrying the
   * dish id so the write targets the same row.
   */
  dish?: DishEditData;
  /** Called instead of the page redirect when the dish is saved (the dialog closes). */
  onSuccess?: () => void;
  /** Overrides the Cancel button's page redirect for the same reason. */
  onCancel?: () => void;
  /** Reports whether the form holds unsaved edits, so the dialog can guard closing. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Injectable ingredient search for the dev harness; defaults to the real action. */
  search?: (locale: string, query: string) => Promise<RefinedFood[]>;
}): React.JSX.Element {
  const t = useTranslations('dishEditor');
  const tCommon = useTranslations('common');
  const tNutrients = useTranslations('weeklyPlans.nutrients');
  // Meal times, labels and allergens already have translated names in the catalog
  // (`dishes.mealTypes` / `.tags` / `.allergens`) — reused here rather than
  // duplicated, since a dish created in the editor and read back in the catalog
  // must say the same thing.
  const tDishes = useTranslations('dishes');

  const isEditing = dish !== undefined;
  const [state, formAction] = useActionState(
    isEditing ? updateDishAction : createDishAction,
    initialCatalogFormState,
  );

  // Controlled so the app can validate on submit and clear the error as the
  // dietitian types — no native `required`, whose browser bubble is unstyled,
  // untranslated, and breaks the design system (spec §27). English is optional and
  // lives in "additional details" (spec §14).
  const [nameAr, setNameAr] = useState(() => dish?.nameAr ?? '');
  const [nameEn, setNameEn] = useState(() => dish?.nameEn ?? '');
  const [baseServingLabel, setBaseServingLabel] = useState(() => dish?.baseServingLabel ?? 'حصة');
  const [mealTypes, setMealTypes] = useState<string[]>(() => dish?.mealTypes ?? []);
  const [tags, setTags] = useState<string[]>(() => dish?.tags ?? []);
  const [allergenTags, setAllergenTags] = useState<string[]>(() => dish?.allergenTags ?? []);
  const [rows, setRows] = useState<IngredientRowState[]>(() =>
    dish ? dish.ingredients.map(rowFromIngredient) : [],
  );
  // The row whose quantity input should grab focus on mount — a food added in
  // grams starts blank, so the dietitian's next move is to type the weight
  // (spec §26, §30). Household-unit foods start at a sensible count and need none.
  const [focusRowKey, setFocusRowKey] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  // The dialog guards closing when there are unsaved edits (spec §1). "Dirty" is
  // the form state diverging from what it opened with — compared as a snapshot so
  // adding then removing an ingredient reads as clean again.
  const snapshot = JSON.stringify({
    nameAr,
    nameEn,
    baseServingLabel,
    mealTypes,
    tags,
    allergenTags,
    rows: rows.map((row) => ({ f: row.food.id, q: row.quantity, u: row.unitKey })),
  });
  // Captured once at mount via a lazy initial state (not a ref — reading a ref
  // during render is disallowed, and this value must be readable during render).
  const [initialSnapshot] = useState(() => snapshot);
  const dirty = snapshot !== initialSnapshot;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  function toggle(list: string[], value: string, setList: (next: string[]) => void) {
    setList(list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]);
  }

  function updateRow(key: string, patch: Partial<IngredientRowState>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  /**
   * Adds a searched food as a new ingredient row, started in its natural unit — a
   * piece of egg, a cup of rice, grams of chicken — with a sensible quantity: one
   * of a household unit, or blank for grams so the dietitian types the weight.
   */
  function addFood(food: FoodSearchResult) {
    rowSeq += 1;
    const key = `row-${rowSeq}`;
    const unitKey = defaultUnitKey(deriveUnitOptions(food));
    const grams = unitKey === 'g';
    setRows((prev) => [...prev, { key, food, unitKey, quantity: grams ? '' : '1' }]);
    setFocusRowKey(grams ? key : null);
  }

  /*
   * Each row costed once: its unit menu, the grams it contributes (quantity × the
   * chosen unit's grams), and the calories that weight carries. Grams is the one
   * figure nutrition ever sees — there is no second calculation path.
   */
  const preparedRows = useMemo(
    () =>
      rows.map((row) => {
        const options = deriveUnitOptions(row.food);
        const unit = findUnit(options, row.unitKey) ?? GRAMS_UNIT;
        const grams = rowGrams(options, Number(row.quantity), row.unitKey);
        return { row, options, unit, grams };
      }),
    [rows],
  );

  /*
   * What the recipe actually is: the rows with a positive amount. A row awaiting
   * its weight simply does not count yet — the dietitian is mid-edit, not making a
   * mistake.
   */
  const completeRows = useMemo(
    () => preparedRows.filter((prepared) => prepared.grams > 0),
    [preparedRows],
  );

  const nutritionDetails: DishIngredientDetail[] = useMemo(
    () => completeRows.map((prepared) => ({ quantityGrams: prepared.grams, food: prepared.row.food })),
    [completeRows],
  );

  const totals = useMemo(() => dishTotals(nutritionDetails, 1), [nutritionDetails]);
  const category = useMemo(() => nutritionCategory(totals), [totals]);

  const ingredientsJson = useMemo(
    () =>
      JSON.stringify(
        completeRows.map((prepared) => ({
          foodId: prepared.row.food.id,
          quantityGrams: prepared.grams,
          // The unit and its grams travel too, so reopening the dish shows "2
          // pieces" rather than "100 g" — without ever being a second source of
          // nutrition truth.
          householdLabel: prepared.unit.key,
          householdGrams: prepared.unit.gramsPerUnit,
        })),
      ),
    [completeRows],
  );

  const nameArValid = nameAr.trim().length > 0;
  const mealTypesValid = mealTypes.length > 0;
  const ingredientsValid = completeRows.length > 0;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (!nameArValid || !mealTypesValid || !ingredientsValid) {
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
    <form
      action={formAction}
      onSubmit={handleSubmit}
      className="flex min-h-0 flex-1 flex-col"
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="ingredients" value={ingredientsJson} />
      {isEditing && <input type="hidden" name="dishId" value={dish.id} />}
      {/*
        The choice groups and the "additional details" fields post from state
        through hidden inputs, so a collapsed details section (which holds the
        allergens and the English name) still submits everything it carries.
      */}
      <input type="hidden" name="nameEn" value={nameEn} />
      <input type="hidden" name="baseServingLabel" value={baseServingLabel.trim() || 'حصة'} />
      {mealTypes.map((value) => (
        <input key={value} type="hidden" name="mealTypes" value={value} />
      ))}
      {tags.map((value) => (
        <input key={value} type="hidden" name="tags" value={value} />
      ))}
      {allergenTags.map((value) => (
        <input key={value} type="hidden" name="allergenTags" value={value} />
      ))}

      {/* The scroll region — the sticky nutrition sidebar tracks against it. */}
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-6">
        {/*
          Desktop: the builder gets the room, the nutrition rides alongside in a
          narrow sticky column. Mobile: one column, and the nutrition falls in
          right below the ingredients as a compact strip (spec §13, §31, §37–38).
        */}
        <div className="grid gap-x-8 gap-y-7 lg:grid-cols-[minmax(0,1fr)_15rem]">
          <div className="flex min-w-0 flex-col gap-7">
            {/* 1. Dish name — Arabic is the primary, working name (spec §14). */}
            <Field>
              <Label htmlFor="nameAr">{t('editor.nameAr')}</Label>
              <Input
                id="nameAr"
                name="nameAr"
                dir="rtl"
                maxLength={120}
                value={nameAr}
                onChange={(event) => setNameAr(event.target.value)}
                placeholder={t('editor.nameArPlaceholder')}
                aria-invalid={(attempted && !nameArValid) || undefined}
              />
              {attempted && !nameArValid && <FieldError>{t('editor.errors.nameRequired')}</FieldError>}
            </Field>

            {/* 2. The ingredient builder — the centre of the workspace. */}
            <section className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-heading text-heading-sm font-semibold">
                  {t('editor.ingredientsHeading')}
                </h2>
                {rows.length > 0 && (
                  <span className="text-caption text-muted-foreground">
                    {t('editor.ingredientCount', { count: rows.length })}
                  </span>
                )}
              </div>

              {/* The search *is* how an ingredient is added (spec §15). */}
              <IngredientSearch locale={locale} onPick={addFood} search={search} />

              {rows.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-body-sm text-muted-foreground">
                  {t('editor.noIngredientsYet')}
                </p>
              ) : (
                <ul className="flex flex-col">
                  {preparedRows.map(({ row, options, grams }) => (
                    <IngredientRow
                      key={row.key}
                      row={row}
                      options={options}
                      grams={grams}
                      locale={locale}
                      autoFocusQuantity={row.key === focusRowKey}
                      onChange={(patch) => updateRow(row.key, patch)}
                      onRemove={() => setRows((prev) => prev.filter((entry) => entry.key !== row.key))}
                    />
                  ))}
                </ul>
              )}

              {attempted && !ingredientsValid && (
                <FieldError>{t('editor.errors.ingredientRequired')}</FieldError>
              )}
            </section>
          </div>

          {/* 3. Live nutrition — quiet, sticky beside the builder on desktop. */}
          <aside className="lg:pt-[2.1rem]">
            <div className="lg:sticky lg:top-0">
              <NutritionSummary
                totals={totals}
                empty={completeRows.length === 0}
                title={t('editor.nutritionTitle')}
                emptyLabel={t('editor.nutritionEmpty')}
                categoryLabel={t(`editor.categories.${category}`)}
                label={(key) => tNutrients(key)}
              />
            </div>
          </aside>
        </div>

        {/* Metadata sits below the builder, full width. */}
        <div className="mt-8 flex flex-col gap-7 border-t border-border pt-7">
          {/* 4. Meal category — compact selectable chips (spec §33). */}
          <div>
            <PillCheckboxGroup
              legend={t('editor.mealTypesLegend')}
              options={MEAL_CATEGORY_ORDER.filter((value) => MEAL_TYPES.includes(value)).map((value) => ({
                value,
                label: tDishes(`mealTypes.${value}`),
              }))}
              selected={mealTypes}
              onToggle={(value) => toggle(mealTypes, value, setMealTypes)}
            />
            {attempted && !mealTypesValid && (
              <FieldError className="mt-2">{t('editor.errors.mealTypeRequired')}</FieldError>
            )}
          </div>

          {/* 5. Practical tags (spec §34). */}
          <PillCheckboxGroup
            legend={t('editor.labelsLegend')}
            options={DISH_LABELS.map((value) => ({ value, label: tDishes(`tags.${value}`) }))}
            selected={tags}
            onToggle={(value) => toggle(tags, value, setTags)}
          />

          {/* 6. Additional details — the rarely-touched fields, out of the main flow. */}
          <Collapsible>
            <CollapsibleTrigger
              type="button"
              className="group flex w-full items-center gap-2 text-label font-semibold text-foreground"
            >
              <Icon
                name="chevronDown"
                className="size-4 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180"
              />
              {t('editor.additionalDetails')}
            </CollapsibleTrigger>

            <CollapsibleContent className="flex flex-col gap-5 pt-4">
              <Field>
                <Label htmlFor="nameEn">{t('editor.nameEn')}</Label>
                <Input
                  id="nameEn"
                  dir="ltr"
                  maxLength={120}
                  value={nameEn}
                  onChange={(event) => setNameEn(event.target.value)}
                  placeholder={t('editor.nameEnPlaceholder')}
                />
              </Field>

              <div>
                <PillCheckboxGroup
                  legend={t('editor.allergensLegend')}
                  options={ALLERGENS.map((value) => ({ value, label: tDishes(`allergens.${value}`) }))}
                  selected={allergenTags}
                  onToggle={(value) => toggle(allergenTags, value, setAllergenTags)}
                  tone="medical"
                />
                <FieldHint className="mt-2">{t('editor.allergensHint')}</FieldHint>
              </div>

              <Field className="sm:max-w-xs">
                <Label htmlFor="baseServingLabel">{t('editor.baseServingLabel')}</Label>
                <Input
                  id="baseServingLabel"
                  dir="auto"
                  maxLength={60}
                  value={baseServingLabel}
                  onChange={(event) => setBaseServingLabel(event.target.value)}
                />
                <FieldHint>{t('editor.baseServingHint')}</FieldHint>
              </Field>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>

      {/* 7. Save — a fixed footer so it stays reachable on a long recipe (spec §38). */}
      <div className="flex shrink-0 items-center gap-3 border-t border-border px-5 py-4 sm:px-6">
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
        <SubmitButton
          label={t(isEditing ? 'editor.saveChanges' : 'editor.submit')}
          pendingLabel={t('editor.submitting')}
        />
      </div>
    </form>
  );
}

/**
 * The live nutrition read-out, computed from the rows on screen (spec §31).
 *
 * Deliberately quiet: one energy figure, the three macros beneath it, and the
 * recipe-derived category badge. It never competes with the ingredient builder,
 * where the work happens — it only reports.
 */
function NutritionSummary({
  totals,
  empty,
  title,
  emptyLabel,
  categoryLabel,
  label,
}: {
  totals: ReturnType<typeof dishTotals>;
  empty: boolean;
  title: string;
  emptyLabel: string;
  categoryLabel: string;
  label: (key: 'protein' | 'carbs' | 'fat') => string;
}) {
  return (
    <section className="rounded-lg border border-border bg-muted/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-label font-semibold text-muted-foreground">{title}</h2>
        {!empty && (
          <Badge variant="outline" size="sm">
            {categoryLabel}
          </Badge>
        )}
      </div>

      {empty ? (
        <p className="mt-3 text-body-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <>
          <p className="mt-3 font-heading text-heading-lg font-semibold tabular-nums" dir="ltr">
            {roundForDisplay('kcal', totals.kcal.value)}{' '}
            <span className="text-body-sm font-normal text-muted-foreground">{NUTRIENT_UNITS.kcal}</span>
          </p>
          <dl className="mt-2 flex flex-col gap-1 text-body-sm lg:mt-3">
            {(['protein', 'carbs', 'fat'] as const).map((key) => (
              <div key={key} className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{label(key)}</dt>
                <dd className="font-medium tabular-nums" dir="ltr">
                  {roundForDisplay(key, totals[key].value)}
                  {NUTRIENT_UNITS[key]}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}

/**
 * A group of pill checkboxes over a closed set — a real `<input type="checkbox">`,
 * visually hidden, with the pill drawn on the label around it by `:has-checked`,
 * so the group reads as a row of chips while staying a keyboard-and-screen-reader
 * checkbox group.
 *
 * It is a **controlled UI only**: the checkboxes carry no `name` and do not submit.
 * The editor posts each group's values from React state through hidden inputs, so
 * a group can sit inside a collapsed "additional details" section (the allergens
 * do) and still submit everything it holds.
 *
 * `tone="medical"` is for allergens only: ticking one is a clinical exclusion, not
 * a preference, and olive here would read as "selected" rather than "excluded".
 */
function PillCheckboxGroup({
  legend,
  options,
  selected,
  onToggle,
  tone = 'neutral',
}: {
  legend: string;
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

/**
 * One recipe line — compact and inline-editable (spec §16–17): the food's friendly
 * name, a quantity, a unit, the calories that weight carries, and a remove. Grams
 * is one unit in the list, not a field of its own; the household grams, the source,
 * and the USDA description all stay behind the UI (spec §16).
 */
function IngredientRow({
  row,
  options,
  grams,
  locale,
  autoFocusQuantity,
  onChange,
  onRemove,
}: {
  row: IngredientRowState;
  options: UnitOption[];
  /** Grams this row contributes right now — drives the live per-row calories. */
  grams: number;
  locale: string;
  /** Focus the quantity on mount (a grams food added blank — spec §26, §30). */
  autoFocusQuantity: boolean;
  onChange: (patch: Partial<IngredientRowState>) => void;
  onRemove: () => void;
}) {
  const t = useTranslations('dishEditor');
  const quantityRef = useRef<HTMLInputElement>(null);
  const rowKcal = grams > 0 ? Math.round((grams / 100) * row.food.kcal) : null;

  useEffect(() => {
    if (autoFocusQuantity) quantityRef.current?.focus();
    // Runs once on mount; a row only mounts when its food is first added.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border py-2.5 last:border-b-0">
      {/* Friendly name only — no raw English secondary when an Arabic name exists
          (Phase 2 §4). */}
      <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
        <p className="truncate font-medium" dir="auto">
          {getFoodDisplayName(row.food, locale)}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Input
          ref={quantityRef}
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          required
          aria-label={t('editor.amount')}
          value={row.quantity}
          onChange={(event) => onChange({ quantity: event.target.value })}
          className="h-10 w-20 px-3"
        />

        <SelectField
          size="sm"
          aria-label={t('editor.unitAria')}
          value={row.unitKey}
          onValueChange={(next) => onChange({ unitKey: next })}
          options={options.map((option) => ({
            value: option.key,
            label: t(`editor.units.${option.key}`),
          }))}
          className="w-28"
        />
      </div>

      <span
        className="ms-auto w-16 shrink-0 text-end text-body-sm text-muted-foreground tabular-nums"
        dir="ltr"
      >
        {rowKcal !== null ? t('editor.rowKcal', { kcal: rowKcal }) : ''}
      </span>

      <Button
        type="button"
        size="icon-sm"
        variant="destructiveGhost"
        aria-label={t('editor.removeIngredient')}
        onClick={onRemove}
      >
        <Icon name="close" />
      </Button>
    </li>
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
