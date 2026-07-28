/**
 * Form state shapes and their initial values.
 *
 * These live here rather than in `actions.ts` because a `"use server"` module
 * may only export async functions. Exporting a plain object from one does not
 * fail the build — it fails at runtime, and confusingly: Next replaces the value
 * with a server reference, so `state.status` reads as `undefined`, the
 * `status === 'idle'` guard never fires, and the component renders an
 * undefined message key. Keep non-function exports out of action modules.
 */

export type ClientFormState =
  | { status: 'idle' }
  | {
      status: 'error';
      messageKey: 'errors.invalid' | 'errors.unexpected';
      /** Shaped to match `z.flattenError`, so no cast is needed at either end. */
      fieldErrors?: Record<string, string[] | undefined>;
    };

export type PortalActionState =
  | { status: 'idle' }
  | { status: 'error'; messageKey: 'errors.noEmail' | 'errors.emailTaken' | 'errors.unexpected' }
  | { status: 'success'; messageKey: 'portal.invited' | 'portal.revoked' };

export const initialFormState: ClientFormState = { status: 'idle' };
export const initialPortalState: PortalActionState = { status: 'idle' };
