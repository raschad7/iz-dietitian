import { afterAll, beforeEach, describe, expect, test } from 'bun:test';

import {
  createTestClinic,
  createTestWhatsappSettings,
  disableWhatsappForTests,
  enableWhatsappForTests,
  readWhatsappSettings,
  resetDatabase,
} from '../../../tests/helpers';
import { connectClinic, disconnectClinic, refreshConnection } from './connection';
import { GatewayError, type GatewaySession, type GatewayWebhook, type WhatsappGateway } from './gateway';

/**
 * Pairing, refreshing and unlinking — against a gateway that is scripted rather
 * than real.
 *
 * What matters here is that this app's copy of the connection never drifts from
 * what the gateway says: it must not register a second webhook on reconnect, must
 * not claim `ready` on its own, and must not leave a clinic stuck when the gateway
 * has forgotten the session.
 */

let clinicId: string;

type ScriptedGateway = WhatsappGateway & {
  session: GatewaySession | null;
  webhooks: GatewayWebhook[];
  calls: string[];
};

function scriptedGateway(initial: Partial<GatewaySession> = {}): ScriptedGateway {
  const gateway: ScriptedGateway = {
    session: null,
    webhooks: [],
    calls: [],

    isReachable: async () => true,


    async ensureSession(name) {
      gateway.calls.push('ensureSession');
      gateway.session = {
        id: 'sess-new',
        name,
        status: 'created',
        phone: null,
        pushName: null,
        connectedAt: null,
        lastError: null,
        ...initial,
      };

      return gateway.session;
    },

    async getSession() {
      gateway.calls.push('getSession');
      return gateway.session;
    },

    async startSession() {
      gateway.calls.push('startSession');

      if (!gateway.session) throw new GatewayError('no session', 404);

      gateway.session = { ...gateway.session, status: 'qr_ready' };
      return gateway.session;
    },

    async getQr() {
      gateway.calls.push('getQr');
      return { qrCode: 'data:image/png;base64,QR', status: 'qr_ready' as const };
    },

    async logoutSession() {
      gateway.calls.push('logoutSession');
    },

    async deleteSession() {
      gateway.calls.push('deleteSession');
      gateway.session = null;
    },

    async sendText() {
      throw new Error('not used in these tests');
    },

    async sendFile() {
      throw new Error('not used in these tests');
    },

    checkNumber: async () => true,

    async listWebhooks() {
      gateway.calls.push('listWebhooks');
      return gateway.webhooks;
    },

    async createWebhook(_sessionId, url) {
      gateway.calls.push('createWebhook');
      const hook = { id: `hook-${gateway.webhooks.length + 1}`, url, events: ['message.received'], active: true };
      gateway.webhooks.push(hook);

      return hook;
    },

    async updateWebhook(_sessionId, webhookId, url) {
      gateway.calls.push('updateWebhook');
      return { id: webhookId, url, events: ['message.received'], active: true };
    },

    async deleteWebhook(_sessionId, webhookId) {
      gateway.calls.push('deleteWebhook');
      gateway.webhooks = gateway.webhooks.filter((hook) => hook.id !== webhookId);
    },
  };

  return gateway;
}

beforeEach(async () => {
  await resetDatabase();
  enableWhatsappForTests();

  clinicId = await createTestClinic();
});

afterAll(() => {
  disableWhatsappForTests();
});

describe('connectClinic', () => {
  test('creates the session, registers one webhook and hands back a QR', async () => {
    const gateway = scriptedGateway();

    const view = await connectClinic(clinicId, { gateway });

    expect(view.status).toBe('qr_ready');
    expect(view.qrCode).toBe('data:image/png;base64,QR');
    expect(view.linked).toBe(true);
    expect(gateway.webhooks).toHaveLength(1);

    const settings = await readWhatsappSettings(clinicId);
    expect(settings?.sessionId).toBe('sess-new');
    expect(settings?.webhookId).toBe('hook-1');
    expect(settings?.status).toBe('qr_ready');
    // Mirrored from the gateway, never invented here.
    expect(settings?.connectedAt).toBeNull();
  });

  test('pressing Connect twice does not register a second webhook', async () => {
    // A duplicate webhook would deliver every event twice for ever.
    const gateway = scriptedGateway();

    await connectClinic(clinicId, { gateway });
    await connectClinic(clinicId, { gateway });

    expect(gateway.webhooks).toHaveLength(1);
    expect(gateway.calls.filter((call) => call === 'createWebhook')).toHaveLength(1);
    expect(gateway.calls).toContain('updateWebhook');
  });

  test('does not restart a session that is already connected', async () => {
    const gateway = scriptedGateway();
    await connectClinic(clinicId, { gateway });
    gateway.session = { ...gateway.session!, status: 'ready', phone: '970599123456' };
    gateway.calls.length = 0;

    const view = await connectClinic(clinicId, { gateway });

    expect(gateway.calls).not.toContain('startSession');
    expect(view.status).toBe('ready');
    expect(view.phone).toBe('970599123456');
    expect((await readWhatsappSettings(clinicId))?.connectedAt).not.toBeNull();
  });

  test('creates a fresh session when the gateway has forgotten the stored one', async () => {
    // The gateway was rebuilt while this app kept a session id that no longer
    // exists there.
    await createTestWhatsappSettings(clinicId, { sessionId: 'sess-gone', status: 'ready' });

    const gateway = scriptedGateway();

    await connectClinic(clinicId, { gateway });

    expect(gateway.calls).toContain('ensureSession');
    expect((await readWhatsappSettings(clinicId))?.sessionId).toBe('sess-new');
  });

  test('connects anyway when the gateway refuses the webhook URL', async () => {
    // Outbound reminders work with no webhook at all — only receipts and replies
    // are lost — so a gateway that cannot reach this app must not block sending.
    const gateway = scriptedGateway();
    gateway.createWebhook = async () => {
      throw new GatewayError('SSRF guard rejected the URL', 400, 'private address');
    };

    const view = await connectClinic(clinicId, { gateway });

    expect(view.status).toBe('qr_ready');
    expect((await readWhatsappSettings(clinicId))?.webhookId).toBeNull();
  });

  test('refuses to connect when the feature is switched off', async () => {
    disableWhatsappForTests();

    await expect(connectClinic(clinicId, { gateway: scriptedGateway() })).rejects.toThrow(/WHATSAPP_ENABLED/);

    enableWhatsappForTests();
  });
});

