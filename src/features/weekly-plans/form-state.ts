/**
 * Form and action state shapes, with their initial values.
 *
 * Separate from `actions.ts` because a `"use server"` module may only export async
 * functions — see the note at the top of `src/features/clients/form-state.ts`.
 */

/** Every way saving the nutrition profile can end. */
export type ProfileFormState =
  | { status: 'idle' }
  | { status: 'saved' }
  | {
      status: 'error';
      messageKey: 'errors.invalid' | 'errors.unexpected' | 'errors.clientNotFound';
      /** Shaped to match `z.flattenError`, so no cast is needed at either end. */
      fieldErrors?: Record<string, string[] | undefined>;
    };

export const initialProfileFormState: ProfileFormState = { status: 'idle' };

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
