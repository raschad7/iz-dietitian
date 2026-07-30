import { z } from 'zod';

import { WHATSAPP_STATUSES, type WhatsappStatus } from '@/db/schema';

import { type WhatsappConfig } from './config';

/**
 * The HTTP client for the OpenWA gateway — the only module in this app that
 * knows the gateway's URLs, headers and payload shapes.
 *
 * Everything else depends on the {@link WhatsappGateway} interface, which exists
 * so the send pipeline can be tested without a WhatsApp account: `bun test`
 * passes a fake, production passes {@link createHttpGateway}. Same seam, same
 * reasoning as `src/lib/mail/`'s console and Resend transports.
 *
 * Two facts about the gateway shape everything below:
 *
 *  - **A session has both a name and an id.** We choose the name
 *    (`clinic-<uuid>`, see `sessionNameForClinic`); the gateway assigns the id,
 *    and every other endpoint is keyed by that id. Both are stored.
 *  - **`201` on a send means "accepted", not "delivered".** The gateway hands the
 *    message to WhatsApp and answers immediately; a number that is not on
 *    WhatsApp still gets a message id. Real delivery arrives later as a
 *    `message.ack` webhook, which is why `whatsapp_messages.status` exists.
 */

/** Gateway session statuses, plus the local `not_connected`. See the schema. */
const gatewayStatusSchema = z.enum(WHATSAPP_STATUSES);

const sessionSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: gatewayStatusSchema.catch('failed'),
  phone: z.string().nullish(),
  pushName: z.string().nullish(),
  connectedAt: z.string().nullish(),
  lastError: z.string().nullish(),
});

const qrSchema = z.object({
  qrCode: z.string(),
  status: gatewayStatusSchema.catch('qr_ready'),
});

const sentMessageSchema = z.object({
  messageId: z.string(),
  timestamp: z.number().optional(),
});

const webhookSchema = z.object({
  id: z.string(),
  url: z.string(),
  events: z.array(z.string()),
  active: z.boolean(),
});

const numberCheckSchema = z.object({
  exists: z.boolean(),
  whatsappId: z.string().nullish(),
});

export type GatewaySession = z.infer<typeof sessionSchema>;
export type GatewayQr = z.infer<typeof qrSchema>;
export type GatewaySentMessage = z.infer<typeof sentMessageSchema>;
export type GatewayWebhook = z.infer<typeof webhookSchema>;

/** The events this app subscribes to. Anything else is noise for a clinic. */
export const SUBSCRIBED_EVENTS = [
  'message.received',
  'message.ack',
  'message.failed',
  'session.status',
  'session.authenticated',
  'session.disconnected',
] as const;

export interface WhatsappGateway {
  /** Liveness of the gateway itself, before blaming a session for anything. */
  isReachable(): Promise<boolean>;

  /** Creates the session, or returns the existing one with that name. */
  ensureSession(name: string): Promise<GatewaySession>;
  getSession(sessionId: string): Promise<GatewaySession | null>;
  /** Boots the engine. Slow — this is what launches Chromium on the gateway. */
  startSession(sessionId: string): Promise<GatewaySession>;
  /** The pairing QR, or `null` when the session is not waiting for one. */
  getQr(sessionId: string): Promise<GatewayQr | null>;
  /** Unlinks the device. The session survives and can be paired again. */
  logoutSession(sessionId: string): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;

  sendText(sessionId: string, chatId: string, text: string): Promise<GatewaySentMessage>;
  /** Whether a number is registered on WhatsApp. A send cannot tell you this. */
  checkNumber(sessionId: string, phone: string): Promise<boolean>;

  listWebhooks(sessionId: string): Promise<GatewayWebhook[]>;
  createWebhook(sessionId: string, url: string, secret: string): Promise<GatewayWebhook>;
  updateWebhook(sessionId: string, webhookId: string, url: string, secret: string): Promise<GatewayWebhook>;
  deleteWebhook(sessionId: string, webhookId: string): Promise<void>;
}

/**
 * A gateway call that failed.
 *
 * `status` is the HTTP status, or 0 for a transport failure — the distinction
 * matters to callers: a 404 means "reconnect", a 0 means "the gateway is down,
 * try again later", and the reminder job treats those differently.
 */
export class GatewayError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'GatewayError';
  }

  /** True when the failure is worth retrying on the next cron tick. */
  get isTransient(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Statuses to treat as "no such thing" and return `null` for. */
  nullOn?: readonly number[];
  timeoutMs?: number;
};

/**
 * Reads whatever the gateway put in the body of an error response.
 *
 * NestJS answers `{ "message": "...", "statusCode": 400 }`, sometimes with
 * `message` as an array of validation strings. Both end up in the row's `error`
 * column and in front of staff, so it is worth unwrapping rather than storing
 * `[object Object]`.
 */
function readErrorDetail(body: unknown): string | undefined {
  if (typeof body === 'string') return body.slice(0, 500) || undefined;

  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.filter((entry) => typeof entry === 'string').join('; ');
  }

  return undefined;
}

