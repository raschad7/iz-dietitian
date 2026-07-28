import { describe, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { db } from '@/db';

import { resetDatabase } from './helpers';

describe('test harness', () => {
  test('connects to the test database, not the dev database', async () => {
    const rows = await db.execute<{ current_database: string }>(sql`SELECT current_database()`);
    expect(rows[0]?.current_database).toBe('dietitian_test');
  });

  test('resetDatabase runs without error', async () => {
    await resetDatabase();
  });
});
