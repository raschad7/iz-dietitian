'use server';

import { APIError } from 'better-auth/api';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { auth } from '@/lib/auth';
import { requireStaffSession } from '@/lib/session';

import { purgeUnverifiedAccounts } from './cleanup';
import { type AuthFormState } from './form-state';
import {
  checkRateLimit,
  clearAttempts,
  readClientIp,
  recordAttempt,
  type AttemptKind,
} from './rate-limit';
import { resolveSafeRedirect } from './redirect';
import {
  credentialsSchema,
  forgotPasswordSchema,
  localeSchema,
  magicLinkSchema,
  resetPasswordSchema,
  signUpSchema,
} from './schema';

/**
 * Auth is reached through server actions, like everything else in this app —
 * there is no REST or tRPC layer. `messageKey` is a key inside the `login`
 * namespace so the UI stays translatable.
 */

/**
 * Every action below re-checks the limit before acting and records a failure
 * after. A server action is a public endpoint: the page guard protects the
 * render, never the mutation.
 */
async function guard(kind: AttemptKind, email: string | null): Promise<AuthFormState | null> {
  const ipAddress = readClientIp(await headers());
  const result = await checkRateLimit(kind, { email, ipAddress });

  if (result.allowed) return null;

  return { status: 'rateLimited', messageKey: 'rateLimited', minutes: result.retryInMinutes };
}

async function penalise(kind: AttemptKind, email: string | null): Promise<void> {
  await recordAttempt(kind, { email, ipAddress: readClientIp(await headers()) });
}

export async function signInWithPassword(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    locale: formData.get('locale'),
    redirectTo: formData.get('redirectTo'),
  });

  if (!parsed.success) {
    return { status: 'error', messageKey: 'genericError' };
  }

  const { email, password, locale, redirectTo } = parsed.data;

  const limited = await guard('sign_in', email);
  if (limited) return limited;

  try {
    await auth.api.signInEmail({ body: { email, password }, headers: await headers() });
  } catch (error) {
    await penalise('sign_in', email);

    /**
     * The one case worth distinguishing. Better Auth refuses an unverified
     * account with FORBIDDEN; telling that person "wrong email or password"
     * would send them to the reset flow, which cannot help them. Everything
     * else stays deliberately vague so the response never reveals whether an
     * address is registered.
     */
    if (error instanceof APIError && error.status === 'FORBIDDEN') {
      return { status: 'error', messageKey: 'verifyEmailFirst' };
    }

    return { status: 'error', messageKey: 'genericError' };
  }

  await clearAttempts('sign_in', email);

  // Outside the try/catch — `redirect` signals by throwing.
  redirect(resolveSafeRedirect(redirectTo, locale, 'staff'));
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

  const { name, email, password } = parsed.data;

  const limited = await guard('sign_up', null);
  if (limited) return limited;

  // Housekeeping rides along with sign-up rather than a scheduler. It also frees
  // an address squatted by an unverified account, which would otherwise block
  // its real owner from signing in with Google.
  await purgeUnverifiedAccounts().catch((error: unknown) => {
    console.error('[auth] unverified-account purge failed', error);
  });

  try {
    await auth.api.signUpEmail({
      body: { name, email, password },
      headers: await headers(),
    });
  } catch (error) {
    await penalise('sign_up', null);

    // Unlike sign-in, being specific here is fine: the address was just offered
    // by whoever is sitting at the form, so "already registered" leaks nothing
    // they did not already type.
    if (error instanceof APIError && error.status === 'UNPROCESSABLE_ENTITY') {
      return { status: 'error', messageKey: 'emailTaken' };
    }

    console.error('[auth] staff sign-up failed', error);
    return { status: 'error', messageKey: 'genericError' };
  }

  // No redirect and no session: `autoSignIn` is off and verification is
  // required. The form shows a "check your inbox" screen from this state.
  return { status: 'sent', messageKey: 'verificationSent' };
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

  const limited = await guard('magic_link', email);
  if (limited) return limited;

  await penalise('magic_link', email);

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

export async function resendVerification(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get('email'),
    locale: formData.get('locale'),
  });

  if (!parsed.success) return { status: 'error', messageKey: 'genericError' };

  const { email, locale } = parsed.data;

  const limited = await guard('verification_resend', email);
  if (limited) return limited;

  await penalise('verification_resend', email);

  try {
    await auth.api.sendVerificationEmail({
      body: { email, callbackURL: `/${locale}/app` },
      headers: await headers(),
    });
  } catch (error) {
    // Swallowed: the response must not depend on whether the address exists.
    console.error('[auth] verification resend failed', error);
  }

  return { status: 'sent', messageKey: 'verificationSent' };
}

