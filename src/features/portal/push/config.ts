/**
 * Environment for Web Push, read and validated in one place.
 *
 * The posture is `src/features/whatsapp/config.ts`'s and the mail seam's: a
 * deployment that half-configures this fails loudly at first use rather than
 * silently dropping notifications. A client who switched notifications on and
 * never hears anything is a support call nobody can diagnose; an exception in
 * the log is a bug report.
 *
 * **There is no `PUSH_ENABLED` switch, unlike WhatsApp, and the absence is
 * deliberate.** WhatsApp needs one because a clinic can have a gateway running
 * and still not want it used. Push has no such state: the keypair is the whole
 * of the configuration, it is free to generate, and a deployment that has one
 * has decided. So the keys *are* the switch — with none set, every call here
 * returns `null`, `sendWebPush` skips, and the portal never offers the client a
 * control it cannot honour. A checkout with no VAPID keys behaves exactly as it
 * did before this feature existed.
 *
 * ## The keypair
 *
 * VAPID (RFC 8292) is how a push service knows which application server an
 * encrypted payload came from. The public half is handed to the browser at
 * subscribe time and is baked into the subscription the browser returns; the
 * private half signs every send.
 *
 * ⚠ **Rotating the keypair invalidates every existing subscription.** A
 * subscription is bound to the public key it was created with, so a new pair
 * means every stored row is dead — the push service answers 403, `sendWebPush`
 * leaves them in place (403 is not 410), and every client has to switch
 * notifications on again. Generate once per deployment and keep it:
 *
 * ```sh
 * bunx web-push generate-vapid-keys --json
 * ```
 *
 * The public key is `NEXT_PUBLIC_` because the browser genuinely needs it —
 * it is a public key, and publishing it is what it is for. The private key must
 * never carry that prefix.
 */

import { VAPID_PUBLIC_KEY } from './public-key';

export type WebPushConfig = {
  /** VAPID public key, base64url. The same value the browser subscribes with. */
  publicKey: string;
  /** VAPID private key, base64url. Signs every send; never reaches the client. */
  privateKey: string;
  /**
   * How a push service reaches whoever runs this deployment when something is
   * wrong with its traffic — `mailto:` or an `https:` origin, per RFC 8292 §2.1.
   * Not decoration: Firefox's service rejects a token without a usable subject.
   */
  subject: string;
};

/**
 * Re-exported so the server half has one import for the whole configuration.
 * It is declared in `public-key.ts`, which is the module a client component may
 * import — see the note there on why the two are separated.
 */
export { VAPID_PUBLIC_KEY };

/**
 * The subject falls back to the app's own origin, which every deployment
 * already sets for Better Auth's emailed links. A push service only ever uses
 * it to find a human, and this is a real one.
 */
function resolveSubject(): string | null {
  const explicit = process.env.VAPID_SUBJECT?.trim();
  if (explicit) return explicit;

  const origin = process.env.BETTER_AUTH_URL ?? process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;

  return origin ? origin.replace(/\/+$/, '') : null;
}

/**
 * Configured on one side only.
 *
 * A distinct error type for the same reason `WhatsappConfigError` is one: this
 * is not a bug and not a transient fault, it is a deployment half-finished, and
 * "try again" is advice that cannot work.
 */
export class WebPushConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebPushConfigError';
  }
}

/**
 * True when both halves of the keypair are present. Read this rather than the
 * raw variables, so "is push configured?" is decided once.
 */
export function isWebPushConfigured(): boolean {
  return Boolean(VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/**
 * The configuration, or `null` when no keypair is set.
 *
 * Not cached, for `whatsapp/config.ts`'s reason: `bun test` and the reminder
 * script both flip these between runs, and reading three `process.env` entries
 * costs nothing next to the HTTPS request that follows.
 *
 * Throws — rather than returning `null` — when exactly one half is set. That is
 * a typo or a half-copied `.env`, and it is the one case where staying quiet
 * would hide the mistake behind a feature that merely appears to be off.
 */
export function getWebPushConfig(): WebPushConfig | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();

  if (!publicKey && !privateKey) return null;

  if (!publicKey) {
    throw new WebPushConfigError(
      'VAPID_PRIVATE_KEY is set but NEXT_PUBLIC_VAPID_PUBLIC_KEY is not. Both halves of the keypair are needed. See .env.example.',
    );
  }

  if (!privateKey) {
    throw new WebPushConfigError(
      'NEXT_PUBLIC_VAPID_PUBLIC_KEY is set but VAPID_PRIVATE_KEY is not. Both halves of the keypair are needed. See .env.example.',
    );
  }

  const subject = resolveSubject();

  if (!subject) {
    throw new WebPushConfigError(
      'VAPID_SUBJECT is not set and no app origin (BETTER_AUTH_URL / APP_URL) could stand in for it. See .env.example.',
    );
  }

  return { publicKey, privateKey, subject };
}

/** For a call site that cannot proceed without it. */
export function requireWebPushConfig(): WebPushConfig {
  const config = getWebPushConfig();

  if (!config) {
    throw new WebPushConfigError(
      'Web Push is not configured. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY. See .env.example.',
    );
  }

  return config;
}
