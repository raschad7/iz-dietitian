import { z } from 'zod';

import { signUpSchema } from './schema';

/**
 * Sign-up validation, in the page's own language.
 *
 * ## Why this exists
 *
 * The form used to rely on the browser: `required`, `minLength` and
 * `type="email"` on the inputs, with no `noValidate`, so pressing "إنشاء
 * الحساب" with a malformed address produced a native bubble reading *"Please
 * include an '@' in the email address."*
 *
 * That bubble is drawn by the browser in the **browser's** language, not the
 * page's. There is no way to translate it, restyle it, or move it — an Arabic
 * clinic on an English-locale Chrome gets an English sentence in a grey OS
 * tooltip, in the middle of a form that is otherwise entirely Arabic and
 * right-to-left. It also pre-empts the submit, so the server's own Arabic
 * messages — which have existed all along in `login.*` — never got a chance to
 * be shown for these cases.
 *
 * So the form turns native validation off and asks here instead. The messages
 * are the ones the server already returns, so the same mistake reads the same
 * whether it was caught before the request or after it.
 *
 * ## One schema, one set of message keys
 *
 * Both this and `signUpStaff` parse {@link signUpSchema}; neither restates what
 * a valid name or password is. The difference is only in shape — a form wants a
 * message per field, a server action returns one for the whole request — so the
 * per-field map is the primary result and {@link firstSignUpMessage} derives
 * the server's single answer from it, rather than the two hand-maintaining the
 * same four `if`s in the same order.
 */

export type SignUpField = 'firstName' | 'lastName' | 'email' | 'password' | 'confirmPassword';

export type SignUpMessageKey =
  | 'firstNameRequired'
  | 'lastNameRequired'
  | 'nameTooLong'
  | 'emailRequired'
  | 'passwordRequired'
  | 'confirmPasswordRequired'
  | 'invalidEmail'
  | 'passwordTooShort'
  /** A letter or a digit missing — the client rule staff now share. */
  | 'clientPasswordTooWeak'
  | 'passwordTooCommon'
  | 'passwordMismatch';

export type SignUpFieldErrors = Partial<Record<SignUpField, SignUpMessageKey>>;

/**
 * Which message each field's failure produces.
 *
 * `confirmPassword` is the odd one: its only rule is the cross-field `refine`
 * comparing it to `password`, so any issue on it means the two disagree.
 */
const MESSAGE_BY_FIELD = {
  firstName: 'firstNameRequired',
  lastName: 'lastNameRequired',
  email: 'invalidEmail',
  password: 'passwordTooShort',
  confirmPassword: 'passwordMismatch',
} as const satisfies Record<SignUpField, SignUpMessageKey>;

/**
 * The order the fields are reported in, which is the order they are read in.
 *
 * It is deliberately *not* the form's top-to-bottom order. `passwordMismatch`
 * is the most specific thing that can be wrong — it means both password boxes
 * were filled and simply disagree — so it is the most useful sentence to lead
 * with when several rules failed at once.
 */
const PRIORITY: readonly SignUpField[] = [
  'confirmPassword',
  'password',
  'email',
  'lastName',
  'firstName',
];

/**
 * An empty box is answered with "X is required", never with advice about what a
 * valid value looks like — "Enter a valid email address" under a box nobody has
 * typed in yet is telling someone off for a mistake they have not made.
 *
 * Only the fields whose ordinary message would be about *content* need an entry
 * here; the two name halves already say "required" either way.
 */
const REQUIRED_MESSAGE = {
  email: 'emailRequired',
  password: 'passwordRequired',
} as const satisfies Partial<Record<SignUpField, SignUpMessageKey>>;

/**
 * The keys `staffPasswordSchema` puts on its own issues, which are already
 * message keys. Anything else it might raise falls back to the length message.
 *
 * The same set `set-password-validation.ts` keeps, because since the staff rule
 * became the client rule the two screens parse the identical password schema —
 * see the note on `staffPasswordSchema`. `passwordTooWeak`, the old staff
 * sentence about symbols, is deliberately absent: nothing raises it any more,
 * and it describes a rule that is no longer enforced.
 */
const PASSWORD_ISSUE_KEYS = new Set<string>([
  'passwordTooShort',
  'clientPasswordTooWeak',
  'passwordTooCommon',
]);

export function readSignUpForm(formData: FormData) {
  return {
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    email: formData.get('email'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
    locale: formData.get('locale'),
  };
}

/**
 * The message a failing field reports.
 *
 * Two fields do not simply map to one sentence. An empty box gets the
 * "required" wording rather than advice about its contents, and the password
 * has three ways to be wrong — too short, missing a letter or a digit, or one
 * of the handful of values everybody picks — which call for three different
 * sentences, so its message is read straight off the issue
 * `staffPasswordSchema` raised rather than guessed at here.
 */
function messageFor(
  field: SignUpField,
  input: unknown,
  issues: readonly string[] | undefined,
): SignUpMessageKey {
  const required = field in REQUIRED_MESSAGE ? REQUIRED_MESSAGE[field as keyof typeof REQUIRED_MESSAGE] : undefined;
  if (required && isBlank(input, field)) return required;

  if (field === 'password') {
    const issue = issues?.[0];
    if (issue && PASSWORD_ISSUE_KEYS.has(issue)) return issue as SignUpMessageKey;
  }

  if ((field === 'firstName' || field === 'lastName') && !isBlank(input, field)) {
    return 'nameTooLong';
  }

  return MESSAGE_BY_FIELD[field];
}

function isBlank(input: unknown, field: SignUpField): boolean {
  const value = (input as Record<string, unknown> | null)?.[field];
  return typeof value !== 'string' || value.trim() === '';
}

/** Every field that failed, keyed by field. Empty means the form is valid. */
export function signUpFieldErrors(input: unknown): SignUpFieldErrors {
  const parsed = signUpSchema.safeParse(input);
  if (parsed.success) return {};

  const flattened = z.flattenError(parsed.error).fieldErrors;
  const errors: SignUpFieldErrors = {};

  for (const field of PRIORITY) {
    if (!flattened[field]?.length) continue;

    errors[field] = messageFor(field, input, flattened[field]);
  }

  /*
    An empty confirm box that Zod never complained about — the same gap
    `setPasswordFieldErrors` closes, and for the same reason.

    `signUpSchema` compares the two values and puts its issue on
    `confirmPassword`, so "" against a password of "" is not a mismatch and
    raises nothing at all: the form would report only that the password is too
    short and leave the second box unmarked. The comparison cannot say "you have
    not filled this in"; only this can.
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
 * own generic error — a sign-up form that says only "something went wrong" is
 * the most annoying kind, so this is the last resort rather than the default.
 */
export function firstSignUpMessage(errors: SignUpFieldErrors): SignUpMessageKey | undefined {
  for (const field of PRIORITY) {
    const message = errors[field];
    if (message) return message;
  }
  return undefined;
}
