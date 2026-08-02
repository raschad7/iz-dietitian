'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { localeSchema } from '@/features/clients/schema';
import { type Locale } from '@/i18n/routing';
import { requireStaffClinic } from '@/lib/session';

import { GenerationFailedError, runGeneration, type GenerationOutcome } from './generate';
import { EmptySlotCatalogError, type PromptInput } from './prompt';
import { LlmNotConfiguredError } from './llm';
import {
  createPlanFromGeneration,
  getMealForRegeneration,
  publishPlan,
  recordGeneration,
  replaceMeals,
  saveNutritionProfile,
  saveWeekInstructions,
  swapMealDish,
  unpublishPlan,
  deletePlan,
} from './mutations';
import type { DishDetail } from './nutrition';
import {
  getBoard,
  getClientContext,
  loadCatalog,
  previousPlanSlugs,
  toPromptCatalog,
  type ClientContext,
} from './queries';
import {
  DAYS_OF_WEEK,
  generateWeekSchema,
  nutritionProfileSchema,
  planIdSchema,
  publishPlanSchema,
  regenerateDaySchema,
  regenerateMealSchema,
  swapMealSchema,
  type GenerationScope,
} from './schema';
import type { GenerateState, PlanActionState, ProfileFormState } from './form-state';

/**
 * A server action is a public endpoint. The layout guard protects the page render,
 * not the mutation, so every action below re-verifies the session and scopes the
 * write to the caller's own clinic.
 *
 * Ids arriving in a FormData are attacker-controlled. None of them are trusted: the
 * mutation layer resolves each one back to a plan and checks the clinic before
 * writing, and returns false rather than throwing when it does not match.
 */

function readLocale(formData: FormData): Locale {
  return localeSchema.parse(formData.get('locale'));
}

/** Both the board and the client's portal change together, so both are revalidated. */
function revalidateBoard(locale: Locale, clientId?: string): void {
  revalidatePath(`/${locale}/app/weekly-plans`);
  if (clientId) revalidatePath(`/${locale}/app/weekly-plans/${clientId}`);
  revalidatePath(`/${locale}/portal/plan`);
}

// ---------------------------------------------------------------------------
// The profile
// ---------------------------------------------------------------------------

