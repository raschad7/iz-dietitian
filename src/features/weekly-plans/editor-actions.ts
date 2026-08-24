'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { db } from '@/db';
import { weeklyPlans } from '@/db/schema';
import { localeSchema } from '@/features/clients/schema';
import { type Locale } from '@/i18n/routing';
import { requireStaffClinic } from '@/lib/session';

import {
  addMeal,
  addMealToWeek,
  clearMeal,
  createPlanFromSkeleton,
  moveMealDish,
  placeDish,
  removeMeal,
  removeMealFromWeek,
  resetMealIngredients,
  setMealIngredient,
  setMealServings,
} from './editor-mutations';
import type { NewWeekState, PlanActionState } from './form-state';
import { getClientContext, planDishesBySlot } from './queries';
import {
  addMealSchema,
  addWeekMealSchema,
  mealEditSchema,
  moveMealSchema,
  placeDishSchema,
  removeWeekMealSchema,
  setMealIngredientSchema,
  setServingsSchema,
  startEmptyWeekSchema,
  startWeekFromPlanSchema,
} from './schema';
import { planSkeleton, type SlotFill } from './skeleton';

/**
 * The doors into a plan that do not call a model.
 *
 * Both actions do the same three things — resolve the client's current schedule
 * and target, lay out the week, write it — and differ only in whether an earlier
 * plan's dishes are dropped into the slots. That shared middle is `startWeek`.
 *
 * Split from `actions.ts` because that file is already the generation pipeline and
 * has no business growing a second one.
 *
 * Same rule as every other action here: a server action is a public endpoint, so
 * the session is re-verified and the write is scoped to the caller's own clinic.
 */

function readLocale(formData: FormData): Locale {
  return localeSchema.parse(formData.get('locale'));
}

/** Both the board and the client's portal change together, so both are revalidated. */
function revalidateBoard(locale: Locale, clientId: string): void {
  revalidatePath(`/${locale}/app/weekly-plans`);
  revalidatePath(`/${locale}/app/weekly-plans/${clientId}`);
  revalidatePath(`/${locale}/portal/plan`);
}

/**
 * Lays out and writes a week.
 *
 * The skeleton always comes from the client's profile as it stands now, never from
 * the plan being copied — see the note in `skeleton.ts`. `fill` is the only
 * difference between the two doors.
 *
 * Returns either the new plan's id or the state to hand back to the form, so the
 * caller does the redirect. `redirect` throws, and doing it in here would put that
 * throw inside the caller's try/catch.
 */
async function startWeek(input: {
  clinicId: string;
  clientId: string;
  weekStartDate: string;
  fill?: ReadonlyMap<string, SlotFill>;
}): Promise<{ planId: string } | NewWeekState> {
  const context = await getClientContext(input.clinicId, input.clientId);

  // No profile, or not enough of one to compute a target: the same wall the
  // generate button puts up, for the same reason.
  if (!context?.profile || context.effectiveKcal === null) {
    return { status: 'error', messageKey: 'errors.profileIncomplete' };
  }

  const planId = await createPlanFromSkeleton({
    clinicId: input.clinicId,
    clientId: input.clientId,
    weekStartDate: input.weekStartDate,
    kcalTarget: context.effectiveKcal,
    meals: planSkeleton({
      schedule: context.profile.mealSchedule,
      dailyKcal: context.effectiveKcal,
      fill: input.fill,
    }),
  });

  if (!planId) return { status: 'error', messageKey: 'errors.planNotFound' };

  return { planId };
}

