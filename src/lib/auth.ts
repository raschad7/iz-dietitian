import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { magicLink } from 'better-auth/plugins';

import { db } from '@/db';
import { account, session, user, verification } from '@/db/schema/auth';
import { clinics } from '@/db/schema/clinics';
import { defaultLocale, locales, type Locale } from '@/i18n/routing';

import {
  MAGIC_LINK_TTL_MINUTES,
  MAGIC_LINK_TTL_SECONDS,
  MIN_PASSWORD_LENGTH,
  SESSION_REFRESH_AGE_SECONDS,
  SESSION_TTL_SECONDS,
} from './auth-constants';

export type UserRole = 'staff' | 'client';

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

export const auth = betterAuth({
  appName: 'dietitian-software',
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  secret: requireEnv('BETTER_AUTH_SECRET'),

  database: drizzleAdapter(db, {
    provider: 'pg',
    // Better Auth's model names on the left, our Drizzle tables on the right.
    schema: { user, session, account, verification },
  }),

  /** Dietitian and staff accounts. Client accounts never get a password. */
  emailAndPassword: {
    enabled: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    requireEmailVerification: false,
    autoSignIn: true,
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
        if (process.env.NODE_ENV === 'production') {
          // Wire a real transactional email provider here before going live.
          throw new Error('No email provider is configured for magic links.');
        }
        console.info(`[auth] magic link for ${email} (valid ${MAGIC_LINK_TTL_MINUTES} min):\n${url}`);
      },
    }),

    // Must stay last: lets server actions set the session cookie.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
export type SessionUser = Session['user'];
