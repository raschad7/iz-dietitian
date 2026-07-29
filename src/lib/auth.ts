import { passkey } from '@better-auth/passkey';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { magicLink } from 'better-auth/plugins';

import { db } from '@/db';
import { account, passkey as passkeyTable, session, user, verification } from '@/db/schema/auth';
import { clinics } from '@/db/schema/clinics';
import { defaultLocale, locales, type Locale } from '@/i18n/routing';
import { sendMail } from '@/lib/mail';

import {
  EMAIL_VERIFICATION_TTL_SECONDS,
  MAGIC_LINK_TTL_SECONDS,
  MIN_PASSWORD_LENGTH,
  PASSWORD_RESET_TTL_SECONDS,
  SESSION_REFRESH_AGE_SECONDS,
  SESSION_TTL_SECONDS,
} from './auth-constants';

export type UserRole = 'staff' | 'client';

/**
 * Whether Google sign-in is configured on this deployment.
 *
 * Read by the sign-in page to decide whether to offer the button, and by the
 * config below to decide whether to register the provider — one source of truth,
 * so the UI can never advertise a door that does not open.
 */
export const isGoogleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

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
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  secret: requireEnv('BETTER_AUTH_SECRET'),

  database: drizzleAdapter(db, {
    provider: 'pg',
    // Better Auth's model names on the left, our Drizzle tables on the right.
    schema: { user, session, account, verification, passkey: passkeyTable },
  }),

  /**
   * Dietitian and staff accounts. Client accounts never get a password.
   *
   * `autoSignIn` is OFF and `requireEmailVerification` is ON: signing up creates
   * the account but issues no session. That is the hard gate — an address must
   * be proven real before it can hold a clinic, and before a password reset
   * would have anywhere to go.
   */
  emailAndPassword: {
    enabled: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    requireEmailVerification: true,
    autoSignIn: false,
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
    sendOnSignUp: true,
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
         * `invitePortalAccess`, which inserts directly through Drizzle — but the
         * role is checked anyway so that enabling any other Better Auth sign-up
         * path later cannot silently mint clinics.
         */
        before: async (newUser) => {
          const role = 'role' in newUser ? newUser.role : undefined;
          if (role !== undefined && role !== 'staff') return { data: newUser };

          const [clinic] = await db
            .insert(clinics)
            .values({ name: newUser.name })
            .returning({ id: clinics.id });

          if (!clinic) {
            throw new Error('could not create a clinic for the new staff account');
          }

          return { data: { ...newUser, clinicId: clinic.id } };
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
    useSecureCookies: process.env.NODE_ENV === 'production',
  },

  plugins: [
    /**
     * Scaffolding for the client portal. Tokens live in the `verifications`
     * table, expire after 15 minutes and are deleted the first time they are
     * redeemed, at which point Better Auth issues the long-lived session cookie
     * configured above.
     *
     * `disableSignUp` keeps this from becoming a public self-registration door:
     * a client row must already exist before a link can be requested.
     */
    magicLink({
      expiresIn: MAGIC_LINK_TTL_SECONDS,
      disableSignUp: true,
      sendMagicLink: async ({ email, url }) => {
        // The recipient may not exist as a user yet, so the locale comes from the
        // client record where possible and falls back to the default.
        await sendMail('magicLink', email, defaultLocale, { url, name: email });
      },
    }),

    /**
     * WebAuthn. Registration and sign-in must run in the browser, so these are
     * the only auth paths that go over HTTP rather than through a server action
     * — which also means they are the only ones Better Auth's own rate limiter
     * actually covers.
     */
    passkey({
      rpID: new URL(process.env.BETTER_AUTH_URL ?? 'http://localhost:3000').hostname,
      rpName: 'Dietitian Clinic',
      origin: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
    }),

    // Must stay last: lets server actions set the session cookie.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
export type SessionUser = Session['user'];
