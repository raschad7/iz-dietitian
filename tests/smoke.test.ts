import { describe, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { db, schema } from '@/db';

import { resetDatabase } from './helpers';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is not set — tests/setup.ts should have caught this already.');

const expectedDatabaseName = new URL(testDatabaseUrl).pathname.slice(1);

describe('test harness', () => {
  test('connects to the test database, not the dev database', async () => {
    const [row] = await db.execute<{ current_database: string }>(sql`SELECT current_database()`);
    if (!row) throw new Error('SELECT current_database() returned no rows');

    expect(row.current_database).toBe(expectedDatabaseName);
  });

  test('resetDatabase empties every table', async () => {
    await db.insert(schema.user).values({
      id: 'smoke-test-user',
      name: 'Smoke Test',
      email: 'smoke-test@example.com',
    });

    await resetDatabase();

    const remaining = await db.select().from(schema.user);
    expect(remaining.length).toBe(0);
  });
});
