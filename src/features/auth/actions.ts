'use server';

import { APIError } from 'better-auth/api';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { replacePortalPassword } from '@/features/clients/portal-credentials';
import { auth, REQUIRE_EMAIL_VERIFICATION } from '@/lib/auth';
import { requireClientSession, requireStaffSession } from '@/lib/session';

import { purgeUnverifiedAccounts } from './cleanup';
import { type AuthFormState } from './form-state';
import { isCommonPassword } from './password-policy';
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
  portalSignInSchema,
  resetPasswordSchema,
  setPasswordSchema,
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
 * Creates a dietitian/staff account, and the clinic it owns.
 *
 * Sign-up is open by design: this is a SaaS, and any dietitian may register.
 * What makes that safe is not a gate on the door but what a new account can
 * actually do:
 *
 *  - Its clinic starts empty, and every query in the app is scoped by
 *    `clinic_id`. A stranger who signs up sees their own empty clinic, never
 *    anyone else's client records.
 *  - Registration is rate limited per IP, so the flow cannot be used to
 *    enumerate, flood, or mass-create.
 *
 * Whether it also holds a session depends on `REQUIRE_EMAIL_VERIFICATION` in
 * `src/lib/auth.ts`. With the gate on, sign-up issues none and this returns the
 * "check your inbox" state; with it off, `autoSignIn` has already set the cookie
 * by the time `signUpEmail` returns and the only sensible thing left to do is
 * send the new dietitian to their clinic.
 *
 * `role` is still forced to `staff` server-side and can never be posted — see
 * `input: false` in `src/lib/auth.ts`.
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

  // With the gate on there is no session yet and nothing to redirect to — the
  // form shows a "check your inbox" screen from this state.
  if (REQUIRE_EMAIL_VERIFICATION) {
    return { status: 'sent', messageKey: 'verificationSent' };
  }

  // Outside the try/catch — `redirect` signals by throwing. `/app` is where a
  // signed-in dietitian belongs; its layout sends them on to onboarding, which
  // a brand new clinic has not done yet.
  redirect(`/${locale}/app`);
}

/**
 * Portal sign-in for clients. Credentials are issued by a dietitian — see
 * `src/features/clients/portal-credentials.ts` — never signed up here.
 */
export async function signInToPortal(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = portalSignInSchema.safeParse({
    username: formData.get('username'),
    password: formData.get('password'),
    locale: formData.get('locale'),
  });

  if (!parsed.success) return { status: 'error', messageKey: 'genericError' };

  const { username, password, locale } = parsed.data;

  const limited = await guard('portal_sign_in', username);
  if (limited) return limited;

  try {
    await auth.api.signInUsername({ body: { username, password }, headers: await headers() });
  } catch {
    await penalise('portal_sign_in', username);
    // Vague on purpose: never reveal whether a portal username exists.
    return { status: 'error', messageKey: 'wrongCredentials' };
  }

  await clearAttempts('portal_sign_in', username);

  // Outside the try/catch — `redirect` signals by throwing.
  redirect(`/${locale}/portal`);
}

/**
 * The client replaces the temporary password they were handed. Clearing
 * `mustChangePassword` is what unlocks the rest of the portal — see the guard
 * in `src/app/[locale]/portal/(secured)/layout.tsx`.
 */
export async function setPortalPassword(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = setPasswordSchema.safeParse({
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
    locale: formData.get('locale'),
  });

  if (!parsed.success) {
    const fieldErrors = z.flattenError(parsed.error).fieldErrors;
    if (fieldErrors.confirmPassword) return { status: 'error', messageKey: 'passwordMismatch' };
    return { status: 'error', messageKey: 'passwordTooShort' };
  }

  const { password, locale } = parsed.data;

  // At six characters this check is load-bearing, not decoration — see
  // `src/features/auth/password-policy.ts`.
  if (isCommonPassword(password)) {
    return { status: 'error', messageKey: 'passwordTooCommon' };
  }

  const session = await requireClientSession(locale);

  try {
    await replacePortalPassword(session.user.id, password);
  } catch (error) {
    console.error('[auth] portal password change failed', error);
    return { status: 'error', messageKey: 'genericError' };
  }

  // Outside the try/catch — `redirect` signals by throwing.
  redirect(`/${locale}/portal`);
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
 * Google sign-in is deliberately NOT a server action.
 *
 * It ran here once, calling `auth.api.signInSocial` and redirecting to the URL
 * it returned. That put a Next.js server-action response in the middle of an
 * OAuth handshake that depends on a `state` cookie reaching the browser before
 * the redirect to Google and coming back with it — and the handshake failed with
 * `state_mismatch`.
 *
 * It now runs from the browser through `authClient.signIn.social`, which is the
 * path Better Auth is built around. See
 * `src/features/auth/components/google-button.tsx`.
 */

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
