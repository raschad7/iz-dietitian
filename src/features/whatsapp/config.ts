/**
 * Environment for the WhatsApp gateway, read and validated in one place.
 *
 * The posture is the mail seam's (`src/lib/mail/index.ts`): a deployment that
 * turns WhatsApp **on** without configuring it fails loudly at first use rather
 * than silently dropping messages. A clinic that never sends an appointment
 * reminder is a support call nobody can diagnose; an exception in the log is a
 * bug report.
 *
 * `WHATSAPP_ENABLED` is the master switch and defaults to off, so a checkout
 * with no WhatsApp configuration behaves exactly as it did before this feature
 * existed: the settings page explains what to set, and nothing else changes.
 */

export type WhatsappConfig = {
  /** Base URL of the OpenWA gateway, no trailing slash. */
  apiUrl: string;
  /** Sent as `X-API-Key` on every gateway call. */
  apiKey: string;
  /** Shared secret the gateway signs webhook deliveries with (HMAC-SHA256). */
  webhookSecret: string;
  /**
   * Where the gateway should POST events. This app's public origin — which is
   * *not* necessarily `localhost:3000`: the gateway usually runs in a container,
   * and from inside one `localhost` is the container itself. See
   * `infra/openwa/README.md`.
   */
  webhookUrl: string;
  /**
   * Country code prepended to a local number that has none — `970` (Palestine)
   * by default, matching the clinic time zone in `src/lib/format.ts`. Digits, no
   * `+`.
   */
  defaultCountryCode: string;
  /**
   * How long to wait on the gateway. Starting a session boots a headless
   * Chromium there, so the ceiling is generous by HTTP standards; a send is
   * quick and is capped separately by the caller.
   */
  requestTimeoutMs: number;
};

const DEFAULT_API_URL = 'http://localhost:2785';
const DEFAULT_COUNTRY_CODE = '970';
const DEFAULT_TIMEOUT_MS = 30_000;

/** Path the webhook route is mounted at. One definition, used by both ends. */
export const WEBHOOK_PATH = '/api/whatsapp/webhook';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function missing(name: string): never {
  throw new Error(`WHATSAPP_ENABLED is true but ${name} is not set. See .env.example.`);
}

/**
 * The app's own public origin, as the gateway can reach it.
 *
 * `WHATSAPP_PUBLIC_URL` exists for the common local case where the gateway runs
 * in Docker and this app runs on the host: the gateway needs
 * `http://host.docker.internal:3000`, while the browser still needs
 * `http://localhost:3000`, so the two cannot share one variable.
 */
function resolvePublicUrl(): string {
  const explicit = process.env.WHATSAPP_PUBLIC_URL ?? process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL;

  if (!explicit) missing('WHATSAPP_PUBLIC_URL (or BETTER_AUTH_URL)');

  return trimTrailingSlash(explicit);
}

function readConfig(): WhatsappConfig {
  const apiKey = process.env.WHATSAPP_API_KEY;
  const webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET;

  if (!apiKey) missing('WHATSAPP_API_KEY');
  if (!webhookSecret) missing('WHATSAPP_WEBHOOK_SECRET');

  const countryCode = (process.env.WHATSAPP_DEFAULT_COUNTRY_CODE ?? DEFAULT_COUNTRY_CODE).replace(/\D/g, '');
  if (!countryCode) {
    throw new Error('WHATSAPP_DEFAULT_COUNTRY_CODE must be digits, e.g. 970. Leave it unset for the default.');
  }

  const timeout = Number(process.env.WHATSAPP_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  if (!Number.isFinite(timeout) || timeout < 1_000) {
    throw new Error('WHATSAPP_TIMEOUT_MS must be a number of milliseconds >= 1000.');
  }

  return {
    apiUrl: trimTrailingSlash(process.env.WHATSAPP_API_URL ?? DEFAULT_API_URL),
    apiKey,
    webhookSecret,
    webhookUrl: `${resolvePublicUrl()}${WEBHOOK_PATH}`,
    defaultCountryCode: countryCode,
    requestTimeoutMs: timeout,
  };
}

/**
 * True when the feature is switched on. Read this — not the raw env var — so the
 * spelling of "true" is decided once.
 */
export function isWhatsappEnabled(): boolean {
  return process.env.WHATSAPP_ENABLED === 'true';
}

/**
 * The configuration, or `null` when the feature is switched off.
 *
 * Not cached: `bun test` and the reminder script both flip these variables
 * between runs, and re-reading four `process.env` entries costs nothing next to
 * the HTTP call that follows.
 */
export function getWhatsappConfig(): WhatsappConfig | null {
  return isWhatsappEnabled() ? readConfig() : null;
}

/** For call sites that cannot proceed without it — a send, a connect. */
export function requireWhatsappConfig(): WhatsappConfig {
  const config = getWhatsappConfig();

  if (!config) {
    throw new Error('WhatsApp is disabled. Set WHATSAPP_ENABLED=true and configure the gateway. See .env.example.');
  }

  return config;
}

/**
 * The gateway session name for a clinic.
 *
 * Derived from the clinic id rather than its display name: the gateway keys
 * sessions by name, names are unique there, and a clinic that renames itself
 * must not lose the WhatsApp connection.
 */
export function sessionNameForClinic(clinicId: string): string {
  return `clinic-${clinicId}`;
}
