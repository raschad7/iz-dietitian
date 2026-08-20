'use client';

import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field, FieldError, FieldHint } from '@/components/ui/field';
import { Icon, type IconName } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Spinner } from '@/components/ui/spinner';
import { ALLERGENS } from '@/features/clients/nutrition';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

import { createDishAction, searchDishNamesAction, updateDishAction } from '../catalog-actions';
import { normalizeArabic } from '../arabic-normalize';
import { initialCatalogFormState, type CatalogFormState } from '../catalog-form-state';
import { localizedName } from '../food-display';
import {
  defaultUnitValue,
  findUnitOption,
  GRAMS_OPTION,
  GRAMS_UNIT,
  resolveSavedRow,
  rowGrams,
  unitLabel,
  unitOptions,
  type UnitOption,
} from '../ingredient-units';
import {
  dishTotals,
  energySplit,
  nutritionCategory,
  NUTRIENT_UNITS,
  roundForDisplay,
  type DishIngredientDetail,
} from '../nutrition';
import { dishTagDotClasses } from '../meal-tag-tone';
import type { RefinedFood } from '../ingredient-refine';
import type { DishEditData, DishNameSuggestion, FoodSearchResult } from '../queries';
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

/** Each meal's own glyph — the same set the catalog and the planner draw. */
const MEAL_ICON: Record<(typeof MEAL_CATEGORY_ORDER)[number], IconName> = {
  breakfast: 'mealBreakfast',
  lunch: 'mealLunch',
  dinner: 'mealDinner',
  snack: 'mealSnack',
};

let rowSeq = 0;

type IngredientRowState = {
  key: string;
  /** Always a real food now — a row *is* a chosen ingredient (spec §15). */
  food: FoodSearchResult;
  /** What the dietitian typed — a count of `unitValue`, not grams. */
  quantity: string;
  /** `'g'`, or the id of one of this food's own portions. Never another food's. */
  unitValue: string;
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
  const { unitValue, quantity } = resolveSavedRow(ingredient.food, {
    quantityGrams: ingredient.quantityGrams,
    portionId: ingredient.portionId,
  });
  return { key: `row-${rowSeq}`, food: ingredient.food, quantity: formatQuantity(quantity), unitValue };
}

