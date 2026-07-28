import { sql } from 'drizzle-orm';

import { db } from '@/db';

/**
 * Truncates every table in `public`, discovered at runtime rather than listed,
 * so adding a table never silently leaves data behind between tests.
 */
export async function resetDatabase(): Promise<void> {
  const rows = await db.execute<{ tablename: string }>(sql`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `);

  const names = rows.map((row) => `"${row.tablename}"`).join(', ');
  if (names.length === 0) return;

  await db.execute(sql.raw(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`));
}
