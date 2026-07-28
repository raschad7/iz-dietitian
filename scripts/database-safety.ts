/**
 * Shared guard for anything that connects to the test database and performs a
 * destructive operation against it: the `bun test` preload (`tests/setup.ts`)
 * and the test-database migrator (`scripts/db-migrate-test.ts`).
 *
 * Mirrors the `LOCAL_HOSTS` / `NODE_ENV` checks already in `scripts/db-reset.ts`
 * — keep the two in sync if either one changes. It is not a refactor of that
 * file; `db-reset.ts` guards `DATABASE_URL` against a completely different
 * mistake (resetting a real database) and is out of scope here.
 *
 * The query-string check exists because postgres.js does not treat a
 * connection URL's pathname as authoritative. Any query-string key it doesn't
 * recognize — `?database=…` included — is layered on top of the parsed
 * connection options and wins. In `node_modules/postgres/src/connection.js`
 * the startup message is built from
 * `Object.assign({ user, database, ... }, options.connection)`, so
 * `new URL(url).pathname` can name one database while postgres.js actually
 * connects to another. Rejecting any query string at all closes that gap
 * without having to enumerate which keys are dangerous.
 *
 * This function is still only a check on the connection *string* — it cannot
 * prove which database postgres.js actually reaches. The one check that
 * can't be fooled is the `current_database()` query in `tests/helpers.ts`'s
 * `resetDatabase()`, which runs immediately before the destructive TRUNCATE.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function assertTestDatabaseUrl(url: string): void {
  const parsed = new URL(url);

  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(`Refusing to use a non-local database (host: ${parsed.hostname}).`);
  }

  if (parsed.search !== '') {
    throw new Error(
      `Refusing a database URL with a query string (${parsed.search}): postgres.js lets an unrecognized query-string key such as ?database=… override the connection, so the pathname alone cannot be trusted.`,
    );
  }

  const databaseName = parsed.pathname.slice(1);
  if (!databaseName.endsWith('_test')) {
    throw new Error(`Refusing to use "${databaseName}": the database name must end in _test.`);
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to use the test database with NODE_ENV=production.');
  }
}
