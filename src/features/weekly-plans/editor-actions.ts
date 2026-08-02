'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { localeSchema } from '@/features/clients/schema';
import { type Locale } from '@/i18n/routing';
import { requireStaffClinic } from '@/lib/session';

import { createPlanFromSkeleton } from './editor-mutations';
import type { NewWeekState } from './form-state';
import { getClientContext, planDishesBySlot } from './queries';
import { startEmptyWeekSchema, startWeekFromPlanSchema } from './schema';
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