export async function saveProfileAction(
  _previousState: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  // The schedule arrives as parallel arrays of inputs — one set of fields per
  // slot — which is what an HTML form can express. Zipped here rather than in the
  // schema, so the schema stays about validity and not about form encoding.
  const slotKeys = formData.getAll('slotKey').map(String);
  const mealSchedule = slotKeys.map((slotKey, index) => ({
    slotKey,
    label: String(formData.getAll('slotLabel')[index] ?? ''),
    timeOfDay: String(formData.getAll('slotTime')[index] ?? ''),
    kcalShare: Number(formData.getAll('slotShare')[index] ?? 0) / 100,
  }));

  const parsed = nutritionProfileSchema.safeParse({
    clientId: formData.get('clientId'),
    allergenTags: formData.getAll('allergenTags'),
    weightKg: formData.get('weightKg'),
    dailyKcalTarget: formData.get('dailyKcalTarget'),
    proteinTargetGrams: formData.get('proteinTargetGrams'),
    preferences: formData.get('preferences'),
    dislikes: formData.get('dislikes'),
    permanentInstructions: formData.get('permanentInstructions'),
    mealSchedule,
  });

  if (!parsed.success) {
    return {
      status: 'error',
      messageKey: 'errors.invalid',
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  try {
    const saved = await saveNutritionProfile(clinicId, parsed.data);
    if (!saved) return { status: 'error', messageKey: 'errors.clientNotFound' };
  } catch (error) {
    console.error('[weekly-plans] profile save failed', error);
    return { status: 'error', messageKey: 'errors.unexpected' };
  }

  revalidateBoard(locale, parsed.data.clientId);
  return { status: 'saved' };
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

/**
 * A context that has passed the completeness check.
 *
 * The narrowed fields are lifted out rather than left as `context.effectiveKcal!`
 * everywhere downstream: `prepare` is the one place that establishes they are
 * present, so it is the one place that should have to say so.
 */
type ReadyContext = {
  context: ClientContext;
  kcalTarget: number;
  allergens: string[];
  profile: NonNullable<ClientContext['profile']>;
  catalog: DishDetail[];
};

/**
 * Everything a generation needs, or the reason it cannot run.
 *
 * Gathered before the model is called so a missing weight costs nothing, and so
 * each blocking condition maps to a message the page can render rather than an
 * error it has to interpret.
 */
async function prepare(
  clinicId: string,
  clientId: string,
): Promise<{ ok: true; ready: ReadyContext } | { ok: false; state: GenerateState }> {
  const context = await getClientContext(clinicId, clientId);

  if (!context) return { ok: false, state: { status: 'error', messageKey: 'errors.planNotFound' } };

  // BMI and the calorie target are unanswerable without height, weight, sex and a
  // date of birth. The form names the missing fields; this only has to refuse.
  if (context.effectiveKcal === null || !context.profile) {
    return { ok: false, state: { status: 'error', messageKey: 'errors.profileIncomplete' } };
  }

  const catalog = await loadCatalog(context.profile.allergenTags);

  if (!catalog.length) {
    return { ok: false, state: { status: 'error', messageKey: 'errors.emptyCatalog' } };
  }

  return {
    ok: true,
    ready: {
      context,
      kcalTarget: context.effectiveKcal,
      allergens: context.profile.allergenTags,
      profile: context.profile,
      catalog,
    },
  };
}

/** The prompt payload, assembled from the context. Identity is not among the fields. */
function promptInput({
  ready,
  instruction,
  previous,
  days,
  scope,
  budgets,
}: {
  ready: ReadyContext;
  instruction: string | null;
  previous: string[];
  days: number[];
  scope: GenerationScope;
  budgets: ClientContext['budgets'];
}): PromptInput {
  const { context, profile, kcalTarget, catalog } = ready;

  return {
    client: {
      age: context.age,
      sex: context.sex,
      heightCm: context.heightCm,
      weightKg: profile.weightKg,
      bmi: context.targets.bmi,
      bmiCategory: context.targets.bmiCategory,
      activityLevel: context.activityLevel,
      goal: context.goal,
      dailyKcalTarget: kcalTarget,
      proteinTargetGrams: context.effectiveProteinGrams,
      allergies: context.allergies,
      preferences: profile.preferences,
      dislikes: profile.dislikes,
      permanentInstructions: profile.permanentInstructions,
    },
    budgets,
    catalog: toPromptCatalog(catalog),
    instruction,
    previousSlugs: previous,
    days,
    scope,
  };
}

/**
 * Maps a thrown generation failure to a state the page can render.
 *
 * Every branch here is a condition the dietitian can act on. Anything else is a bug
 * and is logged as one rather than dressed up as a user error.
 */
function toErrorState(error: unknown, scope: string): GenerateState {
  if (error instanceof LlmNotConfiguredError) {
    return { status: 'error', messageKey: 'errors.notConfigured' };
  }

  if (error instanceof EmptySlotCatalogError) {
    return { status: 'error', messageKey: 'errors.emptyCatalog', detail: error.slotKey };
  }

  if (error instanceof GenerationFailedError) {
    return { status: 'error', messageKey: 'errors.modelUnusable', detail: error.message };
  }

  console.error(`[weekly-plans] ${scope} generation failed`, error);
  return { status: 'error', messageKey: 'errors.unexpected' };
}

/** A success, or a success with gaps. The distinction is what the banner shows. */
function toDoneState(outcome: GenerationOutcome): GenerateState {
  return outcome.unfilled > 0 ? { status: 'partial', unfilled: outcome.unfilled } : { status: 'done' };
}

export async function generateWeekAction(
  _previousState: GenerateState,
  formData: FormData,
): Promise<GenerateState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const parsed = generateWeekSchema.safeParse({
    clientId: formData.get('clientId'),
    weekStartDate: formData.get('weekStartDate'),
    instruction: formData.get('instruction'),
  });

  if (!parsed.success) return { status: 'error', messageKey: 'errors.unexpected' };

  const prepared = await prepare(clinicId, parsed.data.clientId);
  if (!prepared.ok) return prepared.state;

  const { ready } = prepared;
  const instruction = parsed.data.instruction ?? null;
  let outcome: GenerationOutcome;

  try {
    outcome = await runGeneration(
      promptInput({
        ready,
        instruction,
        previous: await previousPlanSlugs(clinicId, parsed.data.clientId),
        days: [...DAYS_OF_WEEK],
        scope: 'week',
        budgets: ready.context.budgets,
      }),
      toPromptCatalog(ready.catalog),
      ready.allergens,
    );
  } catch (error) {
    // The audit row is written for failures too — those are the interesting ones.
    await recordGeneration({
      clinicId,
      planId: null,
      scope: 'week',
      instruction,
      model: process.env.OPENAI_MODEL ?? 'unknown',
      status: 'failed',
      error: error instanceof Error ? error.message.slice(0, 1000) : String(error),
    }).catch(() => {});

    return toErrorState(error, 'week');
  }

  try {
    const planId = await createPlanFromGeneration({
      clinicId,
      clientId: parsed.data.clientId,
      weekStartDate: parsed.data.weekStartDate,
      kcalTarget: ready.kcalTarget,
      weekInstructions: instruction,
      outcome,
    });

    if (!planId) return { status: 'error', messageKey: 'errors.planNotFound' };

    await recordGeneration({
      clinicId,
      planId,
      scope: 'week',
      instruction,
      model: outcome.model,
      promptTokens: outcome.usage.promptTokens,
      completionTokens: outcome.usage.completionTokens,
      durationMs: outcome.durationMs,
      status: 'ok',
    });
  } catch (error) {
    console.error('[weekly-plans] persisting the plan failed', error);
    return { status: 'error', messageKey: 'errors.unexpected' };
  }

  revalidateBoard(locale, parsed.data.clientId);
  return toDoneState(outcome);
}

/**
 * Regenerates one day, or one meal, of an existing draft.
 *
 * Both scopes share this path because they differ only in which slots are asked
 * for. Replacing a subset touches only its own rows, so a bad meal regeneration
 * cannot damage the rest of the week.
 */
async function regenerate({
  locale,
  clinicId,
  planId,
  dayOfWeek,
  slotKeys,
  instruction,
  scope,
}: {
  locale: Locale;
  clinicId: string;
  planId: string;
  dayOfWeek: number;
  slotKeys: string[] | null;
  instruction: string | null;
  scope: GenerationScope;
}): Promise<GenerateState> {
  const board = await getBoard(clinicId, planId);

  if (!board) return { status: 'error', messageKey: 'errors.planNotFound' };

  const prepared = await prepare(clinicId, board.clientId);
  if (!prepared.ok) return prepared.state;

  const { ready } = prepared;

  // Only the slots being replaced are requested, so the model is not asked to
  // reproduce meals that are staying.
  const budgets = slotKeys
    ? ready.context.budgets.filter((slot) => slotKeys.includes(slot.slotKey))
    : ready.context.budgets;

  if (!budgets.length) return { status: 'error', messageKey: 'errors.planNotFound' };

  let outcome: GenerationOutcome;

  try {
    outcome = await runGeneration(
      promptInput({
        ready,
        instruction,
        previous: await previousPlanSlugs(clinicId, board.clientId, planId),
        days: [dayOfWeek],
        scope,
        budgets,
      }),
      toPromptCatalog(ready.catalog),
      ready.allergens,
    );
  } catch (error) {
    await recordGeneration({
      clinicId,
      planId,
      scope,
      instruction,
      model: process.env.OPENAI_MODEL ?? 'unknown',
      status: 'failed',
      error: error instanceof Error ? error.message.slice(0, 1000) : String(error),
    }).catch(() => {});

    return toErrorState(error, scope);
  }

  try {
    const replaced = await replaceMeals(clinicId, planId, outcome.meals, outcome.model);
    if (!replaced) return { status: 'error', messageKey: 'errors.planNotFound' };

    await recordGeneration({
      clinicId,
      planId,
      scope,
      instruction,
      model: outcome.model,
      promptTokens: outcome.usage.promptTokens,
      completionTokens: outcome.usage.completionTokens,
      durationMs: outcome.durationMs,
      status: 'ok',
    });
  } catch (error) {
    console.error(`[weekly-plans] replacing ${scope} failed`, error);
    return { status: 'error', messageKey: 'errors.unexpected' };
  }

  revalidateBoard(locale, board.clientId);
  return toDoneState(outcome);
}

export async function regenerateDayAction(
  _previousState: GenerateState,
  formData: FormData,
): Promise<GenerateState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const parsed = regenerateDaySchema.safeParse({
    planId: formData.get('planId'),
    dayOfWeek: formData.get('dayOfWeek'),
    instruction: formData.get('instruction'),
  });

  if (!parsed.success) return { status: 'error', messageKey: 'errors.unexpected' };

  return regenerate({
    locale,
    clinicId,
    planId: parsed.data.planId,
    dayOfWeek: parsed.data.dayOfWeek,
    slotKeys: null,
    instruction: parsed.data.instruction ?? null,
    scope: 'day',
  });
}

export async function regenerateMealAction(
  _previousState: GenerateState,
  formData: FormData,
): Promise<GenerateState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const parsed = regenerateMealSchema.safeParse({
    planId: formData.get('planId'),
    mealId: formData.get('mealId'),
    instruction: formData.get('instruction'),
  });

  if (!parsed.success) return { status: 'error', messageKey: 'errors.unexpected' };

  const meal = await getMealForRegeneration(clinicId, parsed.data.planId, parsed.data.mealId);
  if (!meal) return { status: 'error', messageKey: 'errors.planNotFound' };

  return regenerate({
    locale,
    clinicId,
    planId: parsed.data.planId,
    dayOfWeek: meal.dayOfWeek,
    slotKeys: [meal.slotKey],
    instruction: parsed.data.instruction ?? null,
    scope: 'meal',
  });
}

