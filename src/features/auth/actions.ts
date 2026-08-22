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
import {
  checkRateLimit,
  clearAttempts,
  readClientIp,
  recordAttempt,
  type AttemptKind,
} from './rate-limit';
import { resolveSafeRedirect } from './redirect';
import { firstSignUpMessage, readSignUpForm, signUpFieldErrors } from './signup-validation';
import {
  changePasswordSchema,
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
 * What happens at the end of it follows `REQUIRE_EMAIL_VERIFICATION`. With the
 * gate ON it issues no session — the account exists but cannot be signed into
 * until the mailed link is opened — so it returns the "check your email" state
 * rather than redirecting anywhere. With the gate OFF (where it stands today)
 * `autoSignIn` has already issued the session, so it goes straight to the app.
 *
 * `role` is still forced to `staff` server-side and can never be posted — see
 * `input: false` in `src/lib/auth.ts`.
 */
export async function signUpStaff(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const raw = readSignUpForm(formData);
  const parsed = signUpSchema.safeParse(raw);

  if (!parsed.success) {
    // Map the first failing field to a specific message — a sign-up form that
    // says only "something went wrong" is the most annoying kind. The order and
    // the wording live in `signup-validation.ts`, which the form itself uses to
    // catch the same mistakes before the request; keeping one copy is what
    // stops the two from disagreeing about what is wrong.
    const messageKey = firstSignUpMessage(signUpFieldErrors(raw));

    return messageKey
      ? { status: 'error', messageKey }
      : { status: 'error', messageKey: 'genericError' };
  }

  const { firstName, lastName, email, password, locale } = parsed.data;

  /*
   * The form asks for the two halves separately — they are what a person is
   * asked for on paper, and each has its own length limit — but Better Auth and
   * every screen that greets a practitioner want one `name`. Joining here keeps
   * the split a property of the form rather than of the account.
   */
  const name = `${firstName} ${lastName}`;

  const limited = await guard('sign_up', null);
  if (limited) return limited;

  /**
   * Housekeeping rides along with sign-up rather than a scheduler. It also frees
   * an address squatted by an unverified account, which would otherwise block
   * its real owner from signing in with Google.
   *
   * GATED, and this gate is load-bearing rather than tidiness. The purge deletes
   * staff accounts that are still unverified after a day. With the verification
   * gate off, every account is legitimately unverified forever — running the
   * sweep would delete real practitioners and their clinics roughly a day after
   * they signed up.
   */
  if (REQUIRE_EMAIL_VERIFICATION) {
    await purgeUnverifiedAccounts().catch((error: unknown) => {
      console.error('[auth] unverified-account purge failed', error);
    });
  }

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

  /**
   * Gate off: `autoSignIn` is its inverse, so the session already exists and
   * there is nothing to confirm. Straight into the clinic, which is where the
   * verification link would have landed them anyway — the app layout forwards a
   * brand new clinic on to onboarding from there.
   *
   * Outside any try/catch, because `redirect` signals by throwing.
   */
  if (!REQUIRE_EMAIL_VERIFICATION) {
    redirect(`/${locale}/app`);
  }

  /**
   * The link is sent from here rather than by `sendOnSignUp`, so that a mail
   * provider refusing the message reaches the person waiting for it instead of
   * a log line nobody is reading — see `sendOnSignUp` in `src/lib/auth.ts`.
   *
   * A failure here is never the practitioner's fault: the account exists, the
   * address is fine, and our transport is the thing that is broken. So it does
   * not undo the sign-up — it lands them on the same screen with the truth and
   * a resend button.
   */
  let deliveryFailed = false;

  try {
    await auth.api.sendVerificationEmail({
      /**
       * `callbackURL` is where the link lands once the token is accepted.
       * Sending them to `/app` rather than the sign-in page is what makes
       * `autoSignInAfterVerification` worth having: one click and they are
       * inside their clinic. The app layout forwards a brand new clinic on to
       * onboarding from there.
       */
      body: { email, callbackURL: `/${locale}/app` },
      headers: await headers(),
    });
  } catch (error) {
    console.error('[auth] verification email failed to send at sign-up', error);
    deliveryFailed = true;
  }

  /**
   * No session exists yet and there is nothing to redirect to — the form
   * renders the "check your email" screen from this state. The address rides
   * along so that screen can show it and pre-fill its resend form; it is the
   * one the person just typed, so echoing it back reveals nothing.
   */
  return { status: 'sent', messageKey: 'verificationSent', email, deliveryFailed };
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
/**
 * Which of the client password rules a value tripped.
 *
 * `clientPasswordSchema` puts the message key on the issue itself — too short,
 * too common, or long enough but a single character class — so the three keep
 * their own advice instead of collapsing into "too short", which is what a
 * client typing `aaaaaa` used to be told.
 */
function passwordIssueKey(
  issues: readonly string[] | undefined,
): 'passwordTooShort' | 'passwordTooCommon' | 'passwordTooWeak' {
  const issue = issues?.[0];
  if (issue === 'passwordTooCommon' || issue === 'passwordTooWeak') return issue;
  return 'passwordTooShort';
}

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
    // Whichever rule the value tripped: too short, or long enough but a single
    // character class — `clientPasswordSchema` carries the key on the issue.
    return { status: 'error', messageKey: passwordIssueKey(fieldErrors.password) };
  }

  const { password, locale } = parsed.data;

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

/**
 * The signed-in client changes their own password, in place.
 *
 * This is the in-app replacement for the reset-link flow that used to live on
 * the security screen: that flow mailed a link to `session.user.email`, which
 * for a portal client is a synthetic `@portal.invalid` address — see
 * `syntheticEmail` in `src/features/clients/portal-credentials.ts` — so it
 * could never actually be delivered. A signed-in session already proves
 * something; asking for the current password on top of it is what proves the
 * *person*, so `auth.api.changePassword` (which demands it) is the right
 * primitive here, unlike `setPortalPassword` above.
 *
 * `revokeOtherSessions` is left unset. A reset is what someone does when they
 * believe another person holds their password, which is worth signing
 * everyone out for — see `revokeSessionsOnPasswordReset` in `src/lib/auth.ts`.
 * A change made by someone who just typed their own current password
 * correctly is not that situation, and the task is explicit that the client
 * stays signed in.
 */
export async function changePortalPassword(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get('currentPassword'),
    newPassword: formData.get('newPassword'),
    confirmNewPassword: formData.get('confirmNewPassword'),
    locale: formData.get('locale'),
  });

  if (!parsed.success) {
    const fieldErrors = z.flattenError(parsed.error).fieldErrors;
    if (fieldErrors.confirmNewPassword) return { status: 'error', messageKey: 'passwordMismatch' };
    if (fieldErrors.newPassword) {
      return { status: 'error', messageKey: passwordIssueKey(fieldErrors.newPassword) };
    }
    return { status: 'error', messageKey: 'genericError' };
  }

  const { currentPassword, newPassword, locale } = parsed.data;

  if (newPassword === currentPassword) {
    return { status: 'error', messageKey: 'passwordSameAsCurrent' };
  }

  const session = await requireClientSession(locale);

  const limited = await guard('password_change', session.user.id);
  if (limited) return limited;

  try {
    await auth.api.changePassword({
      body: { currentPassword, newPassword },
      headers: await headers(),
    });
  } catch (error) {
    await penalise('password_change', session.user.id);

    if (error instanceof APIError && error.body?.code === 'INVALID_PASSWORD') {
      return { status: 'error', messageKey: 'currentPasswordIncorrect' };
    }

    console.error('[auth] portal password change failed', error);
    return { status: 'error', messageKey: 'genericError' };
  }

  await clearAttempts('password_change', session.user.id);

  return { status: 'success', messageKey: 'passwordChanged' };
}

