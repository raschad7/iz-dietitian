import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

import { assertTestDatabaseUrl } from '../scripts/database-safety';
import { loadTestEnv } from './env';

/**
 * Seeds the real Postgres test database once, before any E2E spec runs —
 * exactly the "database -> backend -> progress calculation -> frontend"
 * chain the tests are meant to exercise, with nothing mocked or hardcoded on
 * the UI side.
 *
 * Reuses the same fixture helpers `bun test`'s integration suite already
 * trusts (`tests/helpers.ts`) rather than re-deriving them, and the same
 * safety check `tests/setup.ts` runs before touching the database.
 */
export default async function globalSetup(): Promise<void> {
  const testEnv = loadTestEnv();
  const url = testEnv.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is missing from .env.test.local.');

  assertTestDatabaseUrl(url);
  process.env.DATABASE_URL = url;
  process.env.BETTER_AUTH_SECRET = testEnv.BETTER_AUTH_SECRET ?? '';

  // Everything below touches `@/db`, which reads DATABASE_URL at
  // module-evaluation time — so it is imported dynamically, after the two
  // lines above run, the same ordering `tests/setup.ts` enforces for
  // `bun test`.
  const { db } = await import('../src/db');
  const { eq } = await import('drizzle-orm');
  const { clients, weeklyPlanMeals, weeklyPlans } = await import('../src/db/schema');
  const { createTestClient, createTestClinic, resetDatabase } = await import('../tests/helpers');
  const { issuePortalCredentials, replacePortalPassword } = await import(
    '../src/features/clients/portal-credentials'
  );
  const { wallClockIn } = await import('../src/features/booking/completed');
  const { DISPLAY_TIME_ZONE } = await import('../src/lib/format');
  const { weekDates } = await import('../src/features/portal/check-ins');

  await resetDatabase();

  const clinicId = await createTestClinic('Playwright Test Clinic');
  const clientId = await createTestClient(clinicId, 'Portal E2E Client');

  const now = wallClockIn(DISPLAY_TIME_ZONE);
  const dates = weekDates(now.date);
  const weekStartDate = dates[0] ?? now.date;
  const todayIndex = dates.indexOf(now.date);
  const dayOfWeek = todayIndex === -1 ? 0 : todayIndex;

  const [plan] = await db
    .insert(weeklyPlans)
    .values({
      clinicId,
      clientId,
      weekStartDate,
      status: 'published',
      publishedAt: new Date(),
      kcalTargetSnapshot: 1800,
    })
    .returning({ id: weeklyPlans.id });
  if (!plan) throw new Error('E2E seed failed: insert into weekly_plans returned no row');

  // Two meals today — enough to tick one, leave one, and see a real 50%
  // rather than either the empty or the fully-complete edge case.
  const insertedMeals = await db
    .insert(weeklyPlanMeals)
    .values([
      { planId: plan.id, dayOfWeek, slotKey: 'breakfast', label: 'Breakfast', timeOfDay: '08:00', budgetKcal: 400 },
      { planId: plan.id, dayOfWeek, slotKey: 'lunch', label: 'Lunch', timeOfDay: '13:00', budgetKcal: 600 },
    ])
    .returning({ id: weeklyPlanMeals.id });
  if (insertedMeals.length !== 2) throw new Error('E2E seed failed: expected two meals for today');

  const username = 'e2e-portal-client';
  const password = 'E2ePortalClient-2026!';

  const issued = await issuePortalCredentials(clinicId, clientId, username);
  if (!issued.ok) throw new Error(`E2E seed failed to issue portal credentials: ${issued.code}`);

  const [row] = await db.select({ userId: clients.userId }).from(clients).where(eq(clients.id, clientId));
  if (!row?.userId) throw new Error('E2E seed failed: issued client has no linked user id');

  // Skip the first-login "set your own password" screen — that flow has its
  // own manual test coverage (see the test plan). This suite is about the
  // meal-completion -> progress pipeline, which needs a client already past
  // that step, the same way a returning client would be.
  await replacePortalPassword(row.userId, password);

  writeFileSync(
    resolve(__dirname, '.seed.json'),
    JSON.stringify({ clinicId, clientId, username, password, today: now.date }, null, 2),
  );
}
