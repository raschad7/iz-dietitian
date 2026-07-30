import { beforeEach, describe, expect, test } from 'bun:test';

import { db } from '@/db';
import { weeklyPlans } from '@/db/schema';
import { createTestClient, createTestClinic, resetDatabase } from '../../../tests/helpers';

import { listPlannableClients } from './queries';

let clinicId: string;
let clientId: string;

beforeEach(async () => {
  await resetDatabase();
  clinicId = await createTestClinic();
  clientId = await createTestClient(clinicId, 'Test Client');
});

describe('listPlannableClients', () => {
  test('returns each client with the status and date of their latest plan', async () => {
    await db.insert(weeklyPlans).values([
      {
        clinicId,
        clientId,
        weekStartDate: '2026-07-19',
        status: 'published',
        kcalTargetSnapshot: 1800,
      },
      {
        clinicId,
        clientId,
        weekStartDate: '2026-07-26',
        status: 'draft',
        kcalTargetSnapshot: 1800,
      },
    ]);

    expect(await listPlannableClients(clinicId)).toEqual([
      {
        id: clientId,
        fullName: 'Test Client',
        color: '#64748b',
        hasProfile: false,
        latestPlanStatus: 'draft',
        latestWeekStartDate: '2026-07-26',
      },
    ]);
  });
});
