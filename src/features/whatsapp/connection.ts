import { type WhatsappSettings } from '@/db/schema';

import {
  getWhatsappConfig,
  isWhatsappEnabled,
  requireWhatsappConfig,
  sessionNameForClinic,
  type WhatsappConfig,
} from './config';
import { createHttpGateway, GatewayError, type GatewaySession, type WhatsappGateway } from './gateway';
import { clearSessionLink, ensureSettings, saveSessionLink } from './mutations';
import { getSettings } from './queries';
import { type ConnectionView } from './types';

/**
 * Linking a clinic's WhatsApp number to the gateway, and keeping this app's copy
 * of that link honest.
 *
 * The gateway owns the truth: it holds the WhatsApp session, it decides when a QR
 * expires, and it is the thing that knows whether the phone is still paired.
 * `whatsapp_settings` is a **cache of that truth plus the clinic's preferences** —
 * so every function here reads the gateway and writes what it found, and none of
 * them infers a status locally.
 *
 * Statuses a dietitian will see, in the order they normally occur:
 *
 *   not_connected → created → initializing → qr_ready → authenticating → ready
 *
 * `qr_ready` is the one the UI acts on: it means "scan this now", and the QR
 * behind it expires in under a minute, which is why the settings page polls
 * {@link refreshConnection} rather than rendering one QR and hoping.
 */

/** Statuses where the gateway is already working on the session. */
const LIVE_STATUSES = new Set(['initializing', 'qr_ready', 'authenticating', 'ready']);

type ConnectionDeps = { gateway?: WhatsappGateway };

function resolveGateway(config: WhatsappConfig, deps: ConnectionDeps): WhatsappGateway {
  return deps.gateway ?? createHttpGateway(config);
}

/**
 * Starts (or resumes) the pairing flow and returns what the dietitian should see.
 *
 * Safe to call repeatedly — that is how the UI works. Pressing "Connect" twice
 * reuses the existing gateway session rather than creating a second one, because
 * `ensureSession` treats the gateway's 409 "name already exists" as the everyday
 * case it is.
 */
export async function connectClinic(clinicId: string, deps: ConnectionDeps = {}): Promise<ConnectionView> {
  const config = requireWhatsappConfig();
  const gateway = resolveGateway(config, deps);

  const settings = await ensureSettings(clinicId);

  let session = await resolveSession(gateway, settings, clinicId);

  // A session sitting at `created`, `disconnected` or `failed` needs the engine
  // booted before any QR exists. This is the slow call in the whole feature — the
  // gateway launches a headless browser behind it.
  if (!LIVE_STATUSES.has(session.status)) {
    session = await gateway.startSession(session.id);
  }

  const webhookId = await ensureWebhook(gateway, session.id, config, settings.webhookId);

  const qrCode = session.status === 'qr_ready' ? (await gateway.getQr(session.id))?.qrCode ?? null : null;

  const saved = await saveSessionLink(clinicId, {
    sessionId: session.id,
    webhookId,
    status: session.status,
    phone: session.phone ?? null,
    lastError: session.lastError ?? null,
    ...(session.status === 'ready' ? { connectedAt: new Date() } : {}),
  });

  return toView(saved ?? settings, { qrCode, gatewayReachable: true });
}

/**
 * Re-reads the gateway and updates the stored status. This is what the settings
 * page polls while a QR is on screen.
 *
 * A gateway that does not answer is reported as unreachable rather than treated as
 * a disconnect: the WhatsApp session is very likely still fine, and rewriting the
 * status on every hiccup would make the page flicker between "connected" and
 * "not connected" for reasons that have nothing to do with WhatsApp.
 */
export async function refreshConnection(clinicId: string, deps: ConnectionDeps = {}): Promise<ConnectionView> {
  const config = getWhatsappConfig();
  const settings = await getSettings(clinicId);

  if (!config || !settings) {
    return toView(settings, { qrCode: null, gatewayReachable: Boolean(config), enabled: Boolean(config) });
  }

  if (!settings.sessionId) return toView(settings, { qrCode: null, gatewayReachable: true });

  const gateway = resolveGateway(config, deps);

  let session: GatewaySession | null;

  try {
    session = await gateway.getSession(settings.sessionId);
  } catch (error) {
    console.error('[whatsapp] status refresh failed', error);
    return toView(settings, { qrCode: null, gatewayReachable: false });
  }

  // The session is gone from the gateway — someone deleted it there, or its data
  // directory was wiped. The stored link now points at nothing, so drop it and let
  // the dietitian connect again.
  if (!session) {
    const cleared = await clearSessionLink(clinicId);
    return toView(cleared ?? settings, { qrCode: null, gatewayReachable: true });
  }

  const qrCode = session.status === 'qr_ready' ? (await gateway.getQr(session.id))?.qrCode ?? null : null;

  const saved = await saveSessionLink(clinicId, {
    status: session.status,
    phone: session.phone ?? null,
    lastError: session.lastError ?? null,
    ...(session.status === 'ready' ? { connectedAt: new Date() } : {}),
  });

  return toView(saved ?? settings, { qrCode, gatewayReachable: true });
}

