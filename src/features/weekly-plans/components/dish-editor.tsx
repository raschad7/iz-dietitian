'use client';

import { useActionState, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Field, FieldError } from '@/components/ui/field';
import { Icon, type IconName } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { ALLERGENS, type Allergen } from '@/features/clients/nutrition';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

import { createDishAction, searchDishNamesAction, updateDishAction } from '../catalog-actions';
import { normalizeArabic } from '../arabic-normalize';
import { initialCatalogFormState, type CatalogFormState } from '../catalog-form-state';
import { suggestAllergens, suggestVegetarian } from '../dish-suggestions';
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
import { dishTotals, nutritionCategory, type NutrientSource } from '../nutrition';
import { dishSourceDotClasses } from '../meal-tag-tone';
import type { RefinedFood } from '../ingredient-refine';
import type { DishEditData, DishNameSuggestion, FoodSearchResult } from '../queries';
import { DISH_AXES, MEAL_TYPES, type DishAxisKey } from '../schema';

import { DishNutritionLabel } from './dish-nutrition-label';
import { IngredientSearch } from './food-picker';

/**
 * The dish builder, as three short steps rather than one long form.
 *
 * 1. **التعريف** — the name, and when the dish is served.
 * 2. **المكوّنات** — the search and the live nutrition on one side, the recipe
 *    itself filling the other.
 * 3. **المراجعة** — the nutrition label the recipe produced, plus the labels the
 *    app worked out from the ingredients for the dietitian to confirm.
 *
 * The shape is the point. The old single panel scrolled, and the two things it
 * *required* — a name and a meal time — sat at opposite ends of that scroll, so
 * the ordinary way to meet them was to fill the form, press save, and be told
 * about a field that was off screen. Here each step holds what one question
 * needs, nothing on a step is out of view, and a step cannot be left until the
 * answer it asks for exists.
 *
 * **Nothing on this surface explains itself in a sentence.** The step rail says
 * where you are, a field's label says what it is, and a required mark says it is
 * required; there is no helper line under a control describing what the control
 * plainly does. The one exception is a real finding — a dish by this name
 * already exists — and even that is a list of the dishes rather than a paragraph
 * about them.
 *
 * The nutrition label is never typed in. It is `dishTotals` and
 * `nutritionCategory` run live on the rows on screen — the same functions the
 * meal-detail panel runs on a placed dish — so "high protein" is a fact derived
 * from the recipe, never a claim the dietitian can hand-set to disagree with the
 * food (spec §32, §34).
 */

type Step = 1 | 2 | 3;
const STEPS = [1, 2, 3] as const;

/** What a step is still missing. `null` means it is answered. */
type Blocker = 'name' | 'nameEn' | 'mealTypes' | 'ingredients';

/**
 * The manual labels a dietitian may choose by hand — exactly `DISH_TAGS`, the
 * practical set — sorted into the three questions they actually answer.
 *
 * Nutrition labels are absent by design (see the module note): those are derived
 * from the recipe, never ticked.
 *
 * The groups are not decoration. As one wrapped block of eight, the chips read
 * as a pile with no order to work through — "quick" sits beside "vegetarian"
 * beside "economical", and a dietitian labelling a dish has to re-read all eight
 * to be sure they have not missed one. Three short named runs are three
 * questions, each answerable and then done with:
 *
 * - **التحضير** — how much work is it? quick / easy / no cooking at all.
 * - **التكلفة والتنقّل** — what does it cost, and does it travel?
 * - **طبيعة الطبق** — what kind of food is it?
 */
/*
 * The four declared axes replace the three hand-made tag groups.
 *
 * The groups existed because a bag of eight tags needed sorting into something
 * readable; the axes are already the questions, and every dish answers all four.
 * `DISH_AXES` is the one list, so a value added there appears in this form by
 * doing nothing at all — the old arrangement needed a compile-time check to catch
 * a tag nobody had filed.
 */

/** Meal categories in the order the spec's chips read: breakfast, lunch, dinner, snack. */
const MEAL_CATEGORY_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

/** Each meal's own glyph — the same set the catalog and the planner draw. */
const MEAL_ICON: Record<(typeof MEAL_CATEGORY_ORDER)[number], IconName> = {
  breakfast: 'mealBreakfast',
  lunch: 'mealLunch',
  dinner: 'mealDinner',
  snack: 'mealSnack',
};

/**
 * The ingredient table's six tracks, stated once for the header and the rows.
 *
 * They are one table split across two elements, and a column that is `5rem` in
 * the header and `5.5rem` in the rows is a heading standing over the wrong
 * number. Naming the list is what makes that impossible rather than merely
 * unlikely — the two used to be hand-copied class strings, and they had already
 * drifted once.
 *
 * Only the `sm:` form exists because the table only exists from `sm` up: below
 * it the header is `hidden` and a row folds to two lines of its own.
 *
 * **Every track is a fixed length except the name.** Each row is its own grid —
 * they are `<li>`s, not one table — so a content-sized track would let a row
 * with a long unit compute different columns from the row above it. Fixed
 * lengths are what make separate grids agree.
 */
