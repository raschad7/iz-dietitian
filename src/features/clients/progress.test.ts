import { beforeEach, describe, expect, test } from 'bun:test';

import { db } from '@/db';
import { clientPlanAdherence } from '@/db/schema';
import { createTestClient, createTestClinic, resetDatabase } from '../../../tests/helpers';

import { getClientWeekProgress } from './progress';

/**
 * Integration tests against `TEST_DATABASE_URL`.
 *
 * Seeds `client_plan_adherence` directly rather than through a generated plan
 * and `toggleMealCompletion` — the arithmetic those rows feed
 * (`summariseAdherenceForDates`) is already covered end to end in
 * `portal/adherence.test.ts`, so what is worth a database round trip here is
 * the composition around it: that a week reads back the rows it was given,
 * that a week nobody has touched reports the empty state rather than a
 * fabricated figure, and — the one property only the database can prove —
 * that a clinic can never read another clinic's client through this read.
 */

const SUNDAY = '2026-08-02';
const MONDAY = '2026-08-03';
const TUESDAY = '2026-08-04';
const WEDNESDAY = '2026-08-05';

let clinicId: string;
let clientId: string;

beforeEach(async () => {
  await resetDatabase();
  clinicId = await createTestClinic();
  clientId = await createTestClient(clinicId);
});

async function seedDay(date: string, completedMeals: number, totalMeals: number, level: string): Promise<void> {
  await db.insert(clientPlanAdherence).values({ clinicId, clientId, date, level, completedMeals, totalMeals });
}

async function seedDayForClinic(
  forClinicId: string,
  date: string,
  completedMeals: number,
  totalMeals: number,
  level: string,
): Promise<void> {
  await db
    .insert(clientPlanAdherence)
    .values({ clinicId: forClinicId, clientId, date, level, completedMeals, totalMeals });
}

describe('getClientWeekProgress', () => {
  test('summarises the week from its own client_plan_adherence rows', async () => {
    await seedDay(SUNDAY, 4, 4, 'full');
    await seedDay(MONDAY, 2, 4, 'partial');
    await seedDay(TUESDAY, 0, 4, 'missed');

    const progress = await getClientWeekProgress(clinicId, clientId, SUNDAY, WEDNESDAY);

    expect(progress.hasData).toBe(true);
    expect(progress.dates).toHaveLength(7);
    expect(progress.recordedCount).toBe(3);
    expect(progress.fullyCompletedCount).toBe(1);
    expect(progress.totalCompletedMeals).toBe(6);
    expect(progress.totalPlannedMeals).toBe(12);
    // Mean of the three reported days' own fractions: 1, 0.5, 0.
    expect(progress.averageFraction).toBeCloseTo(0.5, 6);

    expect(progress.days[0]?.state).toBe('full');
    expect(progress.days[1]?.state).toBe('partial');
    expect(progress.days[2]?.state).toBe('missed');
    // Wednesday is `today` in this call, regardless of it having no report.
    expect(progress.days[3]?.state).toBe('today');
    expect(progress.days[4]?.state).toBe('future');
  });

  test('a week nobody has touched reports the empty state, not a fabricated figure', async () => {
    const progress = await getClientWeekProgress(clinicId, clientId, SUNDAY, WEDNESDAY);

    expect(progress.hasData).toBe(false);
    expect(progress.averageFraction).toBeNull();
    expect(progress.recordedCount).toBe(0);
    expect(progress.totalCompletedMeals).toBe(0);
    expect(progress.totalPlannedMeals).toBe(0);
  });

  test('scopes strictly by clinicId, not by clientId alone', async () => {
    const otherClinicId = await createTestClinic('Other Clinic');

    // A row tagged with a different clinic than the one asking — the shape a
    // bug or a cross-tenant leak would take, since `client_plan_adherence`
    // carries `clinicId` as a plain denormalised column rather than deriving
    // it from `clientId` at read time.
    await seedDayForClinic(otherClinicId, SUNDAY, 4, 4, 'full');

    const asked = await getClientWeekProgress(clinicId, clientId, SUNDAY, WEDNESDAY);
    expect(asked.hasData).toBe(false);

    const owner = await getClientWeekProgress(otherClinicId, clientId, SUNDAY, WEDNESDAY);
    expect(owner.hasData).toBe(true);
  });
});