/** A week of empty slots, from the client's schedule. Nothing is generated. */
export async function startEmptyWeekAction(
  _previousState: NewWeekState,
  formData: FormData,
): Promise<NewWeekState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const parsed = startEmptyWeekSchema.safeParse({
    clientId: formData.get('clientId'),
    weekStartDate: formData.get('weekStartDate'),
  });

  if (!parsed.success) return { status: 'error', messageKey: 'errors.invalid' };

  let planId: string;

  try {
    const result = await startWeek({ clinicId, ...parsed.data });
    if ('status' in result) return result;
    planId = result.planId;
  } catch (error) {
    console.error('[weekly-plans] empty week failed', error);
    return { status: 'error', messageKey: 'errors.unexpected' };
  }

  revalidateBoard(locale, parsed.data.clientId);
  // Outside the try: `redirect` works by throwing, and catching it here would turn
  // a successful navigation into an "unexpected error".
  redirect(`/${locale}/app/weekly-plans/${parsed.data.clientId}?planId=${planId}`);
}

/** An earlier week's dishes, dropped into the client's current schedule. */
export async function startWeekFromPlanAction(
  _previousState: NewWeekState,
  formData: FormData,
): Promise<NewWeekState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const parsed = startWeekFromPlanSchema.safeParse({
    clientId: formData.get('clientId'),
    weekStartDate: formData.get('weekStartDate'),
    sourcePlanId: formData.get('sourcePlanId'),
  });

  if (!parsed.success) return { status: 'error', messageKey: 'errors.invalid' };

  let planId: string;

  try {
    // Clinic-scoped inside the query, so a forged source id yields an empty map
    // rather than another clinic's menu.
    const fill = await planDishesBySlot(clinicId, parsed.data.sourcePlanId);

    const result = await startWeek({
      clinicId,
      clientId: parsed.data.clientId,
      weekStartDate: parsed.data.weekStartDate,
      fill,
    });

    if ('status' in result) return result;
    planId = result.planId;
  } catch (error) {
    console.error('[weekly-plans] copy week failed', error);
    return { status: 'error', messageKey: 'errors.unexpected' };
  }

  revalidateBoard(locale, parsed.data.clientId);
  redirect(`/${locale}/app/weekly-plans/${parsed.data.clientId}?planId=${planId}`);
}

// ---------------------------------------------------------------------------
// Editing a plan
// ---------------------------------------------------------------------------

/**
 * Runs one edit and turns its outcome into a state the board can render.
 *
 * Every edit below is the same three lines — parse, write, revalidate — so they
 * are written once here. `false` from a mutation means the plan was not editable
 * or the id did not resolve inside this clinic; both are "not found" to the
 * caller, because distinguishing them would tell an attacker which ids exist.
 *
 * `clientId` comes back from the mutation rather than from the form: the board
 * revalidates a client's page, and taking that id from submitted data would let a
 * forged field bust an unrelated client's cache.
 */
async function runEdit(
  locale: Locale,
  clientId: string,
  write: () => Promise<boolean>,
): Promise<PlanActionState> {
  try {
    if (!(await write())) return { status: 'error', messageKey: 'errors.planNotFound' };
  } catch (error) {
    console.error('[weekly-plans] edit failed', error);
    return { status: 'error', messageKey: 'errors.unexpected' };
  }

  revalidateBoard(locale, clientId);

  return { status: 'done' };
}

/** The client whose board this plan belongs to, scoped to the caller's clinic. */
async function planClientId(clinicId: string, planId: string): Promise<string | null> {
  const [row] = await db
    .select({ clientId: weeklyPlans.clientId })
    .from(weeklyPlans)
    .where(and(eq(weeklyPlans.id, planId), eq(weeklyPlans.clinicId, clinicId)))
    .limit(1);

  return row?.clientId ?? null;
}

export async function placeDishAction(
  _previousState: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const parsed = placeDishSchema.safeParse({
    planId: formData.get('planId'),
    mealId: formData.get('mealId'),
    dishId: formData.get('dishId'),
    servings: formData.get('servings'),
  });

  if (!parsed.success) return { status: 'error', messageKey: 'errors.invalid' };

  const clientId = await planClientId(clinicId, parsed.data.planId);
  if (!clientId) return { status: 'error', messageKey: 'errors.planNotFound' };

  return runEdit(locale, clientId, () =>
    placeDish(
      clinicId,
      parsed.data.planId,
      parsed.data.mealId,
      parsed.data.dishId,
      parsed.data.servings,
    ),
  );
}