// ---------------------------------------------------------------------------
// Manual edits and publishing
// ---------------------------------------------------------------------------

export async function swapMealAction(
  _previousState: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const parsed = swapMealSchema.safeParse({
    planId: formData.get('planId'),
    mealId: formData.get('mealId'),
    dishId: formData.get('dishId'),
    servings: formData.get('servings'),
  });

  if (!parsed.success) return { status: 'error', messageKey: 'errors.invalid' };

  try {
    const swapped = await swapMealDish(
      clinicId,
      parsed.data.planId,
      parsed.data.mealId,
      parsed.data.dishId,
      parsed.data.servings,
    );

    if (!swapped) return { status: 'error', messageKey: 'errors.notDraft' };
  } catch (error) {
    console.error('[weekly-plans] swap failed', error);
    return { status: 'error', messageKey: 'errors.unexpected' };
  }

  revalidateBoard(locale);
  return { status: 'done' };
}

export async function saveInstructionsAction(
  _previousState: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const planId = planIdSchema.safeParse(formData.get('planId'));
  if (!planId.success) return { status: 'error', messageKey: 'errors.invalid' };

  const raw = formData.get('instruction');
  const instruction = typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, 600) : null;

  try {
    const saved = await saveWeekInstructions(clinicId, planId.data, instruction);
    if (!saved) return { status: 'error', messageKey: 'errors.planNotFound' };
  } catch (error) {
    console.error('[weekly-plans] saving instructions failed', error);
    return { status: 'error', messageKey: 'errors.unexpected' };
  }

  revalidateBoard(locale);
  return { status: 'done' };
}

