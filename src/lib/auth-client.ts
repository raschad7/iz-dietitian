'use client';

import { passkeyClient } from '@better-auth/passkey/client';
import { inferAdditionalFields, usernameClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

import type { auth } from './auth';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? undefined,
  plugins: [
    usernameClient(),
    passkeyClient(),
    // Keeps `user.role` / `session.locale` typed on the client.
    inferAdditionalFields<typeof auth>(),
  ],
});

export const { signIn, signOut, signUp, useSession, getSession } = authClient;