export async function setServingsAction(
  _previousState: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const parsed = setServingsSchema.safeParse({
    planId: formData.get('planId'),
    mealId: formData.get('mealId'),
    servings: formData.get('servings'),
  });

  if (!parsed.success) return { status: 'error', messageKey: 'errors.invalid' };

  const clientId = await planClientId(clinicId, parsed.data.planId);
  if (!clientId) return { status: 'error', messageKey: 'errors.planNotFound' };

  return runEdit(locale, clientId, () =>
    setMealServings(
      clinicId,
      parsed.data.planId,
      parsed.data.mealId,
      parsed.data.servings,
    ),
  );
}

/**
 * Moves one ingredient inside one meal — more chicken, one spoon less rice.
 *
 * The door the `−/+` beside a primary ingredient goes through. Everything that
 * makes it interesting happens in `setMealIngredient`: the first call copies the
 * whole meal down at its current amounts and retires the dish multiplier.
 *
 * `portionId` and `portionQuantity` arrive as empty strings from a form field that
 * was not filled, which is not the same as absent — `null` before parsing keeps
 * the schema's "both or neither" rule reading the truth rather than the encoding.
 */
export async function setMealIngredientAction(
  _previousState: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const parsed = setMealIngredientSchema.safeParse({
    planId: formData.get('planId'),
    mealId: formData.get('mealId'),
    foodId: formData.get('foodId'),
    quantityGrams: formData.get('quantityGrams'),
    portionId: formData.get('portionId') || null,
    portionQuantity: formData.get('portionQuantity') || null,
  });

  if (!parsed.success) return { status: 'error', messageKey: 'errors.invalid' };

  const clientId = await planClientId(clinicId, parsed.data.planId);
  if (!clientId) return { status: 'error', messageKey: 'errors.planNotFound' };

  return runEdit(locale, clientId, () =>
    setMealIngredient(clinicId, parsed.data.planId, parsed.data.mealId, {
      foodId: parsed.data.foodId,
      quantityGrams: parsed.data.quantityGrams,
      portionId: parsed.data.portionId ?? null,
      portionQuantity: parsed.data.portionQuantity ?? null,
    }),
  );
}

/** Puts a meal back on its dish's recipe, discarding amounts set by hand. */
export async function resetMealIngredientsAction(
  _previousState: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const parsed = mealEditSchema.safeParse({
    planId: formData.get('planId'),
    mealId: formData.get('mealId'),
  });

  if (!parsed.success) return { status: 'error', messageKey: 'errors.invalid' };

  const clientId = await planClientId(clinicId, parsed.data.planId);
  if (!clientId) return { status: 'error', messageKey: 'errors.planNotFound' };

  return runEdit(locale, clientId, () =>
    resetMealIngredients(clinicId, parsed.data.planId, parsed.data.mealId),
  );
}

export async function clearMealAction(
  _previousState: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const parsed = mealEditSchema.safeParse({
    planId: formData.get('planId'),
    mealId: formData.get('mealId'),
  });

  if (!parsed.success) return { status: 'error', messageKey: 'errors.invalid' };

  const clientId = await planClientId(clinicId, parsed.data.planId);
  if (!clientId) return { status: 'error', messageKey: 'errors.planNotFound' };

  return runEdit(locale, clientId, () =>
    clearMeal(clinicId, parsed.data.planId, parsed.data.mealId),
  );
}

export async function removeMealAction(
  _previousState: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const parsed = mealEditSchema.safeParse({
    planId: formData.get('planId'),
    mealId: formData.get('mealId'),
  });

  if (!parsed.success) return { status: 'error', messageKey: 'errors.invalid' };

  const clientId = await planClientId(clinicId, parsed.data.planId);
  if (!clientId) return { status: 'error', messageKey: 'errors.planNotFound' };

  return runEdit(locale, clientId, () =>
    removeMeal(clinicId, parsed.data.planId, parsed.data.mealId),
  );
}

