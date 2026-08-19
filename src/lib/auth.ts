import { passkey } from '@better-auth/passkey';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { username } from 'better-auth/plugins';

import { db } from '@/db';
import { account, passkey as passkeyTable, session, user, verification } from '@/db/schema/auth';
import { clinics } from '@/db/schema/clinics';
import { clinicWorkingHours } from '@/db/schema/clinic-working-hours';
import { CLIENT_MIN_PASSWORD_LENGTH } from '@/features/auth/password-policy';
import { defaultClinicScheduleRows } from '@/features/clinic-profile/default-schedule';
import { defaultLocale, locales, type Locale } from '@/i18n/routing';
import { sendMail } from '@/lib/mail';

import {
  EMAIL_VERIFICATION_TTL_SECONDS,
  PASSWORD_RESET_TTL_SECONDS,
  SESSION_REFRESH_AGE_SECONDS,
  SESSION_TTL_SECONDS,
} from './auth-constants';
import { resolveAuthBaseURL, shouldUseSecureAuthCookies } from './auth-url';

export type UserRole = 'staff' | 'client';

/**
 * The email-verification gate, OFF for now.
 *
 * Turned off deliberately and temporarily: sign-up signs the practitioner
 * straight in, and nothing in the app asks them to confirm an address. The
 * whole flow — mail template, `/verify-email` route, resend form, unverified
 * purge — is left in place and wired to this one constant, so flipping it back
 * to `true` restores the gate with no other edit.
 *
 * What the gate buys when it is on, and why it is worth turning back on:
 *
 *  - Nobody can register with an address they do not own, which is how an
 *    attacker would otherwise squat on a real dietitian's email before that
 *    person signs up.
 *  - Password reset only ever mails a link to an address someone has proven
 *    they can read.
 *  - Better Auth refuses to link a Google identity into an unverified local
 *    account, so squatted addresses would block their real owner — see
 *    `purgeUnverifiedAccounts`, which sweeps them after 24 hours.
 *
 * TURNING IT BACK ON REQUIRES A WORKING MAIL TRANSPORT. With
 * `MAIL_TRANSPORT=console` the link is printed to the server console instead of
 * being sent, which is fine for local work — copy it out of the terminal — but
 * would lock out every account a deployment created. Set
 * `MAIL_TRANSPORT=resend` outside development; see `.env.example`.
 *
 * Typed as `boolean` rather than left to infer the literal, so the branches
 * that read it stay live code under the type checker instead of collapsing into
 * unreachable ones that rot while the gate is off.
 *
 * Read by the two settings below, by `requireStaffSession` in
 * `src/lib/session.ts`, and by `signUpStaff` in `src/features/auth/actions.ts`.
 */
export const REQUIRE_EMAIL_VERIFICATION: boolean = false;

/**
 * Whether Google sign-in is configured on this deployment.
 *
 * Read by the sign-in page to decide whether to offer the button, and by the
 * config below to decide whether to register the provider — one source of truth,
 * so the UI can never advertise a door that does not open.
 */
export const isGoogleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

/**
 * Every verification and reset link in an inbox is built from this, so it is
 * resolved once, validated, and shared — see `resolveAuthBaseURL`.
 */