/**
 * Unlinks the number.
 *
 * Three steps, in this order and each tolerant of failure: remove the webhook so
 * a stale gateway keeps no route back into this app, log the device out of
 * WhatsApp, then delete the gateway session so re-pairing starts from a clean QR
 * instead of a half-authenticated one. The local row is cleared last and
 * unconditionally — a dietitian who pressed "Disconnect" must end up disconnected
 * in the UI even if the gateway is down, or they can never get out of the state.
 */
export async function disconnectClinic(clinicId: string, deps: ConnectionDeps = {}): Promise<ConnectionView> {
  const config = getWhatsappConfig();
  const settings = await getSettings(clinicId);

  if (config && settings?.sessionId) {
    const gateway = resolveGateway(config, deps);

    if (settings.webhookId) {
      await gateway.deleteWebhook(settings.sessionId, settings.webhookId).catch((error: unknown) => {
        console.error('[whatsapp] webhook removal failed', error);
      });
    }

    await gateway.logoutSession(settings.sessionId).catch((error: unknown) => {
      console.error('[whatsapp] logout failed', error);
    });

    await gateway.deleteSession(settings.sessionId).catch((error: unknown) => {
      console.error('[whatsapp] session deletion failed', error);
    });
  }

  const cleared = settings ? await clearSessionLink(clinicId) : null;

  return toView(cleared ?? settings, { qrCode: null, gatewayReachable: true });
}

/**
 * The stored session if the gateway still has it, otherwise a fresh one.
 *
 * Covers the case where the gateway was rebuilt from scratch while this app kept
 * a `session_id` that no longer exists there.
 */
async function resolveSession(
  gateway: WhatsappGateway,
  settings: WhatsappSettings,
  clinicId: string,
): Promise<GatewaySession> {
  if (settings.sessionId) {
    const existing = await gateway.getSession(settings.sessionId);
    if (existing) return existing;
  }

  return gateway.ensureSession(settings.sessionName || sessionNameForClinic(clinicId));
}

/**
 * Points the gateway's webhook at this app, without ever registering a second
 * one.
 *
 * A duplicate webhook would deliver every event twice, and while the inbound
 * handler is idempotent, doubling the delivery volume to hide a bookkeeping
 * mistake is not a design. The stored id is checked against what the gateway
 * actually has, then the URL, and only then is a new one created.
 *
 * The secret and event list are rewritten on every connect on purpose: rotating
 * `WHATSAPP_WEBHOOK_SECRET` should be a matter of pressing "Reconnect", and a
 * gateway upgrade that adds an event we now subscribe to should not need manual
 * surgery.
 */
async function ensureWebhook(
  gateway: WhatsappGateway,
  sessionId: string,
  config: WhatsappConfig,
  storedWebhookId: string | null,
): Promise<string | null> {
  try {
    const existing = await gateway.listWebhooks(sessionId);

    const match =
      existing.find((hook) => hook.id === storedWebhookId) ?? existing.find((hook) => hook.url === config.webhookUrl);

    if (match) {
      const updated = await gateway.updateWebhook(sessionId, match.id, config.webhookUrl, config.webhookSecret);
      return updated.id;
    }

    const created = await gateway.createWebhook(sessionId, config.webhookUrl, config.webhookSecret);
    return created.id;
  } catch (error) {
    // Worth connecting without: outbound reminders work with no webhook at all —
    // only delivery receipts and inbound replies are lost. A gateway that refuses
    // the URL (its SSRF guard rejects a private address it cannot reach, for
    // instance) should not block a clinic from sending anything.
    const detail = error instanceof GatewayError ? (error.detail ?? error.message) : String(error);
    console.error('[whatsapp] webhook registration failed', detail);

    return storedWebhookId;
  }
}

/** One place that turns a settings row into what the page renders. */
function toView(
  settings: WhatsappSettings | null,
  extra: { qrCode: string | null; gatewayReachable: boolean; enabled?: boolean },
): ConnectionView {
  return {
    enabled: extra.enabled ?? isWhatsappEnabled(),
    linked: Boolean(settings?.sessionId),
    status: (settings?.status as ConnectionView['status']) ?? 'not_connected',
    phone: settings?.phone ?? null,
    lastError: settings?.lastError ?? null,
    syncedAt: settings?.syncedAt ?? null,
    connectedAt: settings?.connectedAt ?? null,
    remindersEnabled: settings?.remindersEnabled ?? true,
    confirmationsEnabled: settings?.confirmationsEnabled ?? true,
    reminderLeadMinutes: settings?.reminderLeadMinutes ?? 24 * 60,
    qrCode: extra.qrCode,
    gatewayReachable: extra.gatewayReachable,
  };
}

/**
 * The page's first render: stored state only, no gateway call.
 *
 * Deliberately does not contact the gateway — the page must render instantly even
 * when the gateway is down, and the client component asks for a refresh right
 * after mount.
 */
export async function readConnection(clinicId: string): Promise<ConnectionView> {
  const settings = await getSettings(clinicId);

  return toView(settings, { qrCode: null, gatewayReachable: true });
}
