'use server';

import { revalidatePath } from 'next/cache';

import { localeSchema } from '@/features/clients/schema';
import { type Locale } from '@/i18n/routing';
import { requireStaffClinic } from '@/lib/session';

import { clinicDishInputSchema, customFoodInputSchema } from './catalog-schema';
import { DISH_AXES } from './schema';
import type { CatalogFormState } from './catalog-form-state';
import {
  createClinicDish,
  createCustomFood,
  deleteClinicDish,
  hideSharedDish,
  unhideSharedDish,
  updateClinicDish,
} from './catalog-mutations';
import type { RefinedFood } from './ingredient-refine';
import { searchIngredients } from './ingredient-search';
import {
  getClinicDishForEdit,
  getDishDetailForClinic,
  searchDishNameSuggestions,
  searchFoodsById,
  type DishDetailView,
  type DishEditData,
  type DishNameSuggestion,
  type FoodSearchResult,
} from './queries';

/**
 * Server actions for the clinic's own dish catalog: create, edit, delete, and
 * hide/unhide a shared dish, plus the food-matching helpers the dish editor
 * calls directly (not as form actions).
 *
 * Same discipline as `actions.ts`: every write re-resolves the clinic from the
 * session rather than trusting anything in the form, and ids that do not
 * belong to the caller's clinic come back as a typed failure, not a throw.
 */

function readLocale(formData: FormData): Locale {
  return localeSchema.parse(formData.get('locale'));
}

function readDishId(formData: FormData): string {
  return String(formData.get('dishId') ?? '');
}

/**
 * Assembles the raw (unvalidated) dish input from the editor's form fields.
 *
 * The four axes are read **by name from `DISH_AXES`**, not listed here. This
 * function used to send `tags: formData.getAll('tags')` — a field the form had
 * already stopped rendering — and none of `source`, `effort`, `cost` or
 * `occasion`, which it had started rendering. Every save failed
 * `clinicDishInputSchema` on four missing required fields and came back as
 * `errors.invalid`: "the information is not correct", about a form that was
 * filled in correctly. Driving the read off the same list the form draws from is
 * what makes the two unable to drift again.
 */
function readDishInput(formData: FormData): unknown {
  const axes = Object.fromEntries(
    DISH_AXES.map(({ key }) => [key, formData.get(key)]),
  );

  return {
    nameAr: formData.get('nameAr'),
    nameEn: formData.get('nameEn'),
    baseServingLabel: formData.get('baseServingLabel'),
    mealTypes: formData.getAll('mealTypes'),
    ...axes,
    // A checkbox posts nothing when it is off, so absence is `false` — the same
    // reading the column's default gives.
    isSide: formData.get('isSide') === 'on' || formData.get('isSide') === 'true',
    allergenTags: formData.getAll('allergenTags'),
    ingredients: JSON.parse((formData.get('ingredients') as string) ?? '[]'),
  };
}

export async function createDishAction(
  _previousState: CatalogFormState,
  formData: FormData,
): Promise<CatalogFormState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const parsed = clinicDishInputSchema.safeParse(readDishInput(formData));
  if (!parsed.success) return { status: 'error', messageKey: 'errors.invalid' };

  try {
    const dishId = await createClinicDish(clinicId, parsed.data);
    if (!dishId) return { status: 'error', messageKey: 'errors.unexpected' };

    revalidatePath(`/${locale}/app/dishes`);
    return { status: 'done', dishId };
  } catch (error) {
    console.error('[weekly-plans] creating dish failed', error);
    return { status: 'error', messageKey: 'errors.unexpected' };
  }
}

export async function updateDishAction(
  _previousState: CatalogFormState,
  formData: FormData,
): Promise<CatalogFormState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);
  const dishId = readDishId(formData);

  const parsed = clinicDishInputSchema.safeParse(readDishInput(formData));
  if (!parsed.success) return { status: 'error', messageKey: 'errors.invalid' };

  try {
    const updated = await updateClinicDish(clinicId, dishId, parsed.data);
    if (!updated) return { status: 'error', messageKey: 'errors.notFound' };

    revalidatePath(`/${locale}/app/dishes`);
    return { status: 'done', dishId };
  } catch (error) {
    console.error('[weekly-plans] updating dish failed', error);
    return { status: 'error', messageKey: 'errors.unexpected' };
  }
}