export async function addMealAction(
  _previousState: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const parsed = addMealSchema.safeParse({
    planId: formData.get('planId'),
    dayOfWeek: formData.get('dayOfWeek'),
    slotKey: formData.get('slotKey'),
    label: formData.get('label'),
    timeOfDay: formData.get('timeOfDay'),
  });

  if (!parsed.success) return { status: 'error', messageKey: 'errors.invalid' };

  const clientId = await planClientId(clinicId, parsed.data.planId);
  if (!clientId) return { status: 'error', messageKey: 'errors.planNotFound' };

  return runEdit(locale, clientId, async () => {
    const added = await addMeal(
      clinicId,
      parsed.data.planId,
      {
        dayOfWeek: parsed.data.dayOfWeek,
        slotKey: parsed.data.slotKey,
        label: parsed.data.label,
        timeOfDay: parsed.data.timeOfDay,
      },
    );

    return added !== null;
  });
}

/**
 * Adds a slot to every day of the week.
 *
 * The board's default way to grow a schedule: slots are rows, and a row that
 * only exists on Tuesday is a row whose label describes one cell out of seven.
 * Restoring a single skipped day goes through `addMealAction` instead.
 */
export async function addWeekMealAction(
  _previousState: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const parsed = addWeekMealSchema.safeParse({
    planId: formData.get('planId'),
    slotKey: formData.get('slotKey'),
    label: formData.get('label'),
    timeOfDay: formData.get('timeOfDay'),
  });

  if (!parsed.success) return { status: 'error', messageKey: 'errors.invalid' };

  const clientId = await planClientId(clinicId, parsed.data.planId);
  if (!clientId) return { status: 'error', messageKey: 'errors.planNotFound' };

  return runEdit(locale, clientId, async () => {
    const added = await addMealToWeek(
      clinicId,
      parsed.data.planId,
      {
        slotKey: parsed.data.slotKey,
        label: parsed.data.label,
        timeOfDay: parsed.data.timeOfDay,
      },
    );

    return added > 0;
  });
}

export async function moveMealAction(
  _previousState: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const parsed = moveMealSchema.safeParse({
    planId: formData.get('planId'),
    fromMealId: formData.get('fromMealId'),
    toMealId: formData.get('toMealId'),
    mode: formData.get('mode'),
  });

  if (!parsed.success) return { status: 'error', messageKey: 'errors.invalid' };

  const clientId = await planClientId(clinicId, parsed.data.planId);
  if (!clientId) return { status: 'error', messageKey: 'errors.planNotFound' };

  return runEdit(locale, clientId, () =>
    moveMealDish(
      clinicId,
      parsed.data.planId,
      parsed.data.fromMealId,
      parsed.data.toMealId,
      parsed.data.mode,
    ),
  );
}

/**
 * Removes a slot from every day of the week.
 *
 * Confirmed in the UI rather than here: the server cannot tell a deliberate
 * week-wide removal from an accidental one, and the seven meals it drops take
 * whatever dishes were in them with them.
 */
export async function removeWeekMealAction(
  _previousState: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const parsed = removeWeekMealSchema.safeParse({
    planId: formData.get('planId'),
    slotKey: formData.get('slotKey'),
  });

  if (!parsed.success) return { status: 'error', messageKey: 'errors.invalid' };

  const clientId = await planClientId(clinicId, parsed.data.planId);
  if (!clientId) return { status: 'error', messageKey: 'errors.planNotFound' };

  return runEdit(locale, clientId, async () => {
    const removed = await removeMealFromWeek(
      clinicId,
      parsed.data.planId,
      parsed.data.slotKey,
    );

    return removed > 0;
  });
}
