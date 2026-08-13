import { beforeEach, describe, expect, test } from 'bun:test';

import { db } from '@/db';
import { weeklyPlans } from '@/db/schema';

import { createTestClinic, resetDatabase } from '../../../tests/helpers';
import { archiveClient, createClient } from './mutations';
import { issuePortalCredentials } from './portal-credentials';
import { CLIENTS_PAGE_SIZE, getClient, listClients } from './queries';
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

  /* The two halves of the register are two routes, not a filter: `/app/clients`
     passes `active` and `/app/clients/archived` passes `archived`. Neither list
     ever mixes the two, which is what let the status column go. */
  test('reads one status at a time, active by default', async () => {
    const { id } = await createClient(clinicId, { fullName: 'أحمد', preferredLocale: 'ar' });
    await createClient(clinicId, { fullName: 'سارة', preferredLocale: 'ar' });
    await archiveClient(clinicId, id);

    const active = await listClients(clinicId, filters());
    expect(active.items).toHaveLength(1);
    expect(active.items[0]?.fullName).toBe('سارة');

    const archived = await listClients(clinicId, filters({ status: 'archived' }));
    expect(archived.items).toHaveLength(1);
    expect(archived.items[0]?.fullName).toBe('أحمد');
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

  /*
    Sized off `CLIENTS_PAGE_SIZE` rather than off the literal it happens to be.
    This test hardcoded 20 and 25, so changing the register's page size failed
    it on the arithmetic rather than on the behaviour — which is the one thing a
    pagination test should not do.
  */
  test('paginates', async () => {
    const REMAINDER = 5;

    for (let index = 0; index < CLIENTS_PAGE_SIZE + REMAINDER; index += 1) {
      await createClient(clinicId, { fullName: `عميل ${index}`, preferredLocale: 'ar' });
    }

    const first = await listClients(clinicId, filters());
    expect(first.items).toHaveLength(CLIENTS_PAGE_SIZE);
    expect(first.total).toBe(CLIENTS_PAGE_SIZE + REMAINDER);
    expect(first.pageCount).toBe(2);

    const second = await listClients(clinicId, filters({ page: '2' }));
    expect(second.items).toHaveLength(REMAINDER);
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

describe('listClients plan status', () => {
  /** A plan for one client's week. Only the columns this column reads matter. */
  const addPlan = (
    clientId: string,
    weekStartDate: string,
    status: string,
    clinic = clinicId,
    updatedAt?: Date,
  ) =>
    db.insert(weeklyPlans).values({
      clinicId: clinic,
      clientId,
      weekStartDate,
      status,
      kcalTargetSnapshot: 2000,
      ...(updatedAt ? { updatedAt } : {}),
    });

  test('is null for a client who has never had a plan', async () => {
    await createClient(clinicId, { fullName: 'سارة', preferredLocale: 'ar' });

    const result = await listClients(clinicId, filters());
    expect(result.items[0]?.latestPlanStatus).toBeNull();
  });

  /**
   * The point of the column: it reports where the client stands *now*, not
   * whether they have ever been planned for. A dietitian scanning the register
   * on a Sunday is looking for the drafts they left open, and a client whose
   * newest week is a draft must not read as live because an older week was
   * published.
   */
  test('reports the newest week, not an older published one', async () => {
    const { id } = await createClient(clinicId, { fullName: 'سارة', preferredLocale: 'ar' });
    await addPlan(id, '2026-01-04', 'published');
    await addPlan(id, '2026-01-11', 'draft');

    const result = await listClients(clinicId, filters());
    expect(result.items[0]?.latestPlanStatus).toBe('draft');
  });

  test('reports a published newest week as published', async () => {
    const { id } = await createClient(clinicId, { fullName: 'سارة', preferredLocale: 'ar' });
    await addPlan(id, '2026-01-04', 'draft');
    await addPlan(id, '2026-01-11', 'published');

    const result = await listClients(clinicId, filters());
    expect(result.items[0]?.latestPlanStatus).toBe('published');
  });

  test('resolves the status per client rather than sharing one across the page', async () => {
    const planned = await createClient(clinicId, { fullName: 'أحمد', preferredLocale: 'ar' });
    await createClient(clinicId, { fullName: 'زياد', preferredLocale: 'ar' });
    await addPlan(planned.id, '2026-01-11', 'published');

    const result = await listClients(clinicId, filters({ sort: 'fullName', dir: 'asc' }));
    const byName = new Map(result.items.map((item) => [item.fullName, item.latestPlanStatus]));
    expect(byName.get('أحمد')).toBe('published');
    expect(byName.get('زياد')).toBeNull();
  });

  /**
   * Publishing a plan archives whatever was published for the same week, and
   * both writes happen inside one transaction — `publishPlan` calls `new Date()`
   * for the archived sibling and again for the plan it is publishing, which in a
   * fast transaction is the same millisecond. So `updatedAt` cannot be relied on
   * to separate them, and a register row that resolved to the archived sibling
   * would tell the dietitian "No plan" about a client whose plan is live.
   *
   * The two rows are given the same `updatedAt` deliberately: that is the state
   * the publish path actually produces, and with it the ordering is a coin toss
   * unless the query rules archived rows out.
   */
  test('reports the live plan when an archived sibling shares its week and timestamp', async () => {
    const { id } = await createClient(clinicId, { fullName: 'سارة', preferredLocale: 'ar' });
    const sameInstant = new Date('2026-01-12T09:00:00.000Z');
    await addPlan(id, '2026-01-11', 'archived', clinicId, sameInstant);
    await addPlan(id, '2026-01-11', 'published', clinicId, sameInstant);

    const result = await listClients(clinicId, filters());
    expect(result.items[0]?.latestPlanStatus).toBe('published');
  });

  /**
   * An archived plan is a superseded one, so it says nothing about where the
   * client stands. The newest week that still counts is the older draft.
   */
  test('looks past an archived newest week to the newest week that counts', async () => {
    const { id } = await createClient(clinicId, { fullName: 'سارة', preferredLocale: 'ar' });
    await addPlan(id, '2026-01-04', 'draft');
    await addPlan(id, '2026-01-11', 'archived');

    const result = await listClients(clinicId, filters());
    expect(result.items[0]?.latestPlanStatus).toBe('draft');
  });

  /**
   * The id list passed to the lookup is not a tenancy check on its own. A plan
   * row carries its own `clinic_id`, and a client id colliding across clinics
   * must not pull another clinic's plan into this register.
   */
  test('ignores a plan belonging to another clinic', async () => {
    const otherClinicId = await createTestClinic('Other Clinic');
    const { id } = await createClient(clinicId, { fullName: 'سارة', preferredLocale: 'ar' });
    await addPlan(id, '2026-01-11', 'published', otherClinicId);

    const result = await listClients(clinicId, filters());
    expect(result.items[0]?.latestPlanStatus).toBeNull();
  });
});

describe('getClient', () => {
  test('returns the full record', async () => {
    const { id } = await createClient(clinicId, { fullName: 'سارة', preferredLocale: 'ar', sex: 'female' });

    const client = await getClient(clinicId, id);
    expect(client?.fullName).toBe('سارة');
    expect(client?.sex).toBe('female');
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
