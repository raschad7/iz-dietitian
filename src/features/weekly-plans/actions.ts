'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { after } from 'next/server';

import { type IsoDate } from '@/features/booking/date';
import { localeSchema } from '@/features/clients/schema';
import { notifyPlanPublished } from '@/features/portal/push/notify';
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
  saveReview,
  saveWeekInstructions,
  swapMealDish,
  unpublishPlan,
  deletePlan,
} from './mutations';
import type { DishDetail } from './nutrition';
import {
  getBoard,
  getClientContext,
  getPlanNotificationTarget,
  loadCatalog,
  previousPlanSlugs,
  toPromptCatalog,
  type ClientContext,
} from './queries';
import {
  DAYS_OF_WEEK,
  generateWeekSchema,
  planIdSchema,
  publishPlanSchema,
  regenerateDaySchema,
  regenerateMealSchema,
  swapMealSchema,
  type GenerationScope,
} from './schema';
import { slotBudgets } from './targets';
import type { GenerateState, PlanActionState, ReviewState } from './form-state';
import { runReview, type ReviewOutcome } from './review';

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
  /** The goal and protein target in force, after any per-plan override. */
  goal: string | null;
  proteinTargetGrams: number | null;
  /** Slot budgets against `kcalTarget`, which is not always the profile's. */
  budgets: ClientContext['budgets'];
  allergens: string[];
  profile: NonNullable<ClientContext['profile']>;
  catalog: DishDetail[];
};

/**
 * Figures belonging to one plan rather than to the client.
 *
 * Every field optional and nullable: absent means "use the profile", which is what
 * a plan generated before these existed, or without touching them, records.
 */
type PlanTargets = {
  kcalTarget?: number | null;
  proteinTarget?: number | null;
  goal?: string | null;
};

/**
 * Everything a generation needs, or the reason it cannot run.
 *
 * Gathered before the model is called so a missing weight costs nothing, and so
 * each blocking condition maps to a message the page can render rather than an
 * error it has to interpret.
 *
 * `targets` is how a week gets its own calorie, protein or goal figure without the
 * client's profile moving. Regeneration passes the plan's stored snapshots for the
 * same reason: regenerating Tuesday inside a 1,700 kcal week must not quietly
 * rebuild it against the profile's 1,850.
 */
