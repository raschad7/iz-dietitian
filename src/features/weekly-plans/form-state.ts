/**
 * Form and action state shapes, with their initial values.
 *
 * Separate from `actions.ts` because a `"use server"` module may only export async
 * functions — see the note at the top of `src/features/clients/form-state.ts`.
 */

/**
 * Every way a generation can end.
 *
 * `partial` is a success, not a failure: the plan exists, some slots could not be
 * filled, and the dietitian needs to know how many without being told the whole
 * thing went wrong.
 */
export type GenerateState =
  | { status: 'idle' }
  | { status: 'done' }
  | { status: 'partial'; unfilled: number }
  | {
      status: 'error';
      messageKey:
        | 'errors.notConfigured'
        | 'errors.profileIncomplete'
        | 'errors.emptyCatalog'
        | 'errors.modelUnusable'
        | 'errors.unexpected'
        | 'errors.planNotFound';
      /** The provider's own words, when there are any worth showing. */
      detail?: string;
    };

export const initialGenerateState: GenerateState = { status: 'idle' };

/** Publishing, swapping and the other small mutations. */
export type PlanActionState =
  | { status: 'idle' }
  | { status: 'done' }
  | {
      status: 'error';
      messageKey:
        | 'errors.planNotFound'
        | 'errors.notDraft'
        | 'errors.unfilled'
        | 'errors.invalid'
        | 'errors.unexpected';
    };

export const initialPlanActionState: PlanActionState = { status: 'idle' };

/**
 * Starting a week without generating one.
 *
 * `profileIncomplete` is the same refusal the generate button gives. All three
 * doors into a plan build their slots from the client's schedule and target, so
 * none of them can run without a profile — a week whose slots have no budgets
 * cannot be checked against anything.
 *
 * There is no `done`: both actions redirect to the new plan, so the only states
 * this ever reaches the client in are `idle` and `error`.
 */
export type NewWeekState =
  | { status: 'idle' }
  | {
      status: 'error';
      messageKey:
        | 'errors.invalid'
        | 'errors.profileIncomplete'
        | 'errors.planNotFound'
        | 'errors.unexpected';
    };

export const initialNewWeekState: NewWeekState = { status: 'idle' };
