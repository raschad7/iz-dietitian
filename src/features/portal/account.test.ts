import { beforeEach, describe, expect, test } from 'bun:test';

import { db } from '@/db';
import { clients } from '@/db/schema';

import { createTestClient, createTestClinic, resetDatabase } from '../../../tests/helpers';
import {
  createClientRequest,
  updateContactMethod,
  updateNotificationSetting,
  updateThemePreference,
  withdrawClientRequest,
} from './mutations';
import { getClientSettings, getOpenClientRequest } from './queries';

/**
 * The account screens' write paths, against a real database.
 *
 * These cover the two rules the screens are built on, and each one is a rule the
 * type system cannot hold: settings default rather than requiring a row, and
 * asking twice does not queue two identical items in the clinic's inbox.
 */

let clinicId: string;
let clientId: string;

beforeEach(async () => {
  await resetDatabase();
  clinicId = await createTestClinic();
  clientId = await createTestClient(clinicId);
});

describe('client settings', () => {
  test('a client who has never opened the screen reads the defaults, with no row written', async () => {
    expect(await getClientSettings(clientId)).toEqual({
      notifications: {
        appointmentReminder: true,
        checkInReminder: true,
        planUpdate: true,
        clinicMessage: true,
      },
      theme: 'system',
      preferredContact: 'whatsapp',
    });
  });

  test('the first save creates the row and leaves every other setting on its default', async () => {
    const result = await updateNotificationSetting(clientId, {
      kind: 'checkInReminder',
      enabled: false,
    });

    expect(result.ok).toBe(true);

    const settings = await getClientSettings(clientId);

    expect(settings.notifications.checkInReminder).toBe(false);
    expect(settings.notifications.appointmentReminder).toBe(true);
    expect(settings.theme).toBe('system');
  });

  test('later saves update the same row rather than failing on the unique index', async () => {
    await updateNotificationSetting(clientId, { kind: 'planUpdate', enabled: false });
    await updateThemePreference(clientId, 'dark');
    await updateContactMethod(clientId, 'phone');
    await updateNotificationSetting(clientId, { kind: 'planUpdate', enabled: true });

    const settings = await getClientSettings(clientId);

    expect(settings.notifications.planUpdate).toBe(true);
    expect(settings.theme).toBe('dark');
    expect(settings.preferredContact).toBe('phone');
  });
});

/*
 * `getSharedWeight` was covered here, four ways: no profile, a weight withheld,
 * a weight shared, and a share of nothing. All four are gone with the function.
 *
 * They guarded one rule — a weight the dietitian had not shared must not leave
 * the database — and that rule is now structural rather than conditional: the
 * portal reads no weight at all, and `PortalProfile` has nowhere to put one. A
 * test asserting that a function which does not exist returns null would be
 * testing the type checker.
 */

describe('client requests', () => {
  test('files a correction the clinic can route', async () => {
    const result = await createClientRequest(
      { clientId, clinicId },
      { kind: 'data_update', topic: 'health', message: 'my height is 167' },
    );

    expect(result.ok).toBe(true);

    const open = await getOpenClientRequest(clientId, 'data_update');

    expect(open).toMatchObject({ kind: 'data_update', topic: 'health' });
  });

  test('a second correction while the first is waiting is refused, not queued', async () => {
    await createClientRequest(
      { clientId, clinicId },
      { kind: 'data_update', topic: 'health', message: 'first' },
    );

    const second = await createClientRequest(
      { clientId, clinicId },
      { kind: 'data_update', topic: 'basic', message: 'second' },
    );

    expect(second).toEqual({ ok: false, error: 'errors.alreadyRequested' });
  });

  test('a deletion request is a separate ask and may wait alongside a correction', async () => {
    await createClientRequest(
      { clientId, clinicId },
      { kind: 'data_update', topic: 'other', message: 'something' },
    );

    const deletion = await createClientRequest(
      { clientId, clinicId },
      { kind: 'account_deletion', message: undefined, confirm: 'confirmed' },
    );

    expect(deletion.ok).toBe(true);
    expect(await getOpenClientRequest(clientId, 'account_deletion')).not.toBeNull();
    expect(await getOpenClientRequest(clientId, 'data_update')).not.toBeNull();
  });

  test('a deletion request deletes nothing — the client row is untouched', async () => {
    await createClientRequest(
      { clientId, clinicId },
      { kind: 'account_deletion', message: 'moving away', confirm: 'confirmed' },
    );

    const rows = await db.select({ id: clients.id }).from(clients);

    expect(rows).toHaveLength(1);
  });

  test('withdrawing clears the way for a new request of the same kind', async () => {
    await createClientRequest(
      { clientId, clinicId },
      { kind: 'data_update', topic: 'contact', message: 'wrong number' },
    );

    expect(await withdrawClientRequest(clientId, 'data_update')).toEqual({
      ok: true,
      data: undefined,
    });

    expect(await getOpenClientRequest(clientId, 'data_update')).toBeNull();

    const again = await createClientRequest(
      { clientId, clinicId },
      { kind: 'data_update', topic: 'contact', message: 'still wrong' },
    );

    expect(again.ok).toBe(true);
  });

  test('withdrawing somebody else’s request updates nothing', async () => {
    const otherClientId = await createTestClient(clinicId, 'Another Client');

    await createClientRequest(
      { clientId, clinicId },
      { kind: 'data_update', topic: 'other', message: 'mine' },
    );

    expect(await withdrawClientRequest(otherClientId, 'data_update')).toEqual({
      ok: false,
      error: 'errors.notFound',
    });

    expect(await getOpenClientRequest(clientId, 'data_update')).not.toBeNull();
  });
});
