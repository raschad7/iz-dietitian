import { emailSchema } from './schema';

/**
 * Sign-in validation, in the page's own language.
 *
 * The same reasoning as `signup-validation.ts`: the browser's `required` bubble
 * is drawn in the *browser's* locale and cannot be translated, restyled or
 * positioned, so an Arabic clinic on an English Chrome got an English tooltip
 * over a right-to-left form. The sign-in form turns native validation off and
 * asks here instead.
 *
 * Unlike sign-up there is no schema to reuse wholesale: `credentialsSchema`
 * cannot tell an empty field from a malformed one, and that distinction is the
 * whole point here — an empty box is answered with "Email is required", not
 * with advice about what a valid address looks like.
 */

export type LoginField = 'email' | 'password';

export type LoginMessageKey = 'emailRequired' | 'passwordRequired' | 'invalidEmail';

export type LoginFieldErrors = Partial<Record<LoginField, LoginMessageKey>>;

export function readLoginForm(formData: FormData) {
  return {
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
  };
}

/** Every field that failed, keyed by field. Empty means the form is valid. */
export function loginFieldErrors(input: { email: string; password: string }): LoginFieldErrors {
  const errors: LoginFieldErrors = {};

  if (input.email.trim() === '') {
    errors.email = 'emailRequired';
  } else if (!emailSchema.safeParse(input.email).success) {
    errors.email = 'invalidEmail';
  }

  if (input.password === '') errors.password = 'passwordRequired';

  return errors;
}

/**
 * The same two rules for the client portal, where the identifier is a username
 * issued by the clinic rather than an email address.
 *
 * Only emptiness is checked. `portalSignInSchema` also has a 3–60 character
 * range, but a client never chooses their own username — it is typed from a
 * card the dietitian handed them — so a length complaint would be describing a
 * mistake they cannot have made, and the sign-in attempt answers it anyway with
 * "Wrong username or password".
 */
export type PortalField = 'username' | 'password';

export type PortalMessageKey = 'usernameRequired' | 'passwordRequired';

export type PortalFieldErrors = Partial<Record<PortalField, PortalMessageKey>>;

export function readPortalForm(formData: FormData) {
  return {
    username: String(formData.get('username') ?? ''),
    password: String(formData.get('password') ?? ''),
  };
}

export function portalFieldErrors(input: { username: string; password: string }): PortalFieldErrors {
  const errors: PortalFieldErrors = {};

  if (input.username.trim() === '') errors.username = 'usernameRequired';
  if (input.password === '') errors.password = 'passwordRequired';

  return errors;
}