export async function publishPlanAction(
  _previousState: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const parsed = publishPlanSchema.safeParse({ planId: formData.get('planId') });
  if (!parsed.success) return { status: 'error', messageKey: 'errors.invalid' };

  try {
    const result = await publishPlan(clinicId, parsed.data.planId);

    if (!result.ok) {
      // `unfilled` is the one a dietitian can fix, so it gets its own message
      // rather than a generic refusal.
      return {
        status: 'error',
        messageKey:
          result.reason === 'unfilled'
            ? 'errors.unfilled'
            : result.reason === 'not_draft'
              ? 'errors.notDraft'
              : 'errors.planNotFound',
      };
    }
  } catch (error) {
    console.error('[weekly-plans] publish failed', error);
    return { status: 'error', messageKey: 'errors.unexpected' };
  }

  revalidateBoard(locale);
  return { status: 'done' };
}

export async function unpublishPlanAction(
  _previousState: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const parsed = publishPlanSchema.safeParse({ planId: formData.get('planId') });
  if (!parsed.success) return { status: 'error', messageKey: 'errors.invalid' };

  try {
    const done = await unpublishPlan(clinicId, parsed.data.planId);
    if (!done) return { status: 'error', messageKey: 'errors.planNotFound' };
  } catch (error) {
    console.error('[weekly-plans] unpublish failed', error);
    return { status: 'error', messageKey: 'errors.unexpected' };
  }

  revalidateBoard(locale);
  return { status: 'done' };
}

/**
 * Deletes a plan, then returns to the client's board.
 *
 * The UI asks for confirmation first; this does not, because a server action
 * cannot.
 */
export async function deletePlanAction(formData: FormData): Promise<void> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const planId = planIdSchema.safeParse(formData.get('planId'));
  const clientId = formData.get('clientId');

  if (planId.success) {
    try {
      await deletePlan(clinicId, planId.data);
    } catch (error) {
      console.error('[weekly-plans] delete failed', error);
    }
  }

  revalidateBoard(locale);

  // Outside the try/catch — `redirect` signals by throwing.
  redirect(typeof clientId === 'string' ? `/${locale}/app/weekly-plans/${clientId}` : `/${locale}/app/weekly-plans`);
}

