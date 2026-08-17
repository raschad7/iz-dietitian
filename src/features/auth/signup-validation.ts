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
  | 'invalidEmail'
  | 'passwordTooShort'
  | 'passwordTooWeak'
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
 * has two ways to be wrong — too short and too weak — which call for different
 * advice, so its message is read off the issue `staffPasswordSchema` raised.
 */
function messageFor(
  field: SignUpField,
  input: unknown,
  issues: readonly string[] | undefined,
): SignUpMessageKey {
  const required = field in REQUIRED_MESSAGE ? REQUIRED_MESSAGE[field as keyof typeof REQUIRED_MESSAGE] : undefined;
  if (required && isBlank(input, field)) return required;

  if (field === 'password' && issues?.[0] === 'passwordTooWeak') return 'passwordTooWeak';

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