export async function requestPasswordReset(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get('email'),
    locale: formData.get('locale'),
  });

  if (!parsed.success) return { status: 'error', messageKey: 'genericError' };

  const { email, locale } = parsed.data;

  const limited = await guard('password_reset', email);
  if (limited) return limited;

  await penalise('password_reset', email);

  try {
    await auth.api.requestPasswordReset({
      body: { email, redirectTo: `/${locale}/reset-password` },
      headers: await headers(),
    });
  } catch (error) {
    // Swallowed on purpose — same reason as the magic link.
    console.error('[auth] password reset request failed', error);
  }

  // Always the same answer, whether or not the address is registered.
  return { status: 'sent', messageKey: 'resetLinkSent' };
}

export async function resetPassword(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get('token'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
    locale: formData.get('locale'),
  });

  if (!parsed.success) {
    const fieldErrors = z.flattenError(parsed.error).fieldErrors;
    if (fieldErrors.confirmPassword) return { status: 'error', messageKey: 'passwordMismatch' };
    if (fieldErrors.password) return { status: 'error', messageKey: 'passwordTooShort' };
    return { status: 'error', messageKey: 'genericError' };
  }

  const { token, password, locale } = parsed.data;

  try {
    await auth.api.resetPassword({ body: { token, newPassword: password }, headers: await headers() });
  } catch (error) {
    console.error('[auth] password reset failed', error);
    return { status: 'error', messageKey: 'genericError' };
  }

  redirect(`/${locale}/login`);
}

/**
 * Starts the Google flow. Kept as a server action rather than a client-side
 * `signIn.social` call so the entry point sits in the same layer as everything
 * else and is rate limited by the same mechanism.
 *
 * The limit is not decorative. `signInSocial` writes an OAuth state row per
 * call, and because this reaches `auth.api` directly it bypasses Better Auth's
 * own limiter exactly like every other action here — so without this guard it is
 * an unbounded write endpoint.
 *
 * It shares the `sign_in` IP budget rather than having its own: both are the
 * same person trying to get through the same door, and counting them separately
 * would let an attacker spend twice.
 *
 * This action returns `void` because it is a plain form action, not a
 * `useActionState` one — so a refusal reports itself through the URL, and the
 * sign-in page renders `?error=rateLimited`.
 */
export async function signInWithGoogle(formData: FormData): Promise<void> {
  const locale = localeSchema.parse(formData.get('locale'));

  const ipAddress = readClientIp(await headers());
  const limit = await checkRateLimit('sign_in', { email: null, ipAddress });

  if (!limit.allowed) {
    await recordAttempt('sign_in', { email: null, ipAddress });
    redirect(`/${locale}/login?error=rateLimited`);
  }

  const { url } = await auth.api.signInSocial({
    body: { provider: 'google', callbackURL: `/${locale}/app` },
    headers: await headers(),
  });

  if (!url) throw new Error('Google sign-in did not return a consent URL');

  redirect(url);
}

/**
 * Removing a passkey is refused when it is the only way into the account.
 *
 * Without this the page offers a two-click path to permanent lockout: a
 * passkey-only account whose passkey is deleted has no password, no linked
 * provider, and — with no email flow able to prove ownership of an account that
 * cannot be signed into — no way back.
 */
export async function removePasskeyAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const locale = localeSchema.parse(formData.get('locale'));

  // A server action is a public endpoint: the page guard protected the render,
  // never this call.
  await requireStaffSession(locale);

  const id = z.string().min(1).parse(formData.get('passkeyId'));

  const requestHeaders = await headers();

  const [passkeys, accounts] = await Promise.all([
    auth.api.listPasskeys({ headers: requestHeaders }),
    auth.api.listUserAccounts({ headers: requestHeaders }),
  ]);

  const otherMethods = accounts.length + passkeys.length - 1;

  if (otherMethods < 1) {
    return { status: 'error', messageKey: 'lastSignInMethod' };
  }

  await auth.api.deletePasskey({ body: { id }, headers: await headers() });

  revalidatePath(`/${locale}/app/settings/security`);

  return { status: 'success', messageKey: 'passkeyRemoved' };
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
