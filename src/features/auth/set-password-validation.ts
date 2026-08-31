import { z } from 'zod';

import { setPasswordSchema } from './schema';

/**
 * Set-password validation, in the page's own language.
 *
 * ## Why this exists
 *
 * The same reason `signup-validation.ts` exists, and the note there is the long
 * version: the form used to lean on `required` and `minLength`, so a client who
 * pressed "حفظ ومتابعة" with a six-character password got a grey OS bubble in
 * **the browser's** language rather than the page's. On an Arabic portal opened
 * in an English-locale Chrome that is an English sentence in the middle of an
 * otherwise entirely Arabic, right-to-left screen — and it pre-empts the
 * submit, so the Arabic messages this app has always had never got their turn.
 *
 * So the form turns native validation off and asks here instead. The messages
 * are the ones `setPortalPassword` already returns, so the same mistake reads
 * the same whether it was caught before the request or after it.
 *
 * ## One schema, one set of message keys
 *
 * This parses {@link setPasswordSchema} — the very schema the server action
 * parses — rather than restating what a valid password is. The rules themselves
 * live one level further down again, in `password-policy.ts`, which is also
 * where the live checklist reads them from. Three surfaces, one rule.
 */

export type SetPasswordField = 'password' | 'confirmPassword';

export type SetPasswordMessageKey =
  | 'passwordRequired'
  | 'passwordTooShort'
  | 'clientPasswordTooWeak'
  | 'passwordTooCommon'
  | 'confirmPasswordRequired'
  | 'passwordMismatch';

export type SetPasswordFieldErrors = Partial<Record<SetPasswordField, SetPasswordMessageKey>>;

/**
 * The order the fields are reported in, which is the order they are read in.
 *
 * `confirmPassword` leads for the reason it leads in `signup-validation.ts`:
 * "the two do not match" means both boxes were filled and simply disagree,
 * which is the most specific thing that can be wrong and so the most useful
 * sentence to answer with when several rules failed at once.
 */
const PRIORITY: readonly SetPasswordField[] = ['confirmPassword', 'password'];

/**
 * What each field says when it is empty.
 *
 * An untouched box is answered with "required", never with advice about what a
 * good password looks like — "that password is too short" under a box nobody
 * has typed in is telling someone off for a mistake they have not made yet.
 */
const REQUIRED_MESSAGE = {
  password: 'passwordRequired',
  confirmPassword: 'confirmPasswordRequired',
} as const satisfies Record<SetPasswordField, SetPasswordMessageKey>;

/**
 * The keys `clientPasswordSchema` puts on its own issues, which are already
 * message keys. Anything else it might raise falls back to the length message.
 */
const PASSWORD_ISSUE_KEYS = new Set<string>([
  'passwordTooShort',
  'clientPasswordTooWeak',
  'passwordTooCommon',
]);

export function readSetPasswordForm(formData: FormData) {
  return {
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
    locale: formData.get('locale'),
  };
}

function isBlank(input: unknown, field: SetPasswordField): boolean {
  const value = (input as Record<string, unknown> | null)?.[field];
  return typeof value !== 'string' || value === '';
}

/**
 * The message a failing field reports.
 *
 * The password box has three ways to be wrong and they call for three different
 * sentences — too short, a single character class, or one of the handful of
 * values everybody picks — so its message is read straight off the issue
 * `clientPasswordSchema` raised rather than guessed at here.
 *
 * ⚠ A password is deliberately **not** trimmed before the blank test. Leading
 * or trailing spaces are legal in a password and are part of the value the
 * account was created with; treating "   " as empty here would reject a value
 * the server would then happily accept.
 */
function messageFor(
  field: SetPasswordField,
  input: unknown,
  issues: readonly string[] | undefined,
): SetPasswordMessageKey {
  if (isBlank(input, field)) return REQUIRED_MESSAGE[field];

  if (field === 'confirmPassword') return 'passwordMismatch';

  const issue = issues?.[0];
  if (issue && PASSWORD_ISSUE_KEYS.has(issue)) return issue as SetPasswordMessageKey;

  return 'passwordTooShort';
}

/** Every field that failed, keyed by field. Empty means the form is valid. */
export function setPasswordFieldErrors(input: unknown): SetPasswordFieldErrors {
  const parsed = setPasswordSchema.safeParse(input);
  if (parsed.success) return {};

  const flattened = z.flattenError(parsed.error).fieldErrors;
  const errors: SetPasswordFieldErrors = {};

  for (const field of PRIORITY) {
    if (!flattened[field]?.length) continue;

    errors[field] = messageFor(field, input, flattened[field]);
  }

  /*
    An empty confirm box that Zod never complained about.

    `setPasswordSchema` compares the two values and puts its issue on
    `confirmPassword`, so "" against a password of "" is not a mismatch and
    raises nothing at all — the whole form would report only that the password
    is too short, and the second box would sit there unmarked. The comparison
    cannot say "you have not filled this in"; only this can.
  */
  if (!errors.confirmPassword && isBlank(input, 'confirmPassword')) {
    errors.confirmPassword = 'confirmPasswordRequired';
  }

  return errors;
}

/**
 * The single message a server action returns, picked from the same map.
 *
 * `undefined` means nothing specific failed, which the caller reports as its
 * own generic error — the last resort rather than the default.
 */
export function firstSetPasswordMessage(
  errors: SetPasswordFieldErrors,
): SetPasswordMessageKey | undefined {
  for (const field of PRIORITY) {
    const message = errors[field];
    if (message) return message;
  }
  return undefined;
}
