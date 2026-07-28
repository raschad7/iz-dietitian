import { toNextJsHandler } from 'better-auth/next-js';

import { auth } from '@/lib/auth';

/**
 * The only HTTP endpoint in the app. Better Auth owns it (sign-in, sign-out,
 * magic-link verification, session refresh); everything else in the codebase
 * goes through server actions.
 */
export const { GET, POST } = toNextJsHandler(auth.handler);
