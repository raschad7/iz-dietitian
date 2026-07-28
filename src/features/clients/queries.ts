import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm';

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

function buildFilter(input: ListClientsInput): SQL | undefined {
  const conditions: SQL[] = [];

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

  if (conditions.length === 0) return undefined;

  return and(...conditions);
}

export async function listClients(input: ListClientsInput): Promise<ClientListResult> {
  const where = buildFilter(input);

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
    .orderBy(desc(clients.createdAt))
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
 */
export async function getClient(id: string): Promise<ClientDetail | null> {
  const parsed = clientIdSchema.safeParse(id);
  if (!parsed.success) return null;

  const [row] = await db.select().from(clients).where(eq(clients.id, parsed.data)).limit(1);
  if (!row) return null;

  return { ...row, hasPortalAccess: row.userId !== null };
}