export function DishEditor({
  locale,
  dish,
  onSuccess,
  onCancel,
  onDirtyChange,
  search,
  searchDishNames,
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
  /** Injectable existing-dish search for the dev harness; defaults to the real action. */
  searchDishNames?: (
    locale: string,
    query: string,
    excludeDishId?: string,
  ) => Promise<DishNameSuggestion[]>;
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
  // Kept as a storage compatibility detail, not a user decision. Existing
  // dishes retain their saved label; new dishes use the catalog's established
  // Arabic-first default.
  const baseServingLabel = dish?.baseServingLabel ?? 'حصة';
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
    mealTypes,
    tags,
    allergenTags,
    rows: rows.map((row) => ({ f: row.food.id, q: row.quantity, u: row.unitValue })),
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
    const unitValue = defaultUnitValue(food);
    const grams = unitValue === GRAMS_UNIT;
    setRows((prev) => [...prev, { key, food, unitValue, quantity: grams ? '' : '1' }]);
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
        const options = unitOptions(row.food);
        /*
         * A unit this food does not offer falls back to grams, here rather than
         * anywhere downstream.
         *
         * Portion ids belong to exactly one food, so a selection that survived a
         * food changing underneath it would either be rejected on save or, worse,
         * measure this line with another food's cup. Resolving against *this*
         * food's own options every render means a foreign portion can never reach
         * `ingredientsJson`, and `rowGrams` returns 0 for it so the row stays out
         * of the recipe until the dietitian picks a real unit.
         */
        const unit = findUnitOption(options, row.unitValue) ?? GRAMS_OPTION;
        const grams = rowGrams(options, Number(row.quantity), unit.value);
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
          // Already multiplied out. This is the only number the server computes
          // nutrition from; the portion below is a record of how it was typed.
          quantityGrams: prepared.grams,
          portionId: prepared.unit.portion?.id ?? null,
          portionQuantity: prepared.unit.portion ? Number(prepared.row.quantity) : null,
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

      {/* The dialog's only scroll region; its header and action footer stay outside. */}
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-6">
        {/*
          Two independent desktop stacks: **what you build** and **what it comes
          to / how it is classified**.

          Meal types, qualities, and optional details used to begin only after the
          entire recipe row ended, leaving a tall blank strip beneath the shorter
          nutrition panel while the dialog scrolled. Keeping them in the supporting
          stack removes that artificial grid-row gap. Below `lg`, the same two
          stacks collapse into one natural form flow.
        */}
        <div className="grid gap-x-8 gap-y-7 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-6">
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
              <ExistingDishMatches
                locale={locale}
                query={nameAr}
                excludeDishId={dish?.id}
                search={searchDishNames}
              />
            </Field>

            {/*
              2. The ingredient builder.

              A bordered panel, where it used to be loose elements on the page
              ground. The recipe is a *container* — a heading, a search that
              feeds it, and a list that grows — and drawing it as one gave the
              search box something to belong to instead of floating between a
              heading and a dashed box that repeated what it already said.
            */}
            <section className="flex flex-col overflow-hidden rounded-xl border border-border">
              <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-3">
                <h2 className="text-label font-semibold">{t('editor.ingredientsHeading')}</h2>
                <span className="text-caption text-muted-foreground">
                  {t('editor.ingredientCount', { count: rows.length })}
                </span>
              </div>

              <div className="p-4">
                {/* The search *is* how an ingredient is added (spec §15). */}
                <IngredientSearch locale={locale} onPick={addFood} search={search} />
              </div>

              {/*
                No empty-state line of its own. The panel header already says
                "no ingredients" and the search below it already says "search for
                an ingredient, or add your own" — a third sentence between them
                telling you to search above was the same instruction a third
                time, and it was the widest thing in the panel.
              */}
              {rows.length > 0 && (
                <ul className="flex flex-col border-t border-border">
                  {preparedRows.map(({ row, options, unit, grams }) => (
                    <IngredientRow
                      key={row.key}
                      row={row}
                      options={options}
                      unit={unit}
                      grams={grams}
                      locale={locale}
                      autoFocusQuantity={row.key === focusRowKey}
                      onChange={(patch) => updateRow(row.key, patch)}
                      onRemove={() => setRows((prev) => prev.filter((entry) => entry.key !== row.key))}
                    />
                  ))}
                </ul>
              )}
            </section>

            {attempted && !ingredientsValid && (
              <FieldError>{t('editor.errors.ingredientRequired')}</FieldError>
            )}
          </div>

          {/*
            3. Live nutrition — the other half, and it stays where it is put.

            This was `sticky top-0`, which meant the panel detached from the
            recipe and slid up the column the moment the dialog scrolled. Sticky
            earns its keep for a toolbar you reach for at any moment; this panel
            is read *against* the ingredient list beside it, and a figure that
            drifts out of line with the row that produced it is harder to read,
            not easier. It also never had a fixed anchor to stick to — the
            dialog's scroll container is its own box — so it slid past its own
            heading on the way.
          */}
          <aside className="flex min-w-0 flex-col gap-7">
            <NutritionSummary
              totals={totals}
              empty={completeRows.length === 0}
              title={t('editor.nutritionTitle')}
              servingLabel={t('editor.perServing', { unit: baseServingLabel })}
              emptyLabel={t('editor.nutritionEmpty')}
              categoryLabel={t(`editor.categories.${category}`)}
              shareLabel={t('editor.energyShare')}
              label={(key) => tNutrients(key)}
            />

            <div className="border-t border-border pt-6">
              <PillCheckboxGroup
                legend={t('editor.mealTypesLegend')}
                options={MEAL_CATEGORY_ORDER.filter((value) => MEAL_TYPES.includes(value)).map((value) => ({
                  value,
                  label: tDishes(`mealTypes.${value}`),
                  icon: MEAL_ICON[value],
                }))}
                selected={mealTypes}
                onToggle={(value) => toggle(mealTypes, value, setMealTypes)}
              />
              {attempted && !mealTypesValid && (
                <FieldError className="mt-2">{t('editor.errors.mealTypeRequired')}</FieldError>
              )}
            </div>

            <PillCheckboxGroup
              legend={t('editor.labelsLegend')}
              hint={t('editor.labelsHint')}
              options={DISH_LABELS.map((value) => ({
                value,
                label: tDishes(`tags.${value}`),
                dot: dishTagDotClasses(value),
              }))}
              selected={tags}
              onToggle={(value) => toggle(tags, value, setTags)}
            />

            <Collapsible className="border-t border-border pt-6">
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
              </CollapsibleContent>
            </Collapsible>
          </aside>
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

type ExistingDishStatus = 'idle' | 'loading' | 'done' | 'error';

/**
 * A quiet duplicate check attached to the name field, not a second picker.
 *
 * The dietitian is still naming a new dish, so the matches are intentionally
 * read-only: turning this into a combobox would imply that choosing an existing
 * dish fills this creation form. Prefix results appear after two characters,
 * stay visible while the next request runs, and an exact normalized match is
 * called out without hard-blocking a legitimate clinic-specific variation.
 */
function ExistingDishMatches({
  locale,
  query,
  excludeDishId,
  search = searchDishNamesAction,
}: {
  locale: string;
  query: string;
  excludeDishId?: string;
  search?: (
    locale: string,
    query: string,
    excludeDishId?: string,
  ) => Promise<DishNameSuggestion[]>;
}) {
  const t = useTranslations('dishEditor.editor');
  const tDishes = useTranslations('dishes');
  const [matches, setMatches] = useState<DishNameSuggestion[]>([]);
  const [status, setStatus] = useState<ExistingDishStatus>('idle');
  const [statusKey, setStatusKey] = useState('');
  const requestSeq = useRef(0);
  const cache = useRef(new Map<string, DishNameSuggestion[]>());

  useEffect(() => {
    const term = query.trim();
    if (normalizeArabic(term).length < 2) {
      requestSeq.current += 1;
      return;
    }

    const key = `${excludeDishId ?? ''}:${term}`;
    const cached = cache.current.get(key);
    const timeout = window.setTimeout(async () => {
      const seq = (requestSeq.current += 1);
      setStatusKey(key);
      if (cached) {
        setMatches(cached);
        setStatus('done');
        return;
      }

      setStatus('loading');
      try {
        const found = await search(locale, term, excludeDishId);
        cache.current.set(key, found);
        if (seq !== requestSeq.current) return;
        setMatches(found);
        setStatus('done');
      } catch {
        if (seq !== requestSeq.current) return;
        setMatches([]);
        setStatus('error');
      }
    }, cached ? 0 : 200);

    return () => window.clearTimeout(timeout);
  }, [excludeDishId, locale, query, search]);

  const normalizedQuery = normalizeArabic(query.trim());
  const currentKey = `${excludeDishId ?? ''}:${query.trim()}`;
  const currentStatus = statusKey === currentKey ? status : 'idle';
  const visibleMatches = matches.filter(
    (dish) =>
      normalizeArabic(dish.nameAr).startsWith(normalizedQuery) ||
      normalizeArabic(dish.nameEn).startsWith(normalizedQuery),
  );
  const exactMatch = visibleMatches.some(
    (dish) =>
      normalizeArabic(dish.nameAr) === normalizedQuery ||
      normalizeArabic(dish.nameEn) === normalizedQuery,
  );

  if (normalizedQuery.length < 2 || currentStatus === 'idle') return null;

  return (
    <div aria-live="polite" className="flex flex-col gap-2">
      {currentStatus === 'error' ? (
        <FieldHint>{t('existingSearchError')}</FieldHint>
      ) : visibleMatches.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border bg-muted/30">
          <div className="flex items-start gap-2 border-b border-border px-3 py-2.5">
            <Icon
              name={exactMatch ? 'attention' : 'info'}
              className={cn(
                'mt-0.5 size-4 shrink-0',
                exactMatch ? 'text-status-attention-fg' : 'text-muted-foreground',
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="text-label font-semibold">
                {t(exactMatch ? 'exactMatchTitle' : 'existingMatchesTitle')}
              </p>
              <p className="text-caption text-muted-foreground">
                {t(exactMatch ? 'exactMatchHint' : 'existingMatchesHint')}
              </p>
            </div>
            {currentStatus === 'loading' ? <Spinner className="mt-0.5" /> : null}
          </div>

          <ul className="divide-y divide-border" aria-label={t('existingMatchesTitle')}>
            {visibleMatches.map((dish) => {
              const exact =
                normalizeArabic(dish.nameAr) === normalizedQuery ||
                normalizeArabic(dish.nameEn) === normalizedQuery;

              return (
                <li key={dish.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body-sm font-medium" dir="auto">
                      {locale === 'ar' ? dish.nameAr : dish.nameEn || dish.nameAr}
                    </span>
                    {dish.nameEn && dish.nameEn !== dish.nameAr ? (
                      <span className="block truncate text-caption text-muted-foreground" dir="auto">
                        {locale === 'ar' ? dish.nameEn : dish.nameAr}
                      </span>
                    ) : null}
                  </span>
                  <Badge variant={exact ? 'attention' : 'muted'} size="sm">
                    {exact
                      ? t('exactMatch')
                      : tDishes(dish.clinicId ? 'ownership.clinic' : 'ownership.system')}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </div>
      ) : currentStatus === 'loading' ? (
        <span className="flex items-center gap-2 text-caption text-muted-foreground">
          <Spinner />
          {t('checkingExisting')}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The live nutrition read-out, computed from the rows on screen (spec §31).
 *
 * ## Why there are meters now
 *
 * The panel used to print four numbers: energy, then protein / carbs / fat in
 * grams. Correct, and it left the one question the panel is actually answering
 * unanswered — *why does this dish say "balanced"?* That badge comes from
 * `nutritionCategory()`, which reads the share of **energy** each macro
 * contributes (protein ≥ 30% → high protein, carbs ≥ 55%, fat ≥ 40%), and the
 * share of energy is exactly what grams do not show: 4.2 g of fat next to 17.4 g
 * of carbs looks like a quarter as much and is more than half as much energy.
 *
 * So each macro now prints its grams *and* its share of the dish's calories,
 * with a meter for the share. The badge stops being an opinion the panel hands
 * down and becomes something the reader can see the arithmetic of.
 *
 * ## Why one hue and not three
 *
 * These are three meters of the same measure, not three categories, so they
 * share a hue and the *length* carries the value — no categorical palette to
 * validate, nothing colour-blind-unsafe, and no legend needed because every row
 * is directly labelled with its own figure. A stacked bar would have needed
 * three distinguishable hues to say less.
 */
function NutritionSummary({
  totals,
  empty,
  title,
  servingLabel,
  emptyLabel,
  categoryLabel,
  shareLabel,
  label,
}: {
  totals: ReturnType<typeof dishTotals>;
  empty: boolean;
  title: string;
  /** What one base serving is called — "per serving", "per plate". */
  servingLabel: string;
  emptyLabel: string;
  categoryLabel: string;
  /** Names what the meters measure, so the bars are never unexplained. */
  shareLabel: string;
  label: (key: 'protein' | 'carbs' | 'fat') => string;
}) {
  const split = energySplit(totals);

  return (
    <section className="flex flex-col overflow-hidden rounded-xl border border-border bg-muted/40">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-label font-semibold">{title}</h2>
        {!empty && <Badge variant="outline" size="sm">{categoryLabel}</Badge>}
      </div>

      {empty ? (
        <p className="px-4 py-8 text-center text-body-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <>
          {/* The headline. Energy is what a slot is budgeted in, so it is the one
              figure allowed to be large; everything under it is composition. */}
          <div className="flex items-baseline justify-between gap-3 px-4 py-4">
            <p className="font-heading text-heading-lg font-semibold tabular-nums" dir="ltr">
              {roundForDisplay('kcal', totals.kcal.value)}
              <span className="ms-1.5 text-body-md font-normal text-muted-foreground">
                {NUTRIENT_UNITS.kcal}
              </span>
            </p>
            <p className="text-caption text-muted-foreground">{servingLabel}</p>
          </div>

          {/*
            One row per macro, and every part of it in its own column.

            The bars used to run the full width of the panel under each label,
            with the grams and the share floating above them — three things at
            three different measures, so nothing lined up with anything and the
            block read as six loose lines rather than three readings. Now it is a
            four-column grid: name, meter, grams, share. Each column shares an
            edge down the whole panel, which is the entire reason a table beats a
            list — you can compare a column by running your eye down it instead
            of re-finding the number on every line.

            `max-content` on the label so the longest macro name sets the column
            and the meters all start at the same place; fixed widths on the two
            figure columns so 9.9g and 35.6g end on the same digit.
          */}
          <dl className="grid grid-cols-[max-content_minmax(2rem,1fr)_auto_auto] items-center gap-x-3 gap-y-3 border-t border-border px-4 py-4 text-body-sm">
            {(['protein', 'carbs', 'fat'] as const).map((key) => {
              const percent = Math.round(split[key].percent * 100);

              return (
                <Fragment key={key}>
                  <dt className="text-muted-foreground">{label(key)}</dt>

                  <dd aria-hidden className="h-1.5 overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-viz-seq-3 transition-[inline-size] duration-300 ease-out"
                      style={{ inlineSize: `${percent}%` }}
                    />
                  </dd>

                  {/* Grams and the share are both printed: the meter is the
                      quick read, these are the answer. */}
                  <dd className="w-14 text-end font-medium tabular-nums" dir="ltr">
                    {roundForDisplay(key, totals[key].value)}
                    {NUTRIENT_UNITS[key]}
                  </dd>

                  <dd className="w-9 text-end text-caption text-muted-foreground tabular-nums" dir="ltr">
                    {percent}%
                  </dd>
                </Fragment>
              );
            })}
          </dl>

          <p className="border-t border-border px-4 py-2.5 text-caption text-muted-foreground">
            {shareLabel}
          </p>
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
  hint,
  options,
  selected,
  onToggle,
  tone = 'neutral',
}: {
  legend: string;
  /** One line under the legend, for a group whose meaning is not self-evident. */
  hint?: string;
  options: readonly {
    value: string;
    label: string;
    /** A leading glyph — meal categories carry the meal's own icon. */
    icon?: IconName;
    /** A leading colour dot — the dish tags carry the mark they will wear. */
    dot?: string;
  }[];
  selected: string[];
  onToggle: (value: string) => void;
  tone?: 'neutral' | 'medical';
}) {
  const uid = useId();

  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="text-body-sm font-medium">{legend}</legend>
      {hint && <p className="text-caption text-muted-foreground">{hint}</p>}
      <div className="mt-1.5 flex flex-wrap gap-2">
        {options.map((option) => {
          const inputId = `${uid}-${option.value}`;
          const checked = selected.includes(option.value);

          return (
            <label
              key={option.value}
              htmlFor={inputId}
              className={cn(
                'flex h-10 cursor-pointer items-center gap-1.5 rounded-full border border-input px-3.5',
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
              {option.icon && <Icon name={option.icon} className="size-4 shrink-0" />}
              {/* The dot stays at full strength whether the pill is on or off:
                  it is the dish's colour, not a selection state, and dimming it
                  would make the unselected half of the group unreadable as a
                  legend. The pill's own fill carries "chosen". */}
              {option.dot && <span aria-hidden className={option.dot} />}
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * One recipe line — compact and inline-editable (spec §16–17): the food's name in
 * the reader's language, a quantity, a unit, the weight that comes to, the calories
 * it carries, and a remove.
 *
 * The unit menu is grams plus **this food's own portions**, labelled from the
 * stored `label_ar` / `label_en` rather than from a translation table — a clinic's
 * own unit reads the same way a shipped one does. The calculated weight is printed
 * beside the controls whenever the unit is not already grams: grams is the only
 * figure nutrition ever sees, and a dietitian choosing "1 رغيف" over "150 غرام"
 * should not have to trust a conversion they cannot see.
 */
function IngredientRow({
  row,
  options,
  unit,
  grams,
  locale,
  autoFocusQuantity,
  onChange,
  onRemove,
}: {
  row: IngredientRowState;
  options: UnitOption[];
  /** The chosen unit — decides whether the row has to spell out its grams. */
  unit: UnitOption;
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
  const gramsLabel = t('editor.units.g');

  useEffect(() => {
    if (autoFocusQuantity) quantityRef.current?.focus();
    // Runs once on mount; a row only mounts when its food is first added.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    /*
      Two lines, not one wrapping line.

      In a half-width column the old single row ran out of space and wrapped
      unpredictably — the name jumping above or beside the controls depending on
      how long the food was called. Fixing the name to its own line makes every
      row the same shape at every width, and gives the controls a stable strip
      underneath that the eye can run straight down.
    */
    <li className="flex flex-col gap-2 border-b border-border px-4 py-3 last:border-b-0">
      <div className="flex items-baseline gap-2">
        {/* Friendly name only — no raw English secondary when an Arabic name
            exists (Phase 2 §4). */}
        <p className="min-w-0 flex-1 truncate font-medium" dir="auto">
          {localizedName(row.food, locale)}
        </p>
        <span className="shrink-0 text-body-sm font-medium text-muted-foreground tabular-nums" dir="ltr">
          {rowKcal !== null ? t('editor.rowKcal', { kcal: rowKcal }) : ''}
        </span>
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
          className="h-9 w-20 shrink-0 px-3"
        />

        <SelectField
          size="sm"
          aria-label={t('editor.unitAria')}
          value={unit.value}
          onValueChange={(next) => onChange({ unitValue: next })}
          options={options.map((option) => ({
            value: option.value,
            label: unitLabel(option, locale, gramsLabel),
          }))}
          className="w-32 shrink-0"
        />

        {/* What "2 حبة" actually weighs. Hidden when the unit is already grams,
            where it would only repeat the input. */}
        {unit.value !== GRAMS_UNIT && grams > 0 && (
          <span className="min-w-0 truncate text-caption text-muted-foreground tabular-nums" dir="auto">
            {t('editor.rowGrams', { grams: Math.round(grams) })}
          </span>
        )}

        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="ms-auto shrink-0 text-muted-foreground hover:text-destructive"
          aria-label={t('editor.removeIngredient')}
          onClick={onRemove}
        >
          <Icon name="close" />
        </Button>
      </div>
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