const authBaseURL = resolveAuthBaseURL(process.env.BETTER_AUTH_URL, process.env.APP_URL);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Copy .env.example to .env.local and fill it in.`);
  }
  return value;
}

/**
 * Reads the locale the request was made in, so a session remembers which
 * language the person signed in with.
 */
function resolveRequestLocale(headers: Headers | undefined): Locale {
  const cookieHeader = headers?.get('cookie');
  const match = cookieHeader?.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/);
  const candidate = match?.[1];
  return locales.includes(candidate as Locale) ? (candidate as Locale) : defaultLocale;
}

/**
 * The locale a mail should be written in. Better Auth hands us the user row, and
 * `users.locale` is exactly the preference captured at sign-up.
 */
function userLocale(value: unknown): Locale {
  return locales.includes(value as Locale) ? (value as Locale) : defaultLocale;
}

export const auth = betterAuth({
  appName: 'dietitian-software',
  baseURL: authBaseURL,
  secret: requireEnv('BETTER_AUTH_SECRET'),

  database: drizzleAdapter(db, {
    provider: 'pg',
    // Better Auth's model names on the left, our Drizzle tables on the right.
    schema: { user, session, account, verification, passkey: passkeyTable },
  }),

  /**
   * Dietitian and staff accounts sign up here. Client accounts never do — but
   * they DO hold a password, issued by their dietitian and then replaced by one
   * of their own, both written directly by
   * `src/features/clients/portal-credentials.ts`.
   *
   * Both of these follow `REQUIRE_EMAIL_VERIFICATION` above, and are deliberately
   * each other's inverse. With the gate ON, signing up creates the account but
   * issues no session, so an address must be proven real before it can hold a
   * clinic. With it OFF there is nothing to wait for, so sign-up signs in — an
   * account that cannot be verified and cannot be signed into would just be
   * unreachable.
   */
  emailAndPassword: {
    enabled: true,
    /**
     * The CLIENT minimum. Better Auth has one global value, so this is the floor
     * for everyone; the staff minimum of 10 is enforced in the staff Zod schema
     * (`src/features/auth/schema.ts`). Do not raise this back to 10 — it would
     * lock every client out of setting their own password.
     */
    minPasswordLength: CLIENT_MIN_PASSWORD_LENGTH,
    requireEmailVerification: REQUIRE_EMAIL_VERIFICATION,
    autoSignIn: !REQUIRE_EMAIL_VERIFICATION,
    resetPasswordTokenExpiresIn: PASSWORD_RESET_TTL_SECONDS,
    sendResetPassword: async ({ user: recipient, url }) => {
      // Better Auth types this callback's `user` against the base row, not this
      // instance's `additionalFields`, so `locale` is invisible to TS even
      // though it is always present on the row at runtime.
      const locale = (recipient as { locale?: unknown }).locale;
      await sendMail('resetPassword', recipient.email, userLocale(locale), {
        url,
        name: recipient.name,
      });
    },
    /**
     * A reset is what someone does when they believe another person holds their
     * password. Leaving that person's sessions alive would defeat the point.
     *
     * Better Auth does this itself when the flag is set — see
     * `dist/api/routes/password.mjs`, which calls
     * `internalAdapter.deleteUserSessions(userId)` right after the reset. Do not
     * hand-roll it: `auth.api.revokeUserSessions` does NOT exist in the base API
     * (it ships with the admin plugin), and a custom `onPasswordReset` callback
     * that reaches for `auth` would reference the binding during its own
     * initialisation.
     */
    revokeSessionsOnPasswordReset: true,
  },

  emailVerification: {
    /**
     * OFF, and `signUpStaff` sends the link itself instead. This is not a
     * change of behaviour — the mail still goes out as part of sign-up — it is
     * a change of who can see it fail.
     *
     * Better Auth hands this send to `runInBackgroundOrAwait`
     * (`dist/context/create-context.mjs`), which awaits the promise inside a
     * `try/catch` and reduces any rejection to a `logger.error` line. Sign-up
     * then returns success regardless, so a deployment whose mail provider is
     * refusing every message shows each new practitioner a cheerful "check your
     * email" for a message that was never accepted. That is precisely how a
     * misconfigured `EMAIL_FROM` stayed invisible here.
     *
     * `auth.api.sendVerificationEmail` has no such wrapper
     * (`dist/api/routes/email-verification.mjs`), so calling it from the action
     * lets a rejection reach the person waiting on it.
     *
     * Both paths still land in the one `sendVerificationEmail` callback below,
     * so they cannot drift into sending different mail.
     */
    sendOnSignUp: false,

    /**
     * Opening the link signs them in, so the click that proves the address is
     * also the click that lands them in their clinic. Without this they would
     * verify, be told so, and then be asked to type the password they chose
     * ninety seconds ago — a pointless step at the exact moment they are
     * furthest from giving up.
     */
    autoSignInAfterVerification: true,
    expiresIn: EMAIL_VERIFICATION_TTL_SECONDS,
    sendVerificationEmail: async ({ user: recipient, url }) => {
      // Same typing gap as `sendResetPassword` above.
      const locale = (recipient as { locale?: unknown }).locale;
      await sendMail('verifyEmail', recipient.email, userLocale(locale), {
        url,
        name: recipient.name,
      });
    },
  },

  /**
   * Google is registered only when it is actually configured.
   *
   * Passing empty strings would register a provider that cannot work: the button
   * would render, and the failure would surface as an opaque error from Google's
   * consent screen rather than anything this app could explain. `isGoogleEnabled`
   * is what the sign-in page reads to decide whether to offer the button at all,
   * so the two can never disagree.
   */
  socialProviders: isGoogleEnabled
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID as string,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,

          /**
           * Signing IN and signing UP are different intents, even though Google
           * uses one button for both.
           *
           * Without this, any Google account that reached the sign-in page was
           * silently enrolled as staff with a clinic of its own — a patient who
           * clicked the wrong button became a practitioner. With it, the
           * sign-in page only admits accounts that already exist, and only the
           * sign-up page passes `requestSignUp: true` to create one.
           */
          disableImplicitSignUp: true,
        },
      }
    : {},

  account: {
    accountLinking: {
      enabled: true,
      /**
       * Google has verified the address it asserts, so an identity it vouches
       * for may join an existing account.
       */
      trustedProviders: ['google'],

      /**
       * DO NOT SET `requireLocalEmailVerified: false`.
       *
       * It defaults to true, and that default is what blocks OAuth
       * pre-hijacking: an attacker signs up with the victim's address and a
       * password of their choosing, never verifies, then waits for the victim to
       * sign in with Google — which would otherwise link the two and hand the
       * attacker a working password on the victim's account. Better Auth refuses
       * the link instead (`dist/oauth2/link-account.mjs`).
       *
       * The option is marked deprecated pending the gate becoming unconditional.
       * When it is removed, nothing needs doing here; until then, leaving it
       * unset is deliberate, not an oversight.
       */
    },
  },

  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        defaultValue: 'staff' satisfies UserRole,
        // Never settable from a sign-up payload — roles are assigned server side.
        input: false,
      },
      locale: {
        type: 'string',
        required: false,
        defaultValue: defaultLocale,
        input: false,
      },
      /**
       * Tenant boundary. Assigned by the `user.create.before` hook below, and
       * never accepted from a sign-up payload — otherwise anyone could post a
       * `clinicId` and join a clinic that is not theirs.
       */
      clinicId: {
        type: 'string',
        required: false,
        input: false,
      },
      /**
       * Set when a dietitian issues or re-issues credentials, cleared when the
       * client chooses their own. Never accepted from a payload.
       */
      mustChangePassword: {
        type: 'boolean',
        required: false,
        defaultValue: false,
        input: false,
      },
    },
  },

  session: {
    expiresIn: SESSION_TTL_SECONDS,
    updateAge: SESSION_REFRESH_AGE_SECONDS,
    additionalFields: {
      locale: {
        type: 'string',
        required: false,
        defaultValue: defaultLocale,
        input: false,
      },
    },
  },

  databaseHooks: {
    user: {
      create: {
        /**
         * Every staff sign-up creates its own clinic and joins it, which is what
         * makes each account a separate tenant.
         *
         * Client accounts never reach this hook — they are provisioned by
         * `issuePortalCredentials` in `src/features/clients/`, which inserts
         * directly through Drizzle — but the role is checked anyway so that
         * enabling any other Better Auth sign-up path later cannot silently
         * mint a clinic for someone who should never own one.
         */
        before: async (newUser) => {
          const role = 'role' in newUser ? newUser.role : undefined;
          if (role !== undefined && role !== 'staff') return { data: newUser };

          const clinicId = await db.transaction(async (tx) => {
            const [clinic] = await tx
              .insert(clinics)
              .values({ name: newUser.name })
              .returning({ id: clinics.id });

            if (!clinic) {
              throw new Error('could not create a clinic for the new staff account');
            }

            await tx.insert(clinicWorkingHours).values(defaultClinicScheduleRows(clinic.id));
            return clinic.id;
          });

          return { data: { ...newUser, clinicId } };
        },
      },
    },

    session: {
      create: {
        before: async (newSession, context) => ({
          data: {
            ...newSession,
            locale: resolveRequestLocale(context?.headers),
          },
        }),
      },
    },
  },

  advanced: {
    // Left at the Better Auth default prefix so `getSessionCookie` in
    // `src/middleware.ts` finds the cookie without extra configuration.
    // `bun start` is also used locally over plain HTTP. Basing this on
    // NODE_ENV alone makes that production-build workflow issue cookies the
    // browser cannot return. HTTPS deployments retain Secure automatically.
    useSecureCookies: shouldUseSecureAuthCookies(authBaseURL),
  },

  plugins: [
    /**
     * Portal sign-in for clients. They are issued a username and a temporary
     * password by their dietitian and never hold an email address here — see
     * `src/features/clients/portal-credentials.ts`.
     */
    username({
      minUsernameLength: 3,
      maxUsernameLength: 60,
      /**
       * The plugin's own default (`/^[a-zA-Z0-9_.]+$/`) rejects hyphens — but
       * `suggestUsername` (`src/features/clients/transliterate.ts`) joins
       * transliterated name parts with hyphens, and that suggestion is exactly
       * what a dietitian issues unedited most of the time. Without this override
       * every hyphenated username fails at `signInUsername`, which is checked
       * against the same validator, locking the client out of an account that
       * was just created for them. Matches `clients.errors.usernameInvalid`.
       */
      usernameValidator: (value) => /^[a-zA-Z0-9-]+$/.test(value),
    }),

    /**
     * WebAuthn. Registration and sign-in must run in the browser, so these are
     * the only auth paths that go over HTTP rather than through a server action
     * — which also means they are the only ones Better Auth's own rate limiter
     * actually covers.
     */
    passkey({
      rpID: new URL(authBaseURL).hostname,
      /*
       * What the OS puts in its own passkey prompt — "Save a passkey for
       * Enzyme" — and then beside the saved credential in the password
       * manager, so it is brand-facing and belongs to the product's name.
       *
       * Not localised, unlike everything under `src/i18n/messages`: the string
       * is stored with the credential at registration time, and this is a
       * server module with no request locale to read anyway. The brand name is
       * the same word in both languages, so there is nothing to choose between.
       *
       * Renaming it is safe for credentials already out there: a passkey is
       * bound to `rpID` (the hostname), never to `rpName`. Changing the
       * *hostname* would orphan every existing passkey; changing this only
       * changes what new prompts say.
       */
      rpName: 'Enzyme',
      origin: authBaseURL,
    }),

    // Must stay last: lets server actions set the session cookie.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
export type SessionUser = Session['user'];