const INGREDIENT_COLUMNS = 'sm:grid-cols-[minmax(0,1fr)_5rem_9rem_5rem_3.5rem_2.5rem]';

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
  onSaveAnother,
  onCancel,
  onRequestClose,
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
  /**
   * Called instead of `onSuccess` when the dietitian saved with "save and add
   * another". The caller keeps the dialog open and remounts this editor, which is
   * what clears it — a reset assembled by hand would be one `useState` away from
   * carrying the last dish's allergens into the next one.
   */
  onSaveAnother?: () => void;
  /** Overrides the Cancel button's page redirect for the same reason. */
  onCancel?: () => void;
  /**
   * The dialog's guarded close, for the header's X.
   *
   * The header is rendered here rather than by the dialog because it carries the
   * step rail, and the step is this component's state. The close button on it is
   * still the dialog's, so it routes back out through this.
   */
  onRequestClose?: () => void;
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

  const nameId = useId();
  const nameEnId = useId();

  // Controlled so the app can validate on submit and clear the error as the
  // dietitian types — no native `required`, whose browser bubble is unstyled,
  // untranslated, and breaks the design system (spec §27).
  const [nameAr, setNameAr] = useState(() => dish?.nameAr ?? '');
  const [nameEn, setNameEn] = useState(() => dish?.nameEn ?? '');
  // Kept as a storage compatibility detail, not a user decision. Existing
  // dishes retain their saved label; new dishes use the catalog's established
  // Arabic-first default.
  const baseServingLabel = dish?.baseServingLabel ?? 'حصة';
  const [mealTypes, setMealTypes] = useState<string[]>(() => dish?.mealTypes ?? []);
  // One value per axis, and never empty: a dish that answers nothing is exactly
  // what the tag bag allowed and the axes exist to prevent. A new dish starts on
  // the commonest answer to each, which is also the truest guess.
  const [axes, setAxes] = useState<Record<DishAxisKey, string>>(() => ({
    source: dish?.source ?? 'home',
    effort: dish?.effort ?? 'medium',
    cost: dish?.cost ?? 'normal',
    occasion: dish?.occasion ?? 'everyday',
  }));
  const [allergenTags, setAllergenTags] = useState<string[]>(() => dish?.allergenTags ?? []);
  const [rows, setRows] = useState<IngredientRowState[]>(() =>
    dish ? dish.ingredients.map(rowFromIngredient) : [],
  );

  const [step, setStep] = useState<Step>(1);
  /** The furthest step reached, so the rail can offer a step already answered. */
  const [maxStep, setMaxStep] = useState<Step>(1);
  /** Errors appear once a step's Next has been refused, not while typing into it. */
  const [attempted, setAttempted] = useState(false);

  /**
   * Which chips on the review step the app proposed rather than the dietitian.
   *
   * Allergens only. The axes have no equivalent: every one already carries an
   * answer from the moment the form opens, so there is nothing to propose — and
   * the one thing that *was* proposed, "vegetarian", is computed from the recipe
   * now rather than written onto the dish.
   */
  const [suggestedAllergens, setSuggestedAllergens] = useState<Allergen[]>([]);
  const hasReviewed = useRef(false);

  // The row whose quantity input should grab focus — a food added in grams starts
  // blank, so the dietitian's next move is to type the weight (spec §26, §30).
  const [focusRowKey, setFocusRowKey] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const nameEnRef = useRef<HTMLInputElement>(null);
  const mealGroupRef = useRef<HTMLFieldSetElement>(null);
  const addAnother = useRef(false);

  // The dialog guards closing when there are unsaved edits (spec §1). "Dirty" is
  // the form state diverging from what it opened with — compared as a snapshot so
  // adding then removing an ingredient reads as clean again.
  const snapshot = JSON.stringify({
    nameAr,
    nameEn,
    mealTypes,
    axes,
    allergenTags,
    rows: rows.map((row) => ({
      f: row.food.id,
      q: row.quantity,
      u: row.unitValue,
    })),
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
   * piece of egg, a cup of rice, grams of chicken.
   *
   * Focus then lands wherever the next keystroke is useful, which is the rule that
   * replaced the old inconsistency. A gram-weighed food arrives with no quantity,
   * so the cursor goes to it. A food with a household unit arrives at one of that
   * unit and needs nothing typed, so the cursor stays in the search, ready for the
   * next ingredient.
   */
  function addFood(food: FoodSearchResult) {
    rowSeq += 1;
    const key = `row-${rowSeq}`;
    const unitValue = defaultUnitValue(food);
    const grams = unitValue === GRAMS_UNIT;
    setRows((prev) => [...prev, { key, food, unitValue, quantity: grams ? '' : '1' }]);
    setFocusRowKey(grams ? key : null);
    if (!grams) searchRef.current?.focus();
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

  const nutritionDetails: NutrientSource[] = useMemo(
    () => completeRows.map((prepared) => ({ quantityGrams: prepared.grams, food: prepared.row.food })),
    [completeRows],
  );

  /** Totals for the whole recipe as entered. Per-serving division happens on display. */
  const totals = useMemo(() => dishTotals(nutritionDetails, 1), [nutritionDetails]);
  const category = useMemo(() => nutritionCategory(totals), [totals]);
  const recipeGrams = useMemo(
    () => completeRows.reduce((sum, prepared) => sum + prepared.grams, 0),
    [completeRows],
  );

  const ingredientsJson = useMemo(
    () =>
      JSON.stringify(
        completeRows.map((prepared) => ({
          foodId: prepared.row.food.id,
          /*
            What the row weighs, full stop. `dish_ingredients` stores grams for
            ONE serving and every reader in the app depends on that — and one
            serving is exactly what is on screen, because the editor no longer
            asks how many the recipe feeds. Nothing is scaled between this form
            and the table.
          */
          quantityGrams: prepared.grams,
          portionId: prepared.unit.portion?.id ?? null,
          portionQuantity: prepared.unit.portion ? Number(prepared.row.quantity) : null,
        })),
      ),
    [completeRows],
  );

  /*
   * Both names are required.
   *
   * The English one used to be optional, and the result is a catalog where some
   * dishes have an English name and some do not — which is only discovered by an
   * English-reading colleague, or by a printed plan, long after the dish was
   * saved. It is one field at the moment the dish is being named, and that
   * moment is the only cheap time to ask for it.
   */
  const blocker: Blocker | null = useMemo(() => {
    if (!nameAr.trim()) return 'name';
    if (!nameEn.trim()) return 'nameEn';
    if (mealTypes.length === 0) return 'mealTypes';
    if (completeRows.length === 0) return 'ingredients';
    return null;
  }, [nameAr, nameEn, mealTypes, completeRows]);

  /** The blocker this step is responsible for, if it is the one still unanswered. */
  const stepBlocker: Blocker | null = useMemo(() => {
    if (step === 1) return blocker === 'ingredients' ? null : blocker;
    if (step === 2) return blocker === 'ingredients' ? blocker : null;
    return blocker;
  }, [step, blocker]);

  function focusBlocker(target: Blocker) {
    if (target === 'name') nameRef.current?.focus();
    if (target === 'nameEn') nameEnRef.current?.focus();
    if (target === 'mealTypes') mealGroupRef.current?.querySelector('input')?.focus();
    if (target === 'ingredients') searchRef.current?.focus();
  }

  /*
   * Arriving at the review step, the app reads the recipe and ticks what it can
   * argue for: the allergens the foods carry, and "vegetarian" when none of them
   * is an animal food. Once only — a dietitian who unticks a proposal has
   * answered the question, and re-proposing it on the next visit would be the app
   * arguing back.
   *
   * Run from the navigation handler rather than an effect on `step`: it is a
   * consequence of *moving* to the review, not of being there, and an effect that
   * set three pieces of state on arrival would re-render the step twice for no
   * reason.
   */
  function proposeLabels() {
    if (hasReviewed.current || completeRows.length === 0) return;
    hasReviewed.current = true;

    const foods = completeRows.map((prepared) => prepared.row.food);

    const allergens = suggestAllergens(foods).filter((value) => !allergenTags.includes(value));
    if (allergens.length > 0) {
      setSuggestedAllergens(allergens);
      setAllergenTags((current) => [...current, ...allergens]);
    }

    // "Vegetarian" used to be proposed as a tag here. It is computed from the
    // recipe now — see `docs/catalog.md` — so proposing it would be offering to
    // write down something the food already says.
    void suggestVegetarian;
  }

  function goToStep(next: Step) {
    if (next === 3) proposeLabels();
    setStep(next);
    setMaxStep((current) => (next > current ? next : current));
    setAttempted(false);
  }

  function goNext() {
    if (stepBlocker) {
      setAttempted(true);
      focusBlocker(stepBlocker);
      return;
    }
    if (step < 3) goToStep((step + 1) as Step);
  }

  /* The rail may jump back freely, and forward only over answered steps. */
  function jumpTo(target: Step) {
    if (target === step) return;
    if (target < step) {
      goToStep(target);
      return;
    }
    if (blocker) {
      setAttempted(true);
      focusBlocker(blocker);
      return;
    }
    goToStep(target);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (step !== 3 || blocker) {
      event.preventDefault();
      setAttempted(true);
      if (blocker) focusBlocker(blocker);
      return;
    }
  }

  /*
   * Enter must never submit the dish from steps 1 and 2.
   *
   * A `<form>` submits implicitly on Enter in a text field, which on step 1 would
   * post a dish with no ingredients. Enter is the step's own "continue" instead.
   */
  function handleKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
    if (event.key !== 'Enter' || step === 3) return;
    // A child that owns Enter has already prevented it — the ingredient search
    // adding the highlighted food, a quantity field handing focus back. Advancing
    // the step as well would add an ingredient and leave the step in one keypress.
    if (event.defaultPrevented) return;
    if (event.target instanceof HTMLTextAreaElement) return;
    event.preventDefault();
    goNext();
  }

  const router = useRouter();
  useEffect(() => {
    if (state.status !== 'done') return;
    if (addAnother.current && onSaveAnother) onSaveAnother();
    else if (onSuccess) onSuccess();
    else router.push('/app/dishes');
  }, [state, router, onSuccess, onSaveAnother]);

  return (
    <form
      action={formAction}
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      className="flex min-h-0 flex-1 flex-col"
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="ingredients" value={ingredientsJson} />
      {isEditing && <input type="hidden" name="dishId" value={dish.id} />}
      {/*
        Every group posts from React state through hidden inputs rather than from
        the controls themselves, so a step that is not currently rendered still
        submits everything it holds.
      */}
      <input type="hidden" name="nameAr" value={nameAr} />
      <input type="hidden" name="nameEn" value={nameEn} />
      <input type="hidden" name="baseServingLabel" value={baseServingLabel.trim() || 'حصة'} />
      {mealTypes.map((value) => (
        <input key={value} type="hidden" name="mealTypes" value={value} />
      ))}
      {DISH_AXES.map(({ key }) => (
        <input key={key} type="hidden" name={key} value={axes[key]} />
      ))}
      {allergenTags.map((value) => (
        <input key={value} type="hidden" name="allergenTags" value={value} />
      ))}

      {/*
        Title, rail and close on one line. The rail lives here rather than under
        the header because the space beside a two-word title was otherwise a
        subtitle explaining what "add dish" means, and a row of three steps is a
        better use of it than a sentence.
      */}
      <DialogHeader
        title={isEditing ? t('editor.editTitle') : t('editor.pageTitle')}
        titleClassName="text-heading-lg !font-normal"
        onClose={onRequestClose}
        closeLabel={tCommon('close')}
        className="shrink-0 gap-4 border-b border-border px-5 py-3 sm:px-6"
      >
        <StepRail current={step} furthest={maxStep} onJump={jumpTo} />
      </DialogHeader>

      {/*
        One step at a time, and none of them scrolls the dialog.

        `data-scroll="inner"` is the responsive frame's own seam for exactly this
        (see `globals.css`): declaring a body is what tells the frame to clip the
        dialog rather than let the whole surface scroll, and the attribute says the
        scrollport is a descendant — step 2's ingredient list — so the body itself
        clips and reserves no scrollbar gutter.
      */}
      <DialogBody data-scroll="inner" className="min-h-0 flex-1 gap-0 px-5 py-5 sm:px-6">
        {/*
          Both names on one row, then the meal times.

          The English name used to sit at the bottom of the review step, under
          the allergens — the one *typed* field on a step otherwise made of
          chips, three screens away from the Arabic name it translates. It is a
          name, so it belongs with the name; moving it here also gives this step
          something on its second half, which was empty enough to read as a
          screen that had failed to load.
        */}
        {step === 1 && (
          <div className="mx-auto flex h-full w-full max-w-3xl flex-col justify-center gap-8">
            <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
              <Field>
                <Label htmlFor={nameId} required>
                  {t('editor.nameAr')}
                </Label>
                <NameFieldWithMatches
                  id={nameId}
                  ref={nameRef}
                  value={nameAr}
                  onChange={setNameAr}
                  placeholder={t('editor.nameArPlaceholder')}
                  invalid={attempted && !nameAr.trim()}
                  locale={locale}
                  excludeDishId={dish?.id}
                  search={searchDishNames}
                />
                {attempted && !nameAr.trim() && (
                  <FieldError>{t('editor.errors.nameRequired')}</FieldError>
                )}
              </Field>

              <Field>
                <Label htmlFor={nameEnId} required>
                  {t('editor.nameEn')}
                </Label>
                <Input
                  id={nameEnId}
                  ref={nameEnRef}
                  /*
                    No `dir`. It inherits the dialog's, which is the page's.

                    Pinned to `ltr` it was the one field on an Arabic form whose
                    contents sat at the far side of the box from every other
                    field's — you type منسف at the right, tab, and the caret is
                    suddenly at the left. Latin text under an RTL base direction
                    is still laid out left-to-right by the bidi algorithm; it is
                    only *placed* at the right, which is where the rest of the
                    form starts. In the English UI the same inheritance puts it
                    back on the left.
                  */
                  maxLength={120}
                  value={nameEn}
                  onChange={(event) => setNameEn(event.target.value)}
                  placeholder={t('editor.nameEnPlaceholder')}
                  aria-invalid={(attempted && !nameEn.trim()) || undefined}
                />
                {attempted && !nameEn.trim() && (
                  <FieldError>{t('editor.errors.nameEnRequired')}</FieldError>
                )}
              </Field>
            </div>

            <MealTimeChoice
              ref={mealGroupRef}
              legend={t('editor.mealTypesLegend')}
              options={MEAL_CATEGORY_ORDER.filter((value) => MEAL_TYPES.includes(value)).map(
                (value) => ({
                  value,
                  label: tDishes(`mealTypes.${value}`),
                  icon: MEAL_ICON[value],
                }),
              )}
              selected={mealTypes}
              onToggle={(value) => toggle(mealTypes, value, setMealTypes)}
              invalid={attempted && mealTypes.length === 0}
              error={
                attempted && mealTypes.length === 0
                  ? t('editor.errors.mealTypeRequired')
                  : undefined
              }
            />
          </div>
        )}

        {/*
          Two columns, and the recipe gets the larger one.

          The search and the figures it produces are a fixed-width sidebar — both
          are the same size whatever the dish is — and everything that grows with
          the dish goes in the panel beside them. A full-width search bar over a
          list squeezed into what was left under it was the wrong way round: the
          rows are the work, and eight of them have to be readable at once.
        */}
        {step === 2 && (
          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:gap-5">
            {/*
              The sidebar is a fixed stack, not a scroller: search, the way out
              of the search, then the figures taking whatever height is left.
              Both columns therefore end on the same line — the nutrition card
              stretching is what makes them agree, since nothing else in this
              step has a height of its own.
            */}
            <div className="flex min-h-0 flex-col gap-3">
              <IngredientSearch
                locale={locale}
                onPick={addFood}
                search={search}
                inputRef={searchRef}
              />

              {attempted && completeRows.length === 0 && (
                <FieldError>{t('editor.errors.ingredientRequired')}</FieldError>
              )}

              <div className="min-h-0 flex-1">
                <DishNutritionLabel
                  totals={totals}
                  empty={completeRows.length === 0}
                  categoryLabel={t(`editor.categories.${category}`)}
                  totalGrams={recipeGrams}
                  stacked
                />
              </div>
            </div>

            <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border">
              <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-2.5">
                <h2 className="text-label font-medium">{t('editor.ingredientsHeading')}</h2>
                <span className="text-caption text-muted-foreground tabular-nums">
                  {t('editor.ingredientCount', { count: rows.length })}
                </span>
              </header>

              {rows.length === 0 ? (
                <EmptyRecipe title={t('editor.recipeEmptyTitle')} />
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <div
                    aria-hidden
                    className={cn(
                      'sticky top-0 z-1 hidden items-center gap-3 border-b border-border bg-background px-4 py-1.5 text-caption text-muted-foreground sm:grid',
                      INGREDIENT_COLUMNS,
                    )}
                  >
                    <span>{t('editor.columnIngredient')}</span>
                    <span className="text-center">{t('editor.amount')}</span>
                    <span className="text-center">{t('editor.unitAria')}</span>
                    <span className="text-end">{t('editor.columnGrams')}</span>
                    <span className="text-end">{t('editor.columnKcal')}</span>
                    <span />
                  </div>

                  <ul>
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
                        onDone={() => searchRef.current?.focus()}
                        onRemove={() =>
                          setRows((prev) => prev.filter((entry) => entry.key !== row.key))
                        }
                      />
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </div>
        )}

        {step === 3 && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {/*
              Three panels, each ending where its content ends.

              They are NOT stretched to a common height. Stretching them made
              the nutrition card 500px tall around 230px of ring and bars, and
              the review step's first impression became the hole in the middle
              of its main figure. Two short panels beside one taller one is the
              honest shape of what is on this step, and the eye reads three
              boxes of the same build as a set whatever their heights.
            */}
            {/* Centred in the step the way step 1 is, so what the panels no
                longer waste inside themselves does not simply reappear as a
                gap under them. Taller than the step, it scrolls instead. */}
            <div className="flex min-h-full flex-col justify-center">
              {/* No `items-start`: the columns stretch, so the nutrition card
                  ends level with the two label panels opposite it. */}
              <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
                <DishNutritionLabel
                  totals={totals}
                  empty={completeRows.length === 0}
                  categoryLabel={t(`editor.categories.${category}`)}
                  totalGrams={recipeGrams}
                />

                <div className="flex flex-col gap-4 lg:gap-5">
                  {/* One section per axis, one answer each: pressing a value
                      replaces the one before it rather than adding to it. A dish
                      is cooked at home or bought, not both. */}
                  <PillCheckboxGroup
                    legend={t('editor.labelsLegend')}
                    sections={DISH_AXES.map((axis) => ({
                      key: axis.key,
                      label: tDishes(axis.label),
                      options: axis.values.map(({ value, message }) => ({
                        value,
                        label: tDishes(message),
                        dot: axis.key === 'source' ? dishSourceDotClasses(value) : undefined,
                      })),
                    }))}
                    selected={DISH_AXES.map(({ key }) => axes[key])}
                    onToggle={(value) => {
                      const axis = DISH_AXES.find((one) =>
                        one.values.some((entry) => entry.value === value),
                      );
                      if (axis) setAxes((current) => ({ ...current, [axis.key]: value }));
                    }}
                  />

                  <PillCheckboxGroup
                    legend={t('editor.allergensLegend')}
                    sections={[
                      {
                        key: 'all',
                        options: ALLERGENS.map((value) => ({
                          value,
                          label: tDishes(`allergens.${value}`),
                        })),
                      },
                    ]}
                    selected={allergenTags}
                    suggested={suggestedAllergens}
                    suggestedLabel={t('editor.suggested')}
                    onToggle={(value) => {
                      toggle(allergenTags, value, setAllergenTags);
                      setSuggestedAllergens((current) =>
                        current.filter((entry) => entry !== value),
                      );
                    }}
                    tone="medical"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogBody>

      {/* The action row never moves between steps: the same corner always advances. */}
      <DialogFooter className="shrink-0 items-center gap-2 border-t border-border bg-background px-5 py-3 sm:px-6">
        {step > 1 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => goToStep((step - 1) as Step)}
          >
            <Icon name="chevronStart" />
            {t('editor.back')}
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => (onCancel ? onCancel() : router.push('/app/dishes'))}
          >
            {tCommon('cancel')}
          </Button>
        )}

        <FormMessage state={state} />

        <div className="ms-auto flex items-center gap-2">
          {step === 3 && !isEditing && onSaveAnother && (
            <SubmitButton
              variant="outline"
              label={t('editor.saveAndAddAnother')}
              pendingLabel={t('editor.submitting')}
              onPress={() => {
                addAnother.current = true;
              }}
            />
          )}

          {step < 3 ? (
            <Button type="button" onClick={goNext} aria-disabled={stepBlocker !== null}>
              {t('editor.next')}
              <Icon name="chevronEnd" />
            </Button>
          ) : (
            <SubmitButton
              label={t(isEditing ? 'editor.saveChanges' : 'editor.submit')}
              pendingLabel={t('editor.submitting')}
              onPress={() => {
                addAnother.current = false;
              }}
            />
          )}
        </div>
      </DialogFooter>
    </form>
  );
}

/**
 * The three steps, as a rail in the header.
 *
 * It is a progress display *and* a control: a finished step is a link back to
 * itself, which is how a dietitian corrects a name after seeing the nutrition
 * without losing the recipe. A step that is neither current nor answered is
 * inert — offering to jump to a step whose question the previous one has not
 * answered would only bounce.
 */
function StepRail({
  current,
  furthest,
  onJump,
}: {
  current: Step;
  furthest: Step;
  onJump: (step: Step) => void;
}) {
  const t = useTranslations('dishEditor.editor');
  const titles: Record<Step, string> = {
    1: t('steps.define'),
    2: t('steps.ingredients'),
    3: t('steps.review'),
  };

  return (
    <ol className="flex min-w-0 shrink items-center justify-end gap-1">
      {STEPS.map((step, index) => {
        const done = step < current;
        const reachable = step <= furthest;

        return (
          <li key={step} className="flex min-w-0 items-center gap-1">
            {index > 0 && (
              <span
                aria-hidden
                className={cn('h-px w-3 shrink-0 sm:w-5', done ? 'bg-primary' : 'bg-border')}
              />
            )}
            <button
              type="button"
              onClick={() => onJump(step)}
              disabled={!reachable}
              aria-current={step === current ? 'step' : undefined}
              className={cn(
                'flex items-center gap-2 rounded-full px-2.5 py-1.5 text-body-sm font-medium transition-colors',
                'disabled:cursor-default',
                step === current
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground enabled:hover:bg-accent enabled:hover:text-foreground',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'flex size-5.5 shrink-0 items-center justify-center rounded-full border text-caption font-semibold',
                  done || step === current
                    ? 'border-transparent bg-primary text-primary-foreground'
                    : 'border-input',
                )}
              >
                {done ? <Icon name="check" className="size-3" /> : step}
              </span>
              <span className={cn('truncate', step !== current && 'max-md:sr-only')}>
                {titles[step]}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

type ExistingDishStatus = 'idle' | 'loading' | 'done' | 'error';

/**
 * The dish name, with the clinic's matching dishes hanging under it as a menu.
 *
 * A **popover**, and that is the whole of what changed here. The matches used to
 * render in the flow: typing the third letter of a name grew the panel, pushed
 * the meal-time cards down, and brought a scrollbar in from the side — the field
 * you were typing into moved while you typed into it. Overlaying the list leaves
 * the step exactly where it was, which is the same reason a `<select>` does not
 * reflow the form it sits in.
 *
 * The list stays read-only: the dietitian is naming a *new* dish, and a picker
 * here would imply that choosing an existing one fills this form. Its job is to
 * say "this exists" in time to stop a duplicate, and an exact match says so
 * louder without blocking a legitimate clinic variation.
 */
function NameFieldWithMatches({
  id,
  ref,
  value,
  onChange,
  placeholder,
  invalid,
  locale,
  excludeDishId,
  search = searchDishNamesAction,
}: {
  id: string;
  ref: React.RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  invalid: boolean;
  locale: string;
  excludeDishId?: string;
  search?: (locale: string, query: string, excludeDishId?: string) => Promise<DishNameSuggestion[]>;
}) {
  const t = useTranslations('dishEditor.editor');
  const tDishes = useTranslations('dishes');
  const [matches, setMatches] = useState<DishNameSuggestion[]>([]);
  const [status, setStatus] = useState<ExistingDishStatus>('idle');
  const [statusKey, setStatusKey] = useState('');
  /** Escape puts the menu away without clearing the name that summoned it. */
  const [dismissed, setDismissed] = useState(false);
  const requestSeq = useRef(0);
  const cache = useRef(new Map<string, DishNameSuggestion[]>());

  useEffect(() => {
    const term = value.trim();
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
  }, [excludeDishId, locale, value, search]);

  const normalizedQuery = normalizeArabic(value.trim());
  const currentKey = `${excludeDishId ?? ''}:${value.trim()}`;
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

  const open =
    !dismissed &&
    normalizedQuery.length >= 2 &&
    currentStatus === 'done' &&
    visibleMatches.length > 0;

  return (
    <div className="relative">
      <Input
        id={id}
        ref={ref}
        dir="rtl"
        autoFocus
        maxLength={120}
        value={value}
        onChange={(event) => {
          setDismissed(false);
          onChange(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            event.preventDefault();
            event.stopPropagation();
            setDismissed(true);
          }
        }}
        placeholder={placeholder}
        /*
          ⚠ **No typography override here, and that is load-bearing.**

          On an Arabic page `Input` hides the native text and repaints it in an
          ordinary span, because Chromium clips Almarai's descenders inside a
          native input (the dots under ي). The caret and the selection belong to
          the *hidden* text; the letters you read are the span. Sizing the input
          at `text-body-lg` left the invisible text at 18px and the painted
          glyphs at 16px, so the caret stood away from the word it was in and a
          selection highlighted the wrong span of it. The field's own default
          typography is the only size at which the two layers agree — see
          `unclippedTextClassName` in `input.tsx` for the seam if this ever does
          need to be bigger.
        */
        aria-invalid={invalid || undefined}
        aria-expanded={open}
      />

      {open && (
        <div
          aria-live="polite"
          className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-border bg-popover p-1.5 shadow-overlay"
        >
          <ul aria-label={t('existingMatchesTitle')}>
            {visibleMatches.slice(0, 5).map((dish) => {
              const exact =
                normalizeArabic(dish.nameAr) === normalizedQuery ||
                normalizeArabic(dish.nameEn) === normalizedQuery;

              return (
                <li key={dish.id} className="flex items-center gap-3 rounded-lg px-2.5 py-2">
                  <Icon
                    name={exact ? 'attention' : 'info'}
                    className={cn(
                      'size-4 shrink-0',
                      exact ? 'text-status-attention-fg' : 'text-muted-foreground',
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate text-body-sm font-medium" dir="auto">
                    {locale === 'ar' ? dish.nameAr : dish.nameEn || dish.nameAr}
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
      )}

      {/* An exact match is a finding, so it survives the menu being dismissed. */}
      {exactMatch && !open && normalizedQuery.length >= 2 && (
        <p className="mt-1.5 flex items-center gap-1.5 text-caption text-status-attention-fg">
          <Icon name="attention" className="size-3.5 shrink-0" />
          {t('exactMatchTitle')}
        </p>
      )}
    </div>
  );
}

/**
 * "When is it served?" as four cards rather than four pills.
 *
 * It is one of the two answers a dish cannot be saved without, and it is the only
 * question on its half of the first step, so it gets the room. The control under
 * each card is a real checkbox, visually hidden, so the group stays a keyboard
 * and screen-reader checkbox group.
 */
function MealTimeChoice({
  ref,
  legend,
  options,
  selected,
  onToggle,
  invalid,
  error,
}: {
  ref?: React.Ref<HTMLFieldSetElement>;
  legend: string;
  options: readonly { value: string; label: string; icon: IconName }[];
  selected: string[];
  onToggle: (value: string) => void;
  invalid: boolean;
  error?: string;
}) {
  const uid = useId();

  return (
    <fieldset ref={ref} className="min-w-0">
      {/* Reads as one more field label, because that is what it is — the same
          size, weight and required mark the two name fields above it wear. */}
      <legend className="flex items-center gap-2 text-body-md leading-none font-medium">
        {legend}
        <span aria-hidden className="-ms-1 text-destructive">
          *
        </span>
      </legend>

      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {options.map((option) => {
          const inputId = `${uid}-${option.value}`;
          const checked = selected.includes(option.value);

          return (
            <label
              key={option.value}
              htmlFor={inputId}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border px-3 py-4',
                'text-body-sm font-medium transition-colors duration-180 ease-out',
                'not-has-checked:hover:border-(--input-hover) not-has-checked:hover:bg-secondary/50',
                // The border and the fill carry "chosen". Weight does not: a
                // label that thickens on selection re-measures its own text, so
                // four cards in a row shift a pixel each as you tick them.
                checked
                  ? 'border-primary bg-secondary text-secondary-foreground'
                  : 'border-input text-muted-foreground',
                invalid && !checked && 'border-destructive/40',
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
              <Icon name={option.icon} className="size-6 shrink-0" />
              {option.label}
            </label>
          );
        })}
      </div>

      {error && <FieldError className="mt-2">{error}</FieldError>}
    </fieldset>
  );
}

/** The recipe before it has a first line. */
function EmptyRecipe({ title }: { title: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
        <Icon name="dish" className="size-6" />
      </span>
      <p className="text-body-sm text-muted-foreground">{title}</p>
    </div>
  );
}

/**
 * A group of pill checkboxes over a closed set — a real `<input type="checkbox">`,
 * visually hidden, with the pill drawn on the label around it by `:has-checked`,
 * so the group reads as a row of chips while staying a keyboard-and-screen-reader
 * checkbox group.
 *
 * It is a **controlled UI only**: the checkboxes carry no `name` and do not submit.
 * The editor posts each group's values from React state through hidden inputs.
 *
 * A pill in `suggested` is one the *app* ticked from the recipe, and says so on
 * its face. Touching it — either way — hands the decision back to the dietitian
 * and the marker goes.
 *
 * `tone="medical"` is for allergens only: ticking one is a clinical exclusion, not
 * a preference, and green here would read as "selected" rather than "excluded".
 */
type PillOption = {
  value: string;
  label: string;
  /** A leading colour dot — the dish tags carry the mark they will wear. */
  dot?: string;
};

function PillCheckboxGroup({
  legend,
  sections,
  selected,
  suggested = [],
  suggestedLabel,
  onToggle,
  tone = 'neutral',
}: {
  /** Names the panel. Rendered as its heading, not as a `<legend>` — see below. */
  legend: string;
  /**
   * The options, in named runs.
   *
   * A section with no `label` is just a list — which is what allergens are, one
   * closed set with nothing to sort them by. The dish's own properties are the
   * reason this exists: eight chips wrapping in a single block asked the reader
   * to hold "quick", "economical", "vegetarian" and "no-cook" in mind as one
   * undifferentiated pile, when they answer three unrelated questions. Named
   * runs turn the pile into three short lists, each of which can be read and
   * dismissed on its own.
   */
  sections: readonly { key: string; label?: string; options: readonly PillOption[] }[];
  selected: string[];
  suggested?: readonly string[];
  suggestedLabel?: string;
  onToggle: (value: string) => void;
  tone?: 'neutral' | 'medical';
}) {
  const uid = useId();
  const headingId = useId();
  const chosen = sections.reduce(
    (count, section) =>
      count + section.options.filter((option) => selected.includes(option.value)).length,
    0,
  );

  return (
    /*
      A panel, with the same header bar the nutrition label wears.

      The review step was one bordered card beside two loose runs of chips, which
      read as a card and some leftovers rather than as two halves of one
      question. Three panels of the same build is what makes it a review.

      `role="group"` + `aria-labelledby` rather than `<fieldset>`/`<legend>`: a
      legend is painted *into* its fieldset's top border and stops being a
      legend at all once it is floated or laid out by flex, so a fieldset that
      is also a bordered card is a fight with the renderer. The group role gives
      a screen reader the same "these checkboxes belong to this heading".
    */
    <section
      role="group"
      aria-labelledby={headingId}
      className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xs"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h3 id={headingId} className="text-label font-medium">
          {legend}
        </h3>
        {chosen > 0 && (
          <Badge variant={tone === 'medical' ? 'medical' : 'muted'} size="sm">
            {chosen}
          </Badge>
        )}
      </div>

      <div className="divide-y divide-border">
        {sections.map((section) => (
          <div key={section.key} className="px-4 py-3">
            {section.label && (
              <p className="mb-2 text-caption text-muted-foreground">{section.label}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {section.options.map((option) => {
                const inputId = `${uid}-${option.value}`;
                const checked = selected.includes(option.value);
                const proposed = checked && suggested.includes(option.value);

                return (
                  <label
                    key={option.value}
                    htmlFor={inputId}
                    className={cn(
                      'flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-input px-3',
                      'text-body-sm font-medium text-foreground transition-colors duration-180 ease-out',
                      'not-has-checked:hover:border-(--input-hover) not-has-checked:hover:bg-secondary',
                      tone === 'medical'
                        ? 'has-checked:border-transparent has-checked:bg-status-medical-bg has-checked:text-status-medical-fg'
                        : 'has-checked:border-transparent has-checked:bg-secondary has-checked:text-primary',
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
                    {/* The dot stays at full strength whether the pill is on or
                        off: it is the dish's colour, not a selection state, and
                        dimming it would make the unselected half of the group
                        unreadable as a legend. The fill carries "chosen". */}
                    {option.dot && <span aria-hidden className={option.dot} />}
                    {option.label}
                    {proposed && suggestedLabel && (
                      <span className="rounded-full bg-background/70 px-1.5 text-caption font-medium">
                        {suggestedLabel}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * One recipe line — a row of aligned columns (spec §16–17): the food's name in
 * the reader's language, a quantity, a unit, the weight that comes to, the
 * calories it carries, and a remove.
 *
 * The columns are the difference from the two-line row this replaces. Grams and
 * calories now sit in fixed columns down the list, so a dietitian can read the
 * weights of eight ingredients by running one eye down rather than hunting for
 * each number in a different place on each line. Below `sm` it folds to two
 * lines, the name over its controls, because five columns do not fit a phone.
 *
 * The unit menu is grams plus **this food's own portions**, labelled from the
 * stored `label_ar` / `label_en` rather than from a translation table — a clinic's
 * own unit reads the same way a shipped one does. The calculated weight is always
 * printed, not only for household units: grams is the only figure nutrition ever
 * sees, and a dietitian choosing "1 رغيف" over "150 غرام" should not have to
 * trust a conversion they cannot see.
 */
function IngredientRow({
  row,
  options,
  unit,
  grams,
  locale,
  autoFocusQuantity,
  onChange,
  onDone,
  onRemove,
}: {
  row: IngredientRowState;
  options: UnitOption[];
  /** The chosen unit — grams is printed for every unit, this only labels the menu. */
  unit: UnitOption;
  /** Grams this row contributes right now — drives the live per-row calories. */
  grams: number;
  locale: string;
  /** Focus the quantity on mount (a grams food added blank — spec §26, §30). */
  autoFocusQuantity: boolean;
  onChange: (patch: Partial<IngredientRowState>) => void;
  /** Enter in the quantity means "done with this line" — back to the search. */
  onDone: () => void;
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
    <li
      className={cn(
        'grid items-center gap-x-3 gap-y-2 border-b border-border px-4 py-2.5 last:border-b-0',
        'grid-cols-[5rem_minmax(0,1fr)_auto_2rem]',
        'hover:bg-muted/30',
        // The header's own tracks, by name — see `INGREDIENT_COLUMNS`.
        INGREDIENT_COLUMNS,
        'sm:gap-y-0',
      )}
    >
      {/* Friendly name only — no raw English secondary when an Arabic name
          exists (Phase 2 §4). */}
      <p className="col-span-3 min-w-0 truncate text-body-sm font-medium sm:col-span-1" dir="auto">
        {localizedName(row.food, locale)}
      </p>

      <Input
        ref={quantityRef}
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        aria-label={t('editor.amount')}
        value={row.quantity}
        placeholder="—"
        onChange={(event) => onChange({ quantity: event.target.value })}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          event.stopPropagation();
          onDone();
        }}
        className={cn(
          'order-2 h-9 w-full px-2 text-center sm:order-none',
          row.quantity === '' && 'border-status-attention-fg/40 bg-status-attention-bg/40',
        )}
      />

      {/*
        `ps-3 pe-2.5` in place of the field's default 20/16, and it is what
        makes the long unit names fit. (`px-*` does not do it: Tailwind emits
        the `padding-inline` shorthand before the `padding-inline-start`
        longhand, so the field's own `ps-5` wins the cascade.)

        A household unit is not one word — "ملعقة كبيرة", "نصف رغيف", and
        whatever a clinic names its own portion. The shared trigger reserves
        36px of padding plus a chevron, which in the old 128px column left
        barely enough for "حبة"; at 144px and `px-3` the label gets 96px, which
        holds every shipped unit. Anything longer still cannot break the row:
        `SelectValue` truncates, and the full name is one click away in the list.
      */}
      <SelectField
        size="sm"
        aria-label={t('editor.unitAria')}
        value={unit.value}
        onValueChange={(next) => onChange({ unitValue: next })}
        options={options.map((option) => ({
          value: option.value,
          label: unitLabel(option, locale, gramsLabel),
        }))}
        className="order-3 w-full ps-3 pe-2.5 sm:order-none"
      />

      {/*
        ⚠ **No `dir` on either figure cell.** They inherit the row's, and that is
        the whole of what keeps them under their headings.

        `text-end` resolves against the *element's own* direction, not the
        page's. The calorie cell carried `dir="ltr"` so its digits would read
        left-to-right — which they do anyway, being digits — and that one
        attribute flipped `text-end` from the left edge of its column to the
        right edge, while the `سعرة` heading above it, inheriting RTL, stayed on
        the left. Same column, opposite edges, about 37px apart: the columns were
        never misaligned, the text inside them was aligned to opposite sides.

        Numerals need no help. A bare integer renders identically under either
        direction, `tabular-nums` holds the digit widths, and a mixed string like
        "14 غرام" is laid out correctly by the bidi algorithm from the row's own
        direction. Do not reintroduce `dir` here.
      */}
      <span
        className={cn(
          'order-4 shrink-0 whitespace-nowrap text-caption tabular-nums sm:order-none sm:text-end',
          grams > 0 ? 'text-muted-foreground' : 'text-status-attention-fg',
        )}
      >
        {grams > 0
          ? t('editor.rowGrams', { grams: Math.round(grams) })
          : t('editor.awaitingAmount')}
      </span>

      <span className="order-5 shrink-0 whitespace-nowrap text-body-sm font-semibold tabular-nums sm:order-none sm:text-end">
        {rowKcal !== null ? rowKcal : '—'}
      </span>

      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="order-1 justify-self-end text-muted-foreground hover:text-destructive sm:order-none"
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

function SubmitButton({
  label,
  pendingLabel,
  variant,
  onPress,
}: {
  label: string;
  pendingLabel: string;
  variant?: 'outline';
  /** Runs before the form posts — records *which* save button was used. */
  onPress: () => void;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant={variant} disabled={pending} onClick={onPress}>
      {pending ? pendingLabel : label}
    </Button>
  );
}
