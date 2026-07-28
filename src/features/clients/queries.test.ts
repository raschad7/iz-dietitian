import { beforeEach, describe, expect, test } from 'bun:test';

import { createTestClinic, resetDatabase } from '../../../tests/helpers';
import { archiveClient, createClient, invitePortalAccess } from './mutations';
import { getClient, listClients } from './queries';
import { listClientsSchema } from './schema';

const filters = (overrides: Record<string, unknown> = {}) => listClientsSchema.parse(overrides);

let clinicId: string;

beforeEach(async () => {
  await resetDatabase();
  clinicId = await createTestClinic();
});

describe('listClients', () => {
  test('returns an empty result set for an empty table', async () => {
    const result = await listClients(clinicId, filters());
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.pageCount).toBe(1);
  });

  test('finds a client written with hamza when searching without it', async () => {
    await createClient(clinicId, { fullName: 'أحمد خليل', preferredLocale: 'ar' });

    const result = await listClients(clinicId, filters({ q: 'احمد' }));
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.fullName).toBe('أحمد خليل');
  });

  test('finds a client written without hamza when searching with it', async () => {
    await createClient(clinicId, { fullName: 'احمد خليل', preferredLocale: 'ar' });
    expect((await listClients(clinicId, filters({ q: 'أحمد' }))).items).toHaveLength(1);
  });

  test('searches phone and email as typed', async () => {
    await createClient(clinicId, { fullName: 'سارة', preferredLocale: 'ar', phone: '0599123456', email: 'sara@clinic.ps' });

    expect((await listClients(clinicId, filters({ q: '99123' }))).items).toHaveLength(1);
    expect((await listClients(clinicId, filters({ q: 'sara@' }))).items).toHaveLength(1);
  });

  test('returns nothing for a query that matches nobody', async () => {
    await createClient(clinicId, { fullName: 'سارة', preferredLocale: 'ar' });
    expect((await listClients(clinicId, filters({ q: 'زياد' }))).items).toHaveLength(0);
  });

  test('hides archived clients by default and reveals them on request', async () => {
    const { id } = await createClient(clinicId, { fullName: 'أحمد', preferredLocale: 'ar' });
    await createClient(clinicId, { fullName: 'سارة', preferredLocale: 'ar' });
    await archiveClient(clinicId, id);

    expect((await listClients(clinicId, filters())).items).toHaveLength(1);
    expect((await listClients(clinicId, filters({ status: 'archived' }))).items).toHaveLength(1);
    expect((await listClients(clinicId, filters({ status: 'all' }))).items).toHaveLength(2);
  });

  test('reports portal access on each row', async () => {
    const { id } = await createClient(clinicId, { fullName: 'سارة', preferredLocale: 'ar', email: 'sara@clinic.ps' });
    await invitePortalAccess(clinicId, id);
    await createClient(clinicId, { fullName: 'أحمد', preferredLocale: 'ar' });

    const result = await listClients(clinicId, filters({ q: 'سارة' }));
    expect(result.items[0]?.hasPortalAccess).toBe(true);

    const other = await listClients(clinicId, filters({ q: 'أحمد' }));
    expect(other.items[0]?.hasPortalAccess).toBe(false);
  });

  test('paginates', async () => {
    for (let index = 0; index < 25; index += 1) {
      await createClient(clinicId, { fullName: `عميل ${index}`, preferredLocale: 'ar' });
    }

    const first = await listClients(clinicId, filters());
    expect(first.items).toHaveLength(20);
    expect(first.total).toBe(25);
    expect(first.pageCount).toBe(2);

    const second = await listClients(clinicId, filters({ page: '2' }));
    expect(second.items).toHaveLength(5);
  });

  test('returns an empty page past the end rather than failing', async () => {
    await createClient(clinicId, { fullName: 'أحمد', preferredLocale: 'ar' });
    expect((await listClients(clinicId, filters({ page: '9' }))).items).toEqual([]);
  });
});

describe('getClient', () => {
  test('returns the full record', async () => {
    const { id } = await createClient(clinicId, { fullName: 'سارة', preferredLocale: 'ar', heightCm: 165 });

    const client = await getClient(clinicId, id);
    expect(client?.fullName).toBe('سارة');
    expect(client?.heightCm).toBe(165);
    expect(client?.hasPortalAccess).toBe(false);
  });

  test('returns null for an unknown id', async () => {
    expect(await getClient(clinicId, '00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  test('returns null for a malformed id instead of throwing', async () => {
    expect(await getClient(clinicId, 'not-a-uuid')).toBeNull();
  });
});

describe('clinic isolation', () => {
  test('a clinic never sees another clinic\u2019s clients', async () => {
    const otherClinicId = await createTestClinic('Other Clinic');

    await createClient(clinicId, { fullName: 'مريض عيادتي', preferredLocale: 'ar' });
    await createClient(otherClinicId, { fullName: 'مريض العيادة الأخرى', preferredLocale: 'ar' });

    const mine = await listClients(clinicId, filters());
    expect(mine.total).toBe(1);
    expect(mine.items[0]?.fullName).toBe('مريض عيادتي');

    const theirs = await listClients(otherClinicId, filters());
    expect(theirs.total).toBe(1);
    expect(theirs.items[0]?.fullName).toBe('مريض العيادة الأخرى');
  });

  test('search does not reach across clinics', async () => {
    const otherClinicId = await createTestClinic('Other Clinic');
    await createClient(otherClinicId, { fullName: 'أحمد خليل', preferredLocale: 'ar' });

    expect((await listClients(clinicId, filters({ q: 'احمد' }))).items).toHaveLength(0);
  });

  test('getClient returns null for a client owned by another clinic', async () => {
    const otherClinicId = await createTestClinic('Other Clinic');
    const { id } = await createClient(otherClinicId, { fullName: 'سارة', preferredLocale: 'ar' });

    // Null, not a partial record: indistinguishable from "no such client", so a
    // guessed id cannot be confirmed as real.
    expect(await getClient(clinicId, id)).toBeNull();
    expect(await getClient(otherClinicId, id)).not.toBeNull();
  });
});
