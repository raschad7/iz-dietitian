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
import { shouldUseSecureAuthCookies } from './auth-url';

export type UserRole = 'staff' | 'client';

/**
 * The email-verification gate, currently OFF.
 *
 * Turned off because no mail transport is configured to deliver the link — with
 * `MAIL_TRANSPORT=console` the verification URL is printed to the server console
 * and never sent, so the gate locked out every account it created. Nothing about
 * the flow was removed: the templates, the `sendVerificationEmail` callback, the
 * resend action and the `verifyEmailFirst` message are all still here and still
 * wired up. Flipping this one constant back to `true` restores the gate exactly
 * as it was.
 *
 * Understand what is being traded before leaving it off in production:
 *
 *  - Anyone may register with an address they do not own, which is how an
 *    attacker squats on a real dietitian's email before that person signs up.
 *  - Password reset sends a link to an address nobody proved they can read.
 *  - `purgeUnverifiedAccounts` no longer has unverified accounts to clean up,
 *    because sign-up now issues a session immediately.
 *
 * Turn it back on as soon as `MAIL_TRANSPORT=resend` is working — see
 * `.env.example`.
 */
export const REQUIRE_EMAIL_VERIFICATION = false;

/**
 * Whether Google sign-in is configured on this deployment.
 *
 * Read by the sign-in page to decide whether to offer the button, and by the
 * config below to decide whether to register the provider — one source of truth,
 * so the UI can never advertise a door that does not open.
 */
export const isGoogleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

const authBaseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';

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
    // Only on sign-up does this follow the gate — sending a link nobody is
    // waiting for, over a transport that prints it to a console, is noise. The
    // `resendVerification` action still calls `sendVerificationEmail` directly,
    // so the path stays live and testable either way.
    sendOnSignUp: REQUIRE_EMAIL_VERIFICATION,
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
      rpName: 'Dietitian Clinic',
      origin: authBaseURL,
    }),

    // Must stay last: lets server actions set the session cookie.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
export type SessionUser = Session['user'];
