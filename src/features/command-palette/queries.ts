import { and, asc, eq, ilike } from 'drizzle-orm';

import { db } from '@/db';
import { clients } from '@/db/schema';
import { normalizeForSearch } from '@/features/clients/search';
import { clientSeq } from '@/features/clients/seq';

import { PALETTE_CLIENT_LIMIT, type PaletteClient } from './types';

/**
 * Find subscribers by name, within one clinic.
 *
 * **The match runs on `search_name`, not `full_name`.** That column is the
 * folded copy written on every create and update — see
 * `features/clients/search.ts` — and folding the query with the same function
 * is what makes `احمد` find a client stored as `أحمد`. Arabic is this product's
 * default locale; a search that misses the commonest spelling variant is a
 * broken feature, not an edge case.
 *
 * **Active clients only.** An archived client is deliberately hard to reach:
 * archiving is how a dietitian takes someone out of their working set, and a
 * quick-jump list that hands them back undoes it. The register still finds them
 * through its own status filter, which is where that decision belongs.
 *
 * A blank query returns nothing rather than the first eight of the roster. An
 * alphabetical slice of a register answers no question anybody asked; the
 * palette shows its actions and screens until a name is typed.
 */
export async function searchClientsForPalette(
  clinicId: string,
  q: string,
  limit: number = PALETTE_CLIENT_LIMIT,
): Promise<PaletteClient[]> {
  const needle = normalizeForSearch(q);
  if (!needle) return [];

  return db
    .select({
      id: clients.id,
      fullName: clients.fullName,
      phone: clients.phone,
      seq: clientSeq,
    })
    .from(clients)
    .where(
      and(
        eq(clients.clinicId, clinicId),
        eq(clients.status, 'active'),
        ilike(clients.searchName, `%${needle}%`),
      ),
    )
    /*
      On the folded column, so the order agrees with what was matched. Sorting
      on `full_name` would interleave `أحمد` and `احمد` unpredictably — two
      spellings of one name landing either side of a third person.
    */
    .orderBy(asc(clients.searchName))
    .limit(limit);
}

/**
 * The first page of the register, alphabetically — the picker's opening list.
 *
 * **Deliberately the opposite policy to `searchClientsForPalette` above.** A
 * blank query at the *root* of the palette means "I have not asked anything
 * yet", and answering it with an arbitrary slice of the roster would be noise.
 * A blank query inside the client picker means "show me who I can choose", and
 * answering that with nothing is a dialog that asks for a decision while
 * offering no options.
 *
 * Ordered on the folded column for the same reason the search is: so a name
 * spelled `أحمد` and one spelled `احمد` sort together rather than either side
 * of a third person.
 */
export async function listPaletteClients(
  clinicId: string,
  limit: number = PALETTE_CLIENT_LIMIT,
): Promise<PaletteClient[]> {
  return db
    .select({
      id: clients.id,
      fullName: clients.fullName,
      phone: clients.phone,
      seq: clientSeq,
    })
    .from(clients)
    .where(and(eq(clients.clinicId, clinicId), eq(clients.status, 'active')))
    .orderBy(asc(clients.searchName))
    .limit(limit);
}