describe('refreshConnection', () => {
  test('stores the status the gateway reports', async () => {
    const gateway = scriptedGateway();
    await connectClinic(clinicId, { gateway });

    gateway.session = { ...gateway.session!, status: 'ready', phone: '970599123456' };

    const view = await refreshConnection(clinicId, { gateway });

    expect(view.status).toBe('ready');
    expect(view.qrCode).toBeNull();
    expect((await readWhatsappSettings(clinicId))?.phone).toBe('970599123456');
  });

  test('clears the link when the session no longer exists on the gateway', async () => {
    const gateway = scriptedGateway();
    await connectClinic(clinicId, { gateway });
    gateway.session = null;

    const view = await refreshConnection(clinicId, { gateway });

    expect(view.status).toBe('not_connected');
    expect(view.linked).toBe(false);
    expect((await readWhatsappSettings(clinicId))?.sessionId).toBeNull();
  });

  test('reports an unreachable gateway without rewriting the stored status', async () => {
    // A gateway hiccup says nothing about whether the phone is still paired, and
    // flipping the status on every one would make the page lie twice.
    await createTestWhatsappSettings(clinicId, { status: 'ready', phone: '970599123456' });

    const gateway = scriptedGateway();
    gateway.getSession = async () => {
      throw new GatewayError('gateway did not answer', 0);
    };

    const view = await refreshConnection(clinicId, { gateway });

    expect(view.gatewayReachable).toBe(false);
    expect(view.status).toBe('ready');
    expect((await readWhatsappSettings(clinicId))?.status).toBe('ready');
  });

  test('a clinic that never connected simply reads as not linked', async () => {
    const view = await refreshConnection(clinicId, { gateway: scriptedGateway() });

    expect(view.linked).toBe(false);
    expect(view.status).toBe('not_connected');
  });
});

describe('disconnectClinic', () => {
  test('removes the webhook, logs out, deletes the session and clears the row', async () => {
    const gateway = scriptedGateway();
    await connectClinic(clinicId, { gateway });
    gateway.calls.length = 0;

    const view = await disconnectClinic(clinicId, { gateway });

    expect(gateway.calls).toEqual(['deleteWebhook', 'logoutSession', 'deleteSession']);
    expect(view.status).toBe('not_connected');
    expect(view.linked).toBe(false);

    const settings = await readWhatsappSettings(clinicId);
    expect(settings?.sessionId).toBeNull();
    expect(settings?.webhookId).toBeNull();
    expect(settings?.phone).toBeNull();
  });

  test('still disconnects locally when the gateway is down', async () => {
    // Otherwise a dietitian who pressed Disconnect can never leave that state.
    const gateway = scriptedGateway();
    await connectClinic(clinicId, { gateway });

    gateway.logoutSession = async () => {
      throw new GatewayError('gateway did not answer', 0);
    };
    gateway.deleteSession = async () => {
      throw new GatewayError('gateway did not answer', 0);
    };

    const view = await disconnectClinic(clinicId, { gateway });

    expect(view.linked).toBe(false);
    expect((await readWhatsappSettings(clinicId))?.sessionId).toBeNull();
  });

  test('keeps the automation preferences and the message history', async () => {
    const gateway = scriptedGateway();
    await connectClinic(clinicId, { gateway });

    const view = await disconnectClinic(clinicId, { gateway });

    // Unlinking a phone to link another one must not reset how the clinic works.
    expect(view.remindersEnabled).toBe(true);
    expect(view.reminderLeadMinutes).toBe(24 * 60);
    expect(await readWhatsappSettings(clinicId)).not.toBeNull();
  });
});
