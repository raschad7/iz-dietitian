import { sql } from 'drizzle-orm';

import { db } from '@/db';
import { clients, clinics, practitioners } from '@/db/schema';
import { normalizeForSearch } from '@/features/clients/search';

/**
 * Creates a clinic and returns its id.
 *
 * Clients are scoped to a clinic, so every integration test needs at least one —
 * and the isolation tests need two.
 */
export async function createTestClinic(name = 'Test Clinic'): Promise<string> {
  const [clinic] = await db.insert(clinics).values({ name }).returning({ id: clinics.id });

  if (!clinic) throw new Error('insert into clinics returned no row');

  return clinic.id;
}

/** A bookable practitioner. Appointments need one, and overlap tests need two. */
export async function createTestPractitioner(clinicId: string, name = 'Dr Test'): Promise<string> {
  const [row] = await db.insert(practitioners).values({ clinicId, name }).returning({ id: practitioners.id });

  if (!row) throw new Error('insert into practitioners returned no row');

  return row.id;
}

/**
 * A client, inserted directly rather than through `createClient` so that the
 * booking tests do not fail for a reason belonging to the clients feature.
 */
export async function createTestClient(clinicId: string, fullName = 'Test Client'): Promise<string> {
  const [row] = await db
    .insert(clients)
    .values({ clinicId, fullName, searchName: normalizeForSearch(fullName) })
    .returning({ id: clients.id });

  if (!row) throw new Error('insert into clients returned no row');

  return row.id;
}

/**
 * Truncates every table in `public`, discovered at runtime rather than listed,
 * so adding a table never silently leaves data behind between tests.
 *
 * `scripts/database-safety.ts` already validates the connection string before
 * anything connects, but a validated string is not proof of which database
 * postgres.js actually reached (see that file for why). The server itself is
 * the only source of truth, so re-check `current_database()` right here,
 * immediately before the destructive TRUNCATE, and refuse unless its name
 * ends in `_test`.
 */
export async function resetDatabase(): Promise<void> {
  const [current] = await db.execute<{ current_database: string }>(sql`SELECT current_database()`);
  if (!current) throw new Error('SELECT current_database() returned no rows');

  if (!current.current_database.endsWith('_test')) {
    throw new Error(`Refusing to truncate database "${current.current_database}": its name must end in _test.`);
  }

  const rows = await db.execute<{ tablename: string }>(sql`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `);

  if (rows.length === 0) return;

  const tables = sql.join(
    rows.map((row) => sql.identifier(row.tablename)),
    sql`, `,
  );

  await db.execute(sql`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}
