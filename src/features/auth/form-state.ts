/**
 * State shapes for the auth forms.
 *
 * These live outside `actions.ts` because a `"use server"` module may only
 * export async functions. Exporting a type is erased and would be harmless, but
 * the initial-value constants below are not — Next would replace them with
 * server references and `state.status` would read as `undefined` at runtime.
 */

export type AuthFormState =
  | { status: 'idle' }
  | {
      status: 'error';
      messageKey:
        | 'genericError'
        | 'emailTaken'
        | 'passwordMismatch'
        | 'passwordTooShort'
        /** Long enough, but still `aaaaaaaaaa` — see `isStrongStaffPassword`. */
        | 'passwordTooWeak'
        /** The client's narrower rule: a letter and a digit, both required. */
        | 'clientPasswordTooWeak'
        | 'firstNameRequired'
        | 'lastNameRequired'
        /** Either half of a name over `MAX_NAME_PART_LENGTH`. */
        | 'nameTooLong'
        | 'emailRequired'
        | 'passwordRequired'
        /** The confirm box left empty — its own sentence, not "they disagree". */
        | 'confirmPasswordRequired'
        | 'invalidEmail'
        | 'verifyEmailFirst'
        | 'accountNotLinked'
        /** Google sign-in by an account that has never signed up here. */
        | 'noGoogleAccount'
        /** Refusing to remove someone's only remaining way to sign in. */
        | 'lastSignInMethod'
        /** Vague on purpose — never reveals whether a portal username exists. */
        | 'wrongCredentials'
        /** The client minimum is only defensible alongside this check. */
        | 'passwordTooCommon'
        /** `changePassword`'s own proof of ownership failed. */
        | 'currentPasswordIncorrect'
        /** A "change" that keeps the same password is not one. */
        | 'passwordSameAsCurrent'
        /** The mail provider refused the message — ours to fix, not theirs. */
        | 'verificationEmailFailed';
    }
  | { status: 'rateLimited'; messageKey: 'rateLimited'; minutes: number }
  /**
   * `email` is carried so the "check your email" screen can show the address a
   * link was sent to and pre-fill its resend form. Absent on `resetLinkSent`,
   * whose whole point is to answer identically whether or not the address is
   * registered — echoing it back there would leak nothing on its own, but the
   * screen has no use for it either.
   */
  | {
      status: 'sent';
      messageKey: 'verificationSent' | 'resetLinkSent';
      email?: string;
      /**
       * The account exists but the mail provider refused the message, so the
       * "check your email" screen is still the right place to be — there is
       * nothing to correct on the sign-up form — but it must say so rather than
       * send someone to watch an inbox nothing is coming to. The resend button
       * is already on that screen, which is the only useful thing to do next.
       */
      deliveryFailed?: boolean;
    }
  | { status: 'success'; messageKey: 'passwordChanged' | 'passkeyRemoved' };

export const initialAuthState: AuthFormState = { status: 'idle' };