async function prepare(
  clinicId: string,
  clientId: string,
  targets: PlanTargets = {},
): Promise<{ ok: true; ready: ReadyContext } | { ok: false; state: GenerateState }> {
  const context = await getClientContext(clinicId, clientId);

  if (!context) return { ok: false, state: { status: 'error', messageKey: 'errors.planNotFound' } };

  // BMI and the calorie target are unanswerable without height, weight, sex and a
  // date of birth. The form names the missing fields; this only has to refuse.
  if (context.effectiveKcal === null || !context.profile) {
    return { ok: false, state: { status: 'error', messageKey: 'errors.profileIncomplete' } };
  }

  const catalog = await loadCatalog(clinicId, context.profile.allergenTags);

  if (!catalog.length) {
    return { ok: false, state: { status: 'error', messageKey: 'errors.emptyCatalog' } };
  }

  const kcalTarget = targets.kcalTarget ?? context.effectiveKcal;

  return {
    ok: true,
    ready: {
      context,
      kcalTarget,
      goal: targets.goal ?? context.goal,
      proteinTargetGrams: targets.proteinTarget ?? context.effectiveProteinGrams,
      // Recomputed only when the target actually moved, so the untouched path keeps
      // returning the identical array the context already built.
      budgets:
        kcalTarget === context.effectiveKcal
          ? context.budgets
          : slotBudgets(kcalTarget, context.profile.mealSchedule),
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
      goal: ready.goal,
      dailyKcalTarget: kcalTarget,
      proteinTargetGrams: ready.proteinTargetGrams,
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
    kcalTarget: formData.get('kcalTarget'),
    proteinTarget: formData.get('proteinTarget'),
    goal: formData.get('goal'),
  });

  if (!parsed.success) return { status: 'error', messageKey: 'errors.unexpected' };

  const prepared = await prepare(clinicId, parsed.data.clientId, {
    kcalTarget: parsed.data.kcalTarget,
    proteinTarget: parsed.data.proteinTarget,
    goal: parsed.data.goal,
  });
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
        budgets: ready.budgets,
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
      // Stored only when the dietitian actually overrode them, so a plan built
      // from the profile keeps deferring to it.
      proteinTarget: parsed.data.proteinTarget ?? null,
      goal: parsed.data.goal ?? null,
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

  // The plan's own figures, not the profile's. Regenerating Tuesday inside a
  // 1,700 kcal week must not quietly rebuild it against a profile that has since
  // moved to 1,850 — the rest of the week would still be budgeted for 1,700.
  const prepared = await prepare(clinicId, board.clientId, {
    kcalTarget: board.kcalTargetSnapshot,
    proteinTarget: board.proteinTargetSnapshot,
    goal: board.goalSnapshot,
  });
  if (!prepared.ok) return prepared.state;

  const { ready } = prepared;

  // Only the slots being replaced are requested, so the model is not asked to
  // reproduce meals that are staying.
  const budgets = slotKeys
    ? ready.budgets.filter((slot) => slotKeys.includes(slot.slotKey))
    : ready.budgets;

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

/**
 * Asks the model to read a finished week and stores what it said.
 *
 * A request of its own, pressed by the dietitian, rather than a second pass
 * inside generation: a generation already runs close to the route's ceiling, and
 * a review that made every plan take twice as long would be turned off within a
 * week. It also puts her in charge of it — the findings are shown, not applied.
 */
export async function reviewPlanAction(
  _previousState: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const parsed = publishPlanSchema.safeParse({ planId: formData.get('planId') });
  if (!parsed.success) return { status: 'error', messageKey: 'errors.planNotFound' };

  const board = await getBoard(clinicId, parsed.data.planId);
  if (!board) return { status: 'error', messageKey: 'errors.planNotFound' };

  let outcome: ReviewOutcome;

  try {
    outcome = await runReview(board);
  } catch (error) {
    if (error instanceof LlmNotConfiguredError) {
      return { status: 'error', messageKey: 'errors.notConfigured' };
    }

    console.error('[weekly-plans] review failed', error);

    return {
      status: 'error',
      messageKey: 'errors.reviewFailed',
      detail: error instanceof Error ? error.message.slice(0, 300) : undefined,
    };
  }

  try {
    await saveReview({
      clinicId,
      planId: parsed.data.planId,
      model: outcome.model,
      verdict: outcome.review.verdict,
      summaryAr: outcome.review.summaryAr,
      findings: outcome.review.findings,
      checks: outcome.review.checks,
    });

    // The same audit table generation writes to, so what a week costs is one
    // query rather than two: `scope` is what tells the two kinds of call apart.
    await recordGeneration({
      clinicId,
      planId: parsed.data.planId,
      scope: 'review',
      instruction: null,
      model: outcome.model,
      promptTokens: outcome.usage.promptTokens,
      completionTokens: outcome.usage.completionTokens,
      durationMs: outcome.durationMs,
      status: 'ok',
    }).catch(() => {});
  } catch (error) {
    console.error('[weekly-plans] storing the review failed', error);
    return { status: 'error', messageKey: 'errors.unexpected' };
  }

  revalidateBoard(locale, board.clientId);
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

  /*
    Tell the client their plan is ready, on whatever device they registered.

    `after()` rather than an inline `await`, and the same reasoning the booking
    and requests features give for their WhatsApp notices: publishing must not
    wait on a push service, and it is not less published for a notification
    that did not go out. Everything inside is swallowed — `sendWebPush` already
    promises never to throw, and the try/catch covers the read above it.

    The plan is looked up rather than returned by `publishPlan`, which keeps
    that mutation's contract — and its tests — exactly as they were: a
    notification is not part of what publishing *is*.

    Keyed on the week (`planPushKey`), so the swap-a-dish-and-republish cycle a
    dietitian works through in a morning notifies once. Consent is checked by
    `sendWebPush` against the client's own `notify_plan_update` switch, which is
    the same flag the WhatsApp channel honours.
  */
  after(async () => {
    try {
      const target = await getPlanNotificationTarget(clinicId, parsed.data.planId);
      if (target) await notifyPlanPublished(target.clientId, target.weekStartDate as IsoDate);
    } catch (error) {
      console.error('[weekly-plans] push notice failed', error);
    }
  });

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