/**
 * Re-sends the confirmation link, from the "check your email" screen.
 *
 * The mail rarely vanishes, but it does arrive slowly, land in spam, or expire
 * while someone is away from their desk — `EMAIL_VERIFICATION_TTL_SECONDS` is
 * an hour. Without this the only way out is to sign up again, which the taken
 * address now refuses.
 *
 * Rate limited per address and per IP, and — like the password-reset request —
 * it answers identically whether or not the address exists.
 */
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
    console.error('[auth] verification resend failed', error);

    /**
     * Which failure this was decides how much may be said.
     *
     * Better Auth raises `APIError` for the refusals that describe the
     * *account* — no such user, already verified — and reporting those would
     * turn this form into an address oracle. They stay swallowed behind the
     * same answer every other address gets.
     *
     * Anything else came out of the mail transport itself, which knows nothing
     * about whether the address is registered: the same Resend rejection
     * happens for an address that exists and one that does not. Saying so
     * leaks nothing and is the only way someone learns that waiting for the
     * mail is pointless.
     */
    if (!(error instanceof APIError)) {
      return { status: 'sent', messageKey: 'verificationSent', email, deliveryFailed: true };
    }
  }

  return { status: 'sent', messageKey: 'verificationSent', email };
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

  revalidatePath(`/${locale}/app/settings`);

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