export function createHttpGateway(config: WhatsappConfig): WhatsappGateway {
  async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    { method = 'GET', body, nullOn = [], timeoutMs = config.requestTimeoutMs }: RequestOptions = {},
  ): Promise<T | null> {
    let response: Response;

    try {
      response = await fetch(`${config.apiUrl}${path}`, {
        method,
        headers: {
          'X-API-Key': config.apiKey,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        // The gateway is infrastructure, not a CDN: a cached session status
        // would be a lie the moment the phone disconnects.
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      // Never let the URL into the message: it is fine here, but this string is
      // stored and shown, and the same code path would leak a credentialed URL.
      throw new GatewayError(
        `The WhatsApp gateway did not answer (${method} ${path}).`,
        0,
        cause instanceof Error ? cause.message : String(cause),
      );
    }

    if (nullOn.includes(response.status)) return null;

    if (!response.ok) {
      const detail = readErrorDetail(await response.text().then(parseMaybeJson));

      throw new GatewayError(
        `The WhatsApp gateway refused ${method} ${path} (HTTP ${response.status}).`,
        response.status,
        detail,
      );
    }

    // 204, or an endpoint that answers with an empty body.
    const text = await response.text();
    const payload = text ? parseMaybeJson(text) : {};

    const parsed = schema.safeParse(payload);

    if (!parsed.success) {
      // A shape we do not recognise is a gateway version mismatch, and guessing
      // past it would corrupt the stored session state.
      throw new GatewayError(
        `The WhatsApp gateway answered ${method} ${path} in an unexpected shape.`,
        response.status,
        parsed.error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`).join('; '),
      );
    }

    return parsed.data;
  }

  /** `request` returns `null` only for a status the caller opted into. */
  async function requireRequest<T>(path: string, schema: z.ZodType<T>, options?: RequestOptions): Promise<T> {
    const result = await request(path, schema, options);

    if (result === null) {
      throw new GatewayError(`The WhatsApp gateway returned nothing for ${path}.`, 0);
    }

    return result;
  }

  const sessionPath = (sessionId: string) => `/api/sessions/${encodeURIComponent(sessionId)}`;

  return {
    async isReachable() {
      try {
        await requireRequest('/api/health/ready', z.unknown(), { timeoutMs: 5_000 });
        return true;
      } catch {
        return false;
      }
    },

    async ensureSession(name) {
      const created = await request(`/api/sessions`, sessionSchema, {
        method: 'POST',
        body: { name, config: { autoReconnect: true } },
        // 409 = a session with this name already exists. That is the everyday
        // case on reconnect, not an error: fall through and look it up.
        nullOn: [409],
      });

      if (created) return created;

      const sessions = await requireRequest(`/api/sessions`, z.array(sessionSchema).catch([]));
      const existing = sessions.find((session) => session.name === name);

      if (!existing) {
        throw new GatewayError(`The gateway reports session "${name}" as existing but does not list it.`, 409);
      }

      return existing;
    },

    getSession(sessionId) {
      return request(sessionPath(sessionId), sessionSchema, { nullOn: [404] });
    },

    async startSession(sessionId) {
      // 400 here means "already started", which is the end state the caller wanted
      // anyway — so it is answered by re-reading the session rather than by making
      // every caller distinguish the two.
      const started = await request(`${sessionPath(sessionId)}/start`, sessionSchema, {
        method: 'POST',
        nullOn: [400],
      });

      if (started) return started;

      const existing = await request(sessionPath(sessionId), sessionSchema, { nullOn: [404] });

      if (!existing) {
        throw new GatewayError('The gateway refused to start the session and no longer lists it.', 404);
      }

      return existing;
    },

    getQr(sessionId) {
      // 404 = no session; 400 = the session is not at the QR stage (already
      // paired, or still booting). Neither is a failure worth throwing over —
      // the settings page polls this and shows the status instead.
      return request(`${sessionPath(sessionId)}/qr`, qrSchema, { nullOn: [400, 404] });
    },

    async logoutSession(sessionId) {
      // 400 = not started, 404 = already gone: both mean "not linked", which is
      // what the caller asked for.
      await request(`${sessionPath(sessionId)}/logout`, z.unknown(), {
        method: 'POST',
        nullOn: [400, 404],
      });
    },

    async deleteSession(sessionId) {
      await request(sessionPath(sessionId), z.unknown(), { method: 'DELETE', nullOn: [404] });
    },

    sendText(sessionId, chatId, text) {
      return requireRequest(`${sessionPath(sessionId)}/messages/send-text`, sentMessageSchema, {
        method: 'POST',
        body: { chatId, text },
        // A send that hangs blocks the reminder run behind it, and WhatsApp
        // either accepts a text quickly or not at all.
        timeoutMs: Math.min(config.requestTimeoutMs, 15_000),
      });
    },

    async checkNumber(sessionId, phone) {
      const result = await request(
        `${sessionPath(sessionId)}/contacts/check/${encodeURIComponent(phone)}`,
        numberCheckSchema,
        { nullOn: [400, 404], timeoutMs: 10_000 },
      );

      return result?.exists ?? false;
    },

    async listWebhooks(sessionId) {
      return (await request(`${sessionPath(sessionId)}/webhooks`, z.array(webhookSchema).catch([]))) ?? [];
    },

    createWebhook(sessionId, url, secret) {
      return requireRequest(`${sessionPath(sessionId)}/webhooks`, webhookSchema, {
        method: 'POST',
        body: { url, events: [...SUBSCRIBED_EVENTS], secret, retryCount: 3 },
      });
    },

    updateWebhook(sessionId, webhookId, url, secret) {
      return requireRequest(
        `${sessionPath(sessionId)}/webhooks/${encodeURIComponent(webhookId)}`,
        webhookSchema,
        { method: 'PUT', body: { url, events: [...SUBSCRIBED_EVENTS], secret, active: true } },
      );
    },

    async deleteWebhook(sessionId, webhookId) {
      await request(`${sessionPath(sessionId)}/webhooks/${encodeURIComponent(webhookId)}`, z.unknown(), {
        method: 'DELETE',
        nullOn: [404],
      });
    },
  };
}

function parseMaybeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Re-exported so callers can type a status without importing the schema. */
export type { WhatsappStatus };
