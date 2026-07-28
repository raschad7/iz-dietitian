import { beforeEach, describe, expect, test } from 'bun:test';

import { resetDatabase } from '../../../tests/helpers';
import { archiveClient, createClient, invitePortalAccess } from './mutations';
import { getClient, listClients } from './queries';
import { listClientsSchema } from './schema';

const filters = (overrides: Record<string, unknown> = {}) => listClientsSchema.parse(overrides);

beforeEach(async () => {
  await resetDatabase();
});

describe('listClients', () => {
  test('returns an empty result set for an empty table', async () => {
    const result = await listClients(filters());
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.pageCount).toBe(1);
  });

  test('finds a client written with hamza when searching without it', async () => {
    await createClient({ fullName: 'أحمد خليل', preferredLocale: 'ar' });

    const result = await listClients(filters({ q: 'احمد' }));
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.fullName).toBe('أحمد خليل');
  });

  test('finds a client written without hamza when searching with it', async () => {
    await createClient({ fullName: 'احمد خليل', preferredLocale: 'ar' });
    expect((await listClients(filters({ q: 'أحمد' }))).items).toHaveLength(1);
  });

  test('searches phone and email as typed', async () => {
    await createClient({ fullName: 'سارة', preferredLocale: 'ar', phone: '0599123456', email: 'sara@clinic.ps' });

    expect((await listClients(filters({ q: '99123' }))).items).toHaveLength(1);
    expect((await listClients(filters({ q: 'sara@' }))).items).toHaveLength(1);
  });

  test('returns nothing for a query that matches nobody', async () => {
    await createClient({ fullName: 'سارة', preferredLocale: 'ar' });
    expect((await listClients(filters({ q: 'زياد' }))).items).toHaveLength(0);
  });

  test('hides archived clients by default and reveals them on request', async () => {
    const { id } = await createClient({ fullName: 'أحمد', preferredLocale: 'ar' });
    await createClient({ fullName: 'سارة', preferredLocale: 'ar' });
    await archiveClient(id);

    expect((await listClients(filters())).items).toHaveLength(1);
    expect((await listClients(filters({ status: 'archived' }))).items).toHaveLength(1);
    expect((await listClients(filters({ status: 'all' }))).items).toHaveLength(2);
  });

  test('reports portal access on each row', async () => {
    const { id } = await createClient({ fullName: 'سارة', preferredLocale: 'ar', email: 'sara@clinic.ps' });
    await invitePortalAccess(id);
    await createClient({ fullName: 'أحمد', preferredLocale: 'ar' });

    const result = await listClients(filters({ q: 'سارة' }));
    expect(result.items[0]?.hasPortalAccess).toBe(true);

    const other = await listClients(filters({ q: 'أحمد' }));
    expect(other.items[0]?.hasPortalAccess).toBe(false);
  });

  test('paginates', async () => {
    for (let index = 0; index < 25; index += 1) {
      await createClient({ fullName: `عميل ${index}`, preferredLocale: 'ar' });
    }

    const first = await listClients(filters());
    expect(first.items).toHaveLength(20);
    expect(first.total).toBe(25);
    expect(first.pageCount).toBe(2);

    const second = await listClients(filters({ page: '2' }));
    expect(second.items).toHaveLength(5);
  });

  test('returns an empty page past the end rather than failing', async () => {
    await createClient({ fullName: 'أحمد', preferredLocale: 'ar' });
    expect((await listClients(filters({ page: '9' }))).items).toEqual([]);
  });
});

describe('getClient', () => {
  test('returns the full record', async () => {
    const { id } = await createClient({ fullName: 'سارة', preferredLocale: 'ar', heightCm: 165 });

    const client = await getClient(id);
    expect(client?.fullName).toBe('سارة');
    expect(client?.heightCm).toBe(165);
    expect(client?.hasPortalAccess).toBe(false);
  });

  test('returns null for an unknown id', async () => {
    expect(await getClient('00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  test('returns null for a malformed id instead of throwing', async () => {
    expect(await getClient('not-a-uuid')).toBeNull();
  });
});
