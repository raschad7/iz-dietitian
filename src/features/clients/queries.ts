import { and, asc, count, desc, eq, ilike, or, sql, type AnyColumn, type SQL } from 'drizzle-orm';

import { db } from '@/db';
import { clients, type Client } from '@/db/schema';

import { normalizeForSearch } from './search';
import { clientIdSchema, type ListClientsInput } from './schema';

/**
 * Reads for the clients feature. Imports nothing from Next.js so that the tests
 * can call these directly — see the note at the top of `mutations.ts`.
 */

export const CLIENTS_PAGE_SIZE = 20;

export type ClientListItem = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  status: string;
  hasPortalAccess: boolean;
};

export type ClientListResult = {
  items: ClientListItem[];
  total: number;
  page: number;
  pageCount: number;
};

export type ClientDetail = Client & { hasPortalAccess: boolean };

/**
 * Every read is scoped to one clinic.
 *
 * `clinicId` is a required first argument rather than an optional filter so that
 * forgetting it is a type error, not a silent cross-tenant leak.
 */
function buildFilter(clinicId: string, input: ListClientsInput): SQL | undefined {
  const conditions: SQL[] = [eq(clients.clinicId, clinicId)];

  if (input.status !== 'all') {
    conditions.push(eq(clients.status, input.status));
  }

  if (input.q) {
    // The name is matched against the normalised column using the same folding
    // applied when it was stored; phone and email are matched as typed.
    const name = `%${normalizeForSearch(input.q)}%`;
    const raw = `%${input.q.trim()}%`;

    const matches = or(ilike(clients.searchName, name), ilike(clients.phone, raw), ilike(clients.email, raw));
    if (matches) conditions.push(matches);
  }

  return and(...conditions);
}

/**
 * Sort key → the column it actually orders by.
 *
 * A lookup rather than a dynamic column reference: the key is validated by
 * `listClientsSchema` before it gets here, and this keeps the set of orderable
 * columns readable in one place.
 *
 * `fullName` sorts on `searchName`, the folded copy the search already matches
 * against — sorting on the raw name would order "آدم" by its diacritics and put
 * an unaccented duplicate somewhere else entirely.
 *
 * `portalAccess` is not a column; it is `userId IS NOT NULL`, which is exactly
 * what the list renders.
 */
const SORT_COLUMNS: Record<ListClientsInput['sort'], AnyColumn | SQL> = {
  fullName: clients.searchName,
  phone: clients.phone,
  email: clients.email,
  status: clients.status,
  portalAccess: sql`(${clients.userId} is not null)`,
  createdAt: clients.createdAt,
};

/**
 * Nullable columns — phone and email — are pushed to the end in **both**
 * directions. A blank is not "smallest"; it is missing, and a reader flipping
 * the direction to find the As is not asking to be shown eleven dashes first.
 */
const NULLABLE_SORTS = new Set<ListClientsInput['sort']>(['phone', 'email']);

function buildOrder(input: ListClientsInput): SQL[] {
  const column = SORT_COLUMNS[input.sort];
  const direction = input.dir === 'asc' ? asc : desc;

  const order: SQL[] = [];
  if (NULLABLE_SORTS.has(input.sort)) order.push(sql`${column} is null`);
  order.push(direction(column));

  // A stable tiebreak, so two clients registered with the same status (or the
  // same missing phone number) do not swap places between page loads.
  if (input.sort !== 'createdAt') order.push(desc(clients.createdAt));

  return order;
}

export async function listClients(clinicId: string, input: ListClientsInput): Promise<ClientListResult> {
  const where = buildFilter(clinicId, input);

  const [totals] = await db.select({ value: count() }).from(clients).where(where);
  const total = totals?.value ?? 0;

  const rows = await db
    .select({
      id: clients.id,
      fullName: clients.fullName,
      phone: clients.phone,
      email: clients.email,
      status: clients.status,
      userId: clients.userId,
    })
    .from(clients)
    .where(where)
    .orderBy(...buildOrder(input))
    .limit(CLIENTS_PAGE_SIZE)
    .offset((input.page - 1) * CLIENTS_PAGE_SIZE);

  return {
    items: rows.map(({ userId, ...rest }) => ({ ...rest, hasPortalAccess: userId !== null })),
    total,
    page: input.page,
    pageCount: Math.max(1, Math.ceil(total / CLIENTS_PAGE_SIZE)),
  };
}

/**
 * Validates the id before querying, so a malformed route param becomes a 404
 * rather than a PostgreSQL error on the failed uuid cast.
 *
 * A client belonging to another clinic returns null — indistinguishable from a
 * client that does not exist, which is deliberate: a different response would
 * confirm the id is real to someone guessing.
 */
export async function getClient(clinicId: string, id: string): Promise<ClientDetail | null> {
  const parsed = clientIdSchema.safeParse(id);
  if (!parsed.success) return null;

  const [row] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, parsed.data), eq(clients.clinicId, clinicId)))
    .limit(1);

  if (!row) return null;

  return { ...row, hasPortalAccess: row.userId !== null };
}
