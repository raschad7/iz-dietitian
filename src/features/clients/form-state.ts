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
  /**
   * Saved an existing client. Creating still redirects to the new record, but
   * an edit happens in a card over the screen the reader is already on, and
   * navigating them away from it to prove the save worked is a worse answer
   * than closing the card and refreshing what is underneath.
   */
  | { status: 'success' }
  | {
      status: 'error';
      messageKey: 'errors.invalid' | 'errors.unexpected';
      /** Shaped to match `z.flattenError`, so no cast is needed at either end. */
      fieldErrors?: Record<string, string[] | undefined>;
    };

/**
 * Issuing and re-issuing both hand back a temporary password that is shown
 * exactly once — the caller never gets a second chance to read it, so it rides
 * in the state returned to the form rather than anywhere it could be re-fetched.
 */
export type PortalCredentialsState =
  | { status: 'idle' }
  | { status: 'error'; messageKey: 'errors.usernameTaken' | 'errors.usernameInvalid' | 'errors.unexpected' }
  | {
      status: 'issued';
      username: string;
      temporaryPassword: string;
      /**
       * Whether the credentials also went out over WhatsApp, when staff asked for
       * that. `undefined` means they did not ask.
       *
       * Reported separately from `status` on purpose: the account exists either
       * way, and a WhatsApp send that failed must not read as "issuing failed" —
       * the password on screen is real and still has to be handed over.
       */
      whatsapp?: 'sent' | 'skipped' | 'failed';
    };

export type RevokePortalAccessState =
  | { status: 'idle' }
  | { status: 'error'; messageKey: 'errors.unexpected' }
  | { status: 'success'; messageKey: 'portal.revoked' };

export const initialFormState: ClientFormState = { status: 'idle' };
export const initialPortalCredentialsState: PortalCredentialsState = { status: 'idle' };
export const initialRevokePortalAccessState: RevokePortalAccessState = { status: 'idle' };
