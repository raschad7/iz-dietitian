'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { localeSchema } from '@/features/clients/schema';
import { type Locale } from '@/i18n/routing';
import { requireStaffClinic } from '@/lib/session';

import {
  addItem,
  addMeal,
  createPlan,
  deleteItem,
  deleteMeal,
  deletePlan,
  updateItemQuantity,
  updateMeal,
  updatePlan,
} from './mutations';
import { type PlanFormState } from './form-state';
import { searchFoods, type FoodSummary } from './queries';
import {
  foodSearchSchema,
  itemFormSchema,
  itemIdSchema,
  mealFormSchema,
  mealIdSchema,
  planFormSchema,
  planIdSchema,
  quantityGramsSchema,
} from './schema';

/**
 * A server action is a public endpoint. The layout guard protects the page
 * render, not the mutation, so every action below re-verifies the session and
 * scopes the write to the caller's own clinic.
 *
 * Ids arriving in a FormData are attacker-controlled. None of them are trusted:
 * the mutation layer resolves each one back to a plan and checks the clinic
 * before writing, and returns false rather than throwing when it does not match.
 */

function readLocale(formData: FormData): Locale {
  return localeSchema.parse(formData.get('locale'));
}

/** Both views of a plan change together, so both are always revalidated. */
function revalidatePlan(locale: Locale, planId?: string): void {
  revalidatePath(`/${locale}/app/meal-plans`);
  if (planId) revalidatePath(`/${locale}/app/meal-plans/${planId}`);
}

export async function createPlanAction(
  _previousState: PlanFormState,
  formData: FormData,
): Promise<PlanFormState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const parsed = planFormSchema.safeParse({
    clientId: formData.get('clientId'),
    title: formData.get('title'),
    notes: formData.get('notes'),
  });

  if (!parsed.success) {
    return {
      status: 'error',
      messageKey: 'errors.invalid',
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  let planId: string;

  try {
    const plan = await createPlan(clinicId, parsed.data);

    // Null means the client belongs to a different clinic — or to nobody.
    if (!plan) return { status: 'error', messageKey: 'errors.clientNotFound' };

    planId = plan.id;
  } catch (error) {
    console.error('[meal-plans] create failed', error);
    return { status: 'error', messageKey: 'errors.unexpected' };
  }

  revalidatePlan(locale);

  // Outside the try/catch — `redirect` signals by throwing.
  redirect(`/${locale}/app/meal-plans/${planId}`);
}

export async function updatePlanAction(
  _previousState: PlanFormState,
  formData: FormData,
): Promise<PlanFormState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const planId = planIdSchema.parse(formData.get('planId'));

  const parsed = planFormSchema.safeParse({
    clientId: formData.get('clientId'),
    title: formData.get('title'),
    notes: formData.get('notes'),
  });

  if (!parsed.success) {
    return {
      status: 'error',
      messageKey: 'errors.invalid',
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  try {
    await updatePlan(clinicId, planId, parsed.data);
  } catch (error) {
    console.error('[meal-plans] update failed', error);
    return { status: 'error', messageKey: 'errors.unexpected' };
  }

  revalidatePlan(locale, planId);

  redirect(`/${locale}/app/meal-plans/${planId}`);
}

/**
 * Deletes a plan, then returns to the list — there is no detail page left to go
 * back to. The UI asks for confirmation first; this does not, because a server
 * action cannot.
 */
export async function deletePlanAction(formData: FormData): Promise<void> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  await deletePlan(clinicId, planIdSchema.parse(formData.get('planId')));

  revalidatePlan(locale);

  redirect(`/${locale}/app/meal-plans`);
}

export async function addMealAction(formData: FormData): Promise<void> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const planId = planIdSchema.parse(formData.get('planId'));

  const parsed = mealFormSchema.safeParse({
    label: formData.get('label'),
    timeOfDay: formData.get('timeOfDay'),
  });

  // These forms have no error surface of their own: the inputs are `required`
  // and `type="time"`, so a failure here means the request did not come from the
  // page. Drop it rather than crashing the route.
  if (!parsed.success) return;

  await addMeal(clinicId, planId, parsed.data);

  revalidatePlan(locale, planId);
}

export async function updateMealAction(formData: FormData): Promise<void> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const planId = planIdSchema.parse(formData.get('planId'));
  const mealId = mealIdSchema.parse(formData.get('mealId'));

  const parsed = mealFormSchema.safeParse({
    label: formData.get('label'),
    timeOfDay: formData.get('timeOfDay'),
  });

  if (!parsed.success) return;

  await updateMeal(clinicId, mealId, parsed.data);

  revalidatePlan(locale, planId);
}

export async function deleteMealAction(formData: FormData): Promise<void> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const planId = planIdSchema.parse(formData.get('planId'));

  await deleteMeal(clinicId, mealIdSchema.parse(formData.get('mealId')));

  revalidatePlan(locale, planId);
}

export async function addItemAction(formData: FormData): Promise<void> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const planId = planIdSchema.parse(formData.get('planId'));
  const mealId = mealIdSchema.parse(formData.get('mealId'));

  const parsed = itemFormSchema.safeParse({
    foodId: formData.get('foodId'),
    quantityGrams: formData.get('quantityGrams'),
  });

  if (!parsed.success) return;

  await addItem(clinicId, mealId, parsed.data);

  revalidatePlan(locale, planId);
}

export async function updateItemQuantityAction(formData: FormData): Promise<void> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const planId = planIdSchema.parse(formData.get('planId'));
  const itemId = itemIdSchema.parse(formData.get('itemId'));

  const parsed = quantityGramsSchema.safeParse(formData.get('quantityGrams'));
  if (!parsed.success) return;

  await updateItemQuantity(clinicId, itemId, parsed.data);

  revalidatePlan(locale, planId);
}

export async function deleteItemAction(formData: FormData): Promise<void> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const planId = planIdSchema.parse(formData.get('planId'));

  await deleteItem(clinicId, itemIdSchema.parse(formData.get('itemId')));

  revalidatePlan(locale, planId);
}

/**
 * Backs the food picker's search box.
 *
 * An action rather than a route handler so it inherits the same session check as
 * every other mutation here — `foods` is public-domain reference data, but the
 * endpoint should still not be open to the world.
 */
export async function searchFoodsAction(
  locale: Locale,
  query: string,
  category: string,
): Promise<FoodSummary[]> {
  await requireStaffClinic(localeSchema.parse(locale));

  const parsed = foodSearchSchema.safeParse({ q: query, category });
  if (!parsed.success) return [];

  return searchFoods(parsed.data);
}