export async function deleteDishAction(
  _previousState: CatalogFormState,
  formData: FormData,
): Promise<CatalogFormState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);
  const dishId = readDishId(formData);

  try {
    const result = await deleteClinicDish(clinicId, dishId);

    if (result === 'not_found') return { status: 'error', messageKey: 'errors.notFound' };
    if (result === 'in_use') return { status: 'error', messageKey: 'errors.inUse' };

    revalidatePath(`/${locale}/app/dishes`);
    return { status: 'done' };
  } catch (error) {
    console.error('[weekly-plans] deleting dish failed', error);
    return { status: 'error', messageKey: 'errors.unexpected' };
  }
}

export async function hideDishAction(
  _previousState: CatalogFormState,
  formData: FormData,
): Promise<CatalogFormState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);
  const dishId = readDishId(formData);

  try {
    const hidden = await hideSharedDish(clinicId, dishId);
    if (!hidden) return { status: 'error', messageKey: 'errors.notFound' };

    revalidatePath(`/${locale}/app/dishes`);
    return { status: 'done' };
  } catch (error) {
    console.error('[weekly-plans] hiding dish failed', error);
    return { status: 'error', messageKey: 'errors.unexpected' };
  }
}

export async function unhideDishAction(
  _previousState: CatalogFormState,
  formData: FormData,
): Promise<CatalogFormState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);
  const dishId = readDishId(formData);

  try {
    await unhideSharedDish(clinicId, dishId);
    revalidatePath(`/${locale}/app/dishes`);
    return { status: 'done' };
  } catch (error) {
    console.error('[weekly-plans] unhiding dish failed', error);
    return { status: 'error', messageKey: 'errors.unexpected' };
  }
}

// ---------------------------------------------------------------------------
// Imperative data actions — called directly from client components, not bound
// to a <form>, so they take `locale` as a plain argument to resolve the clinic.
// ---------------------------------------------------------------------------

/**
 * The dish editor's one ingredient search.
 *
 * A single box over every internal source — clinic foods, the shared library, and
 * the alias/translated USDA fallback — merged and deduplicated by `searchIngredients`.
 * The dietitian never chooses a source: there is no "search USDA instead" any more,
 * because which database a food lives in is not her problem.
 */
export async function searchIngredientsAction(locale: string, query: string): Promise<RefinedFood[]> {
  const parsed = localeSchema.parse(locale);
  const { clinicId } = await requireStaffClinic(parsed);
  // The same locale that resolved the clinic also decides the result grouping —
  // there is no second language setting anywhere in this path.
  return searchIngredients(clinicId, query, parsed);
}

/**
 * Prefix matches shown while a dietitian names a new dish. The clinic is always
 * resolved from the session; the client supplies neither an owner nor a scope.
 */
export async function searchDishNamesAction(
  locale: string,
  query: string,
  excludeDishId?: string,
): Promise<DishNameSuggestion[]> {
  const parsed = localeSchema.parse(locale);
  const { clinicId } = await requireStaffClinic(parsed);
  return searchDishNameSuggestions({ clinicId, query, excludeDishId });
}

/**
 * Loads a clinic-owned dish for the editor to reopen. Owner-scoped in the query,
 * so a dishId the caller does not own comes back null — the same "not found" a
 * forged id gets.
 */
export async function loadDishForEditAction(locale: string, dishId: string): Promise<DishEditData | null> {
  const { clinicId } = await requireStaffClinic(localeSchema.parse(locale));
  return getClinicDishForEdit(clinicId, dishId);
}

/**
 * Loads any dish this clinic can see for the catalog's read-only detail drawer —
 * shared/system dishes included. Not owner-scoped (reading is allowed for all),
 * but still scoped to shared-or-own so it never reaches another clinic's dish.
 */
export async function loadDishDetailAction(locale: string, dishId: string): Promise<DishDetailView | null> {
  const { clinicId } = await requireStaffClinic(localeSchema.parse(locale));
  return getDishDetailForClinic(clinicId, dishId);
}

export async function createCustomFoodAction(
  locale: string,
  input: unknown,
): Promise<{ ok: true; food: FoodSearchResult } | { ok: false }> {
  const { clinicId } = await requireStaffClinic(localeSchema.parse(locale));

  const parsed = customFoodInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false };

  const foodId = await createCustomFood(clinicId, parsed.data);
  if (!foodId) return { ok: false };

  const [food] = await searchFoodsById(clinicId, foodId);
  if (!food) return { ok: false };

  revalidatePath(`/${locale}/app/dishes`);
  return { ok: true, food };
}
