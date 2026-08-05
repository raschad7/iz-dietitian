import { beforeEach, describe, expect, test } from 'bun:test';

import { createTestClinic, resetDatabase } from '../../../tests/helpers';
import { archiveClient, createClient } from './mutations';
import { issuePortalCredentials } from './portal-credentials';
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

  /* The search box is the name column and nothing else — phone and email are
     filtered on instead, below. It matched all three at once until the filter
     control existed, which made one field mean three things. */
  test('does not search phone or email', async () => {
    await createClient(clinicId, { fullName: 'سارة', preferredLocale: 'ar', phone: '0599123456', email: 'sara@clinic.ps' });

    expect((await listClients(clinicId, filters({ q: '99123' }))).items).toHaveLength(0);
    expect((await listClients(clinicId, filters({ q: 'sara@' }))).items).toHaveLength(0);
  });

  test('filters on phone and email as typed', async () => {
    await createClient(clinicId, { fullName: 'سارة', preferredLocale: 'ar', phone: '0599123456', email: 'sara@clinic.ps' });
    await createClient(clinicId, { fullName: 'أحمد', preferredLocale: 'ar', phone: '0561111111' });

    expect(
      (await listClients(clinicId, filters({ filterBy: 'phone', filterValue: '99123' }))).items,
    ).toHaveLength(1);
    expect(
      (await listClients(clinicId, filters({ filterBy: 'email', filterValue: 'sara@' }))).items,
    ).toHaveLength(1);
  });

  /* A column chosen with nothing typed into it is not a filter, and must not
     empty the register while the reader is still filling the popover in. */
  test('ignores a filter column with no value', async () => {
    await createClient(clinicId, { fullName: 'سارة', preferredLocale: 'ar' });
    expect((await listClients(clinicId, filters({ filterBy: 'phone' }))).items).toHaveLength(1);
  });

  test('filters on portal access', async () => {
    const { id } = await createClient(clinicId, { fullName: 'سارة', preferredLocale: 'ar', email: 'sara@clinic.ps' });
    await issuePortalCredentials(clinicId, id, 'sara-portal-0001');
    await createClient(clinicId, { fullName: 'أحمد', preferredLocale: 'ar' });

    const withAccess = await listClients(
      clinicId,
      filters({ filterBy: 'portalAccess', filterValue: 'yes' }),
    );
    expect(withAccess.items).toHaveLength(1);
    expect(withAccess.items[0]?.fullName).toBe('سارة');

    const without = await listClients(
      clinicId,
      filters({ filterBy: 'portalAccess', filterValue: 'no' }),
    );
    expect(without.items).toHaveLength(1);
    expect(without.items[0]?.fullName).toBe('أحمد');
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
    expect(
      (await listClients(clinicId, filters({ filterBy: 'status', filterValue: 'archived' }))).items,
    ).toHaveLength(1);
    expect(
      (await listClients(clinicId, filters({ filterBy: 'status', filterValue: 'all' }))).items,
    ).toHaveLength(2);
  });

  /* Filtering on any other column leaves the active-only default in place —
     one filter at a time, and the default is not one of them. */
  test('keeps archived clients hidden while filtering on another column', async () => {
    const { id } = await createClient(clinicId, {
      fullName: 'أحمد',
      preferredLocale: 'ar',
      phone: '0599123456',
    });
    await archiveClient(clinicId, id);

    expect(
      (await listClients(clinicId, filters({ filterBy: 'phone', filterValue: '99123' }))).items,
    ).toHaveLength(0);
  });

  test('reports portal access on each row', async () => {
    const { id } = await createClient(clinicId, { fullName: 'سارة', preferredLocale: 'ar', email: 'sara@clinic.ps' });
    await issuePortalCredentials(clinicId, id, 'sara-portal-0001');
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

  test('orders by a chosen column in both directions', async () => {
    await createClient(clinicId, { fullName: 'جميل', preferredLocale: 'ar' });
    await createClient(clinicId, { fullName: 'أحمد', preferredLocale: 'ar' });
    await createClient(clinicId, { fullName: 'سارة', preferredLocale: 'ar' });

    const ascending = await listClients(clinicId, filters({ sort: 'fullName', dir: 'asc' }));
    const descending = await listClients(clinicId, filters({ sort: 'fullName', dir: 'desc' }));

    expect(ascending.items.map((client) => client.fullName)).toEqual(['أحمد', 'جميل', 'سارة']);
    expect(descending.items.map((client) => client.fullName)).toEqual(['سارة', 'جميل', 'أحمد']);
  });

  test('sorts newest first when no column is chosen', async () => {
    await createClient(clinicId, { fullName: 'الأول', preferredLocale: 'ar' });
    await createClient(clinicId, { fullName: 'الثاني', preferredLocale: 'ar' });

    const result = await listClients(clinicId, filters());
    expect(result.items[0]?.fullName).toBe('الثاني');
  });

  /**
   * A blank is missing, not "smallest". Flipping the direction to find the As
   * must not put eleven dashes at the top of the page instead.
   */
  test('keeps clients with no phone number last in both directions', async () => {
    await createClient(clinicId, { fullName: 'بلا رقم', preferredLocale: 'ar' });
    await createClient(clinicId, { fullName: 'سارة', preferredLocale: 'ar', phone: '0599000001' });
    await createClient(clinicId, { fullName: 'أحمد', preferredLocale: 'ar', phone: '0599000002' });

    for (const dir of ['asc', 'desc'] as const) {
      const result = await listClients(clinicId, filters({ sort: 'phone', dir }));
      expect(result.items.at(-1)?.phone).toBeNull();
    }
  });

  /**
   * The sort key picks an ORDER BY, so anything outside the allowlist has to be
   * impossible rather than merely unlikely.
   */
  test('falls back to the default order for an unknown sort column', async () => {
    await createClient(clinicId, { fullName: 'الأول', preferredLocale: 'ar' });
    await createClient(clinicId, { fullName: 'الثاني', preferredLocale: 'ar' });

    const result = await listClients(clinicId, filters({ sort: 'password); drop table clients--' }));
    expect(result.items.map((client) => client.fullName)).toEqual(['الثاني', 'الأول']);
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
