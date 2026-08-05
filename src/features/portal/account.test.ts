import { beforeEach, describe, expect, test } from 'bun:test';

import { db } from '@/db';
import { clientNutritionProfiles, clients } from '@/db/schema';

import { createTestClient, createTestClinic, resetDatabase } from '../../../tests/helpers';
import {
  createClientRequest,
  updateContactMethod,
  updateNotificationSetting,
  updateThemePreference,
  withdrawClientRequest,
} from './mutations';
import { getClientSettings, getOpenClientRequest, getSharedWeight } from './queries';

/**
 * The account screens' write paths, against a real database.
 *
 * These cover the three rules the screens are built on, and each one is a rule
 * the type system cannot hold: settings default rather than requiring a row,
 * a hidden weight never leaves the database, and asking twice does not queue
 * two identical items in the clinic's inbox.
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

describe('getSharedWeight', () => {
  async function writeProfile(weightKg: number | null, shared: boolean): Promise<void> {
    await db
      .insert(clientNutritionProfiles)
      .values({ clinicId, clientId, weightKg, shareWeightWithClient: shared, mealSchedule: [] })
      .onConflictDoUpdate({
        target: clientNutritionProfiles.clientId,
        set: { weightKg, shareWeightWithClient: shared },
      });
  }

  test('is null when there is no nutrition profile at all', async () => {
    expect(await getSharedWeight(clientId)).toBeNull();
  });

  test('withholds a recorded weight the dietitian has not shared', async () => {
    // §11: hidden means hidden everywhere, so the number must not leave the
    // database — not merely go unrendered.
    await writeProfile(68.4, false);

    expect(await getSharedWeight(clientId)).toBeNull();
  });

  test('returns it once the dietitian shares it', async () => {
    await writeProfile(68.4, true);

    expect(await getSharedWeight(clientId)).toBeCloseTo(68.4, 1);
  });

  test('sharing an unrecorded weight is still nothing to show', async () => {
    await writeProfile(null, true);

    expect(await getSharedWeight(clientId)).toBeNull();
  });
});

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
