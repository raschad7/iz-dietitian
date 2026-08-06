/** Used when neither `BETTER_AUTH_URL` nor `APP_URL` is set — i.e. `bun dev`. */
export const DEFAULT_AUTH_BASE_URL = 'http://localhost:3000';

/**
 * The origin every emailed link is built from.
 *
 * `BETTER_AUTH_URL` wins because it is the variable Better Auth documents and
 * the more specific of the two: a deployment that terminates auth on a
 * different host than it serves the app from needs to say so. `APP_URL` is the
 * fallback so a deployment that only sets the one origin still produces
 * verification and reset links that resolve — with neither set, Better Auth
 * would mint links pointing at localhost and every one of them would be dead
 * in the recipient's inbox.
 *
 * Blank strings are treated as unset. `.env` files make an empty value very
 * easy to produce (`APP_URL=`), and falling through to the next candidate is
 * always more useful than handing `new URL()` an empty string.
 *
 * The result is validated here rather than at first use, so a malformed origin
 * fails while the module is being evaluated instead of silently at the moment
 * someone is waiting for a link.
 */
export function resolveAuthBaseURL(betterAuthURL?: string, appURL?: string): string {
  const candidate = betterAuthURL?.trim() || appURL?.trim() || DEFAULT_AUTH_BASE_URL;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(
      `BETTER_AUTH_URL / APP_URL must be an absolute origin such as https://app.example.com — got "${candidate}".`,
    );
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`BETTER_AUTH_URL / APP_URL must be http or https — got "${candidate}".`);
  }

  // Better Auth appends its own paths, so a trailing slash would produce `//api`.
  return parsed.origin;
}

/** Whether Better Auth cookies require a secure transport. */
export function shouldUseSecureAuthCookies(baseURL: string): boolean {
  return new URL(baseURL).protocol === 'https:';
}
