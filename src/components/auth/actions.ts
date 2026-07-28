'use server';

import { APIError } from 'better-auth/api';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { defaultLocale, locales } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth-constants';

/**
 * Auth is reached through server actions, like everything else in this app —
 * there is no REST or tRPC layer. `messageKey` is a key inside the `login`
 * namespace so the UI stays translatable.
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
        | 'invalidEmail';
    }
  | { status: 'sent'; messageKey: 'magicLinkSent' };

const localeSchema = z.enum(locales).catch(defaultLocale);

/**
 * Normalise as a plain string, THEN validate as an email.
 *
 * `z.email().trim()` does not work: in Zod 4 the format check is baked in at
 * construction, so it runs before the trim and rejects "  a@b.co " outright.
 */
const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

const credentialsSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
  locale: localeSchema,
});

const magicLinkSchema = z.object({
  email: emailSchema,
  locale: localeSchema,
});

const signUpSchema = z
  .object({
    name: z.string().trim().min(2),
    email: emailSchema,
    password: z.string().min(MIN_PASSWORD_LENGTH),
    confirmPassword: z.string(),
    locale: localeSchema,
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
  });

export async function signInWithPassword(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    locale: formData.get('locale'),
  });

  if (!parsed.success) {
    return { status: 'error', messageKey: 'genericError' };
  }

  const { email, password, locale } = parsed.data;

  try {
    await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
    });
  } catch {
    // Deliberately opaque: never reveal whether the address exists.
    return { status: 'error', messageKey: 'genericError' };
  }

  // Outside the try/catch — `redirect` signals by throwing.
  redirect(`/${locale}/app`);
}

/**
 * Creates a dietitian/staff account.
 *
 * ⚠️  THIS SIGN-UP IS OPEN TO ANYONE WHO CAN REACH THE PAGE. ⚠️
 *
 * `role` defaults to `staff`, and the staff area exposes every client's medical
 * notes, allergies and contact details. That is acceptable while this runs on a
 * developer's machine; it is NOT acceptable on any host reachable from the
 * internet. Gate this before deploying — an invite code checked here, or a
 * bootstrap rule that only allows sign-up while zero staff accounts exist.
 */
export async function signUpStaff(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const raw = {
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
    locale: formData.get('locale'),
  };

  const parsed = signUpSchema.safeParse(raw);

  if (!parsed.success) {
    // Map the first failing field to a specific message — a sign-up form that
    // says only "something went wrong" is the most annoying kind.
    const fieldErrors = z.flattenError(parsed.error).fieldErrors;

    if (fieldErrors.confirmPassword) return { status: 'error', messageKey: 'passwordMismatch' };
    if (fieldErrors.password) return { status: 'error', messageKey: 'passwordTooShort' };
    if (fieldErrors.email) return { status: 'error', messageKey: 'invalidEmail' };
    if (fieldErrors.name) return { status: 'error', messageKey: 'nameRequired' };

    return { status: 'error', messageKey: 'genericError' };
  }

  const { name, email, password, locale } = parsed.data;

  try {
    await auth.api.signUpEmail({
      body: { name, email, password },
      headers: await headers(),
    });
  } catch (error) {
    // Unlike sign-in, being specific here is fine: the address was just offered
    // by whoever is sitting at the form, so "already registered" leaks nothing
    // they did not already type.
    if (error instanceof APIError && error.status === 'UNPROCESSABLE_ENTITY') {
      return { status: 'error', messageKey: 'emailTaken' };
    }

    console.error('[auth] staff sign-up failed', error);
    return { status: 'error', messageKey: 'genericError' };
  }

  // `autoSignIn` is on, so the session cookie is already set by this point.
  redirect(`/${locale}/app`);
}

export async function requestMagicLink(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = magicLinkSchema.safeParse({
    email: formData.get('email'),
    locale: formData.get('locale'),
  });

  if (!parsed.success) {
    return { status: 'error', messageKey: 'genericError' };
  }

  const { email, locale } = parsed.data;

  try {
    await auth.api.signInMagicLink({
      body: { email, callbackURL: `/${locale}/portal` },
      headers: await headers(),
    });
  } catch {
    // Swallowed on purpose — the response must not depend on whether the
    // address is registered.
  }

  return { status: 'sent', messageKey: 'magicLinkSent' };
}

/** Ends the session and returns to the public landing page. */
export async function signOutAction(formData: FormData): Promise<void> {
  const locale = localeSchema.parse(formData.get('locale'));

  try {
    await auth.api.signOut({ headers: await headers() });
  } catch (error) {
    // An already-invalid session is not worth blocking the redirect over.
    console.error('[auth] sign-out failed', error);
  }

  redirect(`/${locale}`);
}
