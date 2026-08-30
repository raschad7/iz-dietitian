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

/**
 * What was typed into the client card, handed straight back when the save is
 * refused.
 *
 * ## Why the card cannot just keep them
 *
 * ⚠ **React empties an uncontrolled form once its action returns.** That is
 * correct for the case it was designed for — a submission that worked, on a form
 * that is about to be used again — and it is exactly wrong for a rejected one:
 * somebody filled in a name and a number, forgot the date of birth, pressed
 * Save, and got back a blank card with five complaints on it. The two fields
 * they *had* answered were gone, so the fix for a missing field was to type
 * everything a second time.
 *
 * Since the reset cannot be argued with, the values are made to survive it: the
 * action echoes them here, the card seeds its fields from them, and the reset
 * restores each field to what the reader actually typed rather than to empty.
 *
 * Raw strings, exactly as the form posted them — this is what was typed, not
 * what parsed. A field the schema rejected is the one most worth handing back
 * intact, because it is the one being corrected.
 */
export type ClientFormEcho = {
  firstName: string;
  lastName: string;
  phone: string;
  dateOfBirth: string;
  sex: string;
};

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
      /** What was typed, so it survives React's reset — see {@link ClientFormEcho}. */
      values?: ClientFormEcho;
      /**
       * How many times this card has been refused, counted by the action from
       * the state it was handed.
       *
       * The card keys its fields on it. Two of them — the phone and the date —
       * are composite controls that hold their own value in React state and
       * seed it once, so a new default alone would not reach them; a changing
       * key remounts them and they seed from the echo instead. It has to be a
       * counter rather than the values themselves, or submitting the same
       * mistake twice would leave the key unchanged and the second refusal would
       * not restore anything.
       */
      attempt: number;
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

/**
 * The intake dialog's own state.
 *
 * Separate from {@link ClientFormState} rather than shared, for one reason:
 * `errors.clientNotFound`. The intake is opened against a client that already
 * exists, so "gone since this screen rendered" is a real outcome here and is not
 * one on the card, which creates as often as it edits.
 */
export type IntakeFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | {
      status: 'error';
      messageKey: 'errors.invalid' | 'errors.unexpected' | 'errors.clientNotFound';
      fieldErrors?: Record<string, string[] | undefined>;
    };

export type RevokePortalAccessState =
  | { status: 'idle' }
  | { status: 'error'; messageKey: 'errors.unexpected' }
  | { status: 'success'; messageKey: 'portal.revoked' };

export const initialFormState: ClientFormState = { status: 'idle' };
export const initialIntakeFormState: IntakeFormState = { status: 'idle' };
export const initialPortalCredentialsState: PortalCredentialsState = { status: 'idle' };
export const initialRevokePortalAccessState: RevokePortalAccessState = { status: 'idle' };
