'use server';

import { revalidatePath } from 'next/cache';

import { localeSchema } from '@/features/clients/schema';
import { type Locale } from '@/i18n/routing';
import { requireStaffClinic } from '@/lib/session';

import { clinicDishInputSchema, customFoodInputSchema } from './catalog-schema';
import type { CatalogFormState } from './catalog-form-state';
import { findFoodMatches, type FoodMatchResult } from './food-matching';
import {
  createClinicDish,
  createCustomFood,
  deleteClinicDish,
  hideSharedDish,
  unhideSharedDish,
  updateClinicDish,
} from './catalog-mutations';
import { searchClinicFoods, searchFoodsById, type FoodSearchResult } from './queries';

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

/** Assembles the raw (unvalidated) dish input from the editor's form fields. */
function readDishInput(formData: FormData): unknown {
  return {
    nameAr: formData.get('nameAr'),
    nameEn: formData.get('nameEn'),
    baseServingLabel: formData.get('baseServingLabel'),
    mealTypes: formData.getAll('mealTypes'),
    tags: formData.getAll('tags'),
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

export async function searchFoodMatchesAction(locale: string, arabicName: string): Promise<FoodMatchResult> {
  const { clinicId } = await requireStaffClinic(localeSchema.parse(locale));
  return findFoodMatches(clinicId, arabicName);
}

/**
 * The dish editor's primary food search: the clinic's own library only, plain
 * Arabic/English text matching, no AI and no USDA. `searchFoodMatchesAction`
 * above (USDA + AI translation) is offered as a clearly-secondary option in
 * `FoodPicker`, not the first thing the dietitian reaches for.
 */
export async function searchClinicFoodsAction(locale: string, query: string): Promise<FoodSearchResult[]> {
  const { clinicId } = await requireStaffClinic(localeSchema.parse(locale));
  return searchClinicFoods(clinicId, query);
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
