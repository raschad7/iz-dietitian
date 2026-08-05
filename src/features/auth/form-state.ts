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
        | 'nameRequired'
        | 'invalidEmail'
        | 'verifyEmailFirst'
        | 'accountNotLinked'
        /** Google sign-in by an account that has never signed up here. */
        | 'noGoogleAccount'
        /** Refusing to remove someone's only remaining way to sign in. */
        | 'lastSignInMethod'
        /** Vague on purpose — never reveals whether a portal username exists. */
        | 'wrongCredentials'
        /** The six-character client minimum is only defensible with this check. */
        | 'passwordTooCommon'
        /** `changePassword`'s own proof of ownership failed. */
        | 'currentPasswordIncorrect'
        /** A "change" that keeps the same password is not one. */
        | 'passwordSameAsCurrent';
    }
  | { status: 'rateLimited'; messageKey: 'rateLimited'; minutes: number }
  | { status: 'sent'; messageKey: 'verificationSent' | 'resetLinkSent' }
  | { status: 'success'; messageKey: 'passwordChanged' | 'passkeyRemoved' };

export const initialAuthState: AuthFormState = { status: 'idle' };
