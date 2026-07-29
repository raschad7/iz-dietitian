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
        | 'accountNotLinked';
    }
  | { status: 'rateLimited'; messageKey: 'rateLimited'; minutes: number }
  | { status: 'sent'; messageKey: 'magicLinkSent' | 'verificationSent' | 'resetLinkSent' }
  | { status: 'success'; messageKey: 'passwordChanged' };

export const initialAuthState: AuthFormState = { status: 'idle' };
