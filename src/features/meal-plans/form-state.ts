/**
 * Form state shapes and their initial values.
 *
 * Separate from `actions.ts` because a `"use server"` module may only export
 * async functions — see the note at the top of `src/features/clients/form-state.ts`
 * for what happens when it does not.
 */

export type PlanFormState =
  | { status: 'idle' }
  | {
      status: 'error';
      messageKey: 'errors.invalid' | 'errors.unexpected' | 'errors.clientNotFound';
      /** Shaped to match `z.flattenError`, so no cast is needed at either end. */
      fieldErrors?: Record<string, string[] | undefined>;
    };

export const initialPlanFormState: PlanFormState = { status: 'idle' };
