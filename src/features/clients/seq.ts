import { sql } from 'drizzle-orm';

import { clients } from '@/db/schema';

/**
 * The client's position in their own clinic, counted from 0.
 *
 * This is what makes a patient's colour *theirs* and nobody else's. The colour
 * used to be hashed from the client id, and a hash cannot promise what a colour
 * code has to: two ids can land a fraction of a degree apart on the wheel, which
 * is not a near-miss but the same colour. An index cannot — distinct clients
 * have distinct positions, so they have distinct hues, and `patientHue` spaces
 * those positions as far apart as a sequence can be spaced.
 *
 * **Ordered by `created_at, id`, so the numbering only ever appends.** A client
 * registered today is given the next free position and nobody else moves. Any
 * ordering that a client could change — by name, most obviously — would renumber
 * half the clinic the first time somebody married, and repaint a calendar staff
 * had learned to read at a glance. `id` breaks the tie when two records share a
 * timestamp, so the order is total rather than merely mostly decided.
 *
 * It counts *every* client of the clinic, archived ones included. They are
 * excluded from the booking picker but their past appointments are still drawn,
 * and skipping them here would shift every position after each one.
 *
 * A correlated subquery rather than a window function: the rank has to be the
 * same number whatever the surrounding query selects, filters or orders by, and
 * `row_number()` is computed over that query's own result set.
 *
 * ## Why it lives in `clients` and not in `booking`
 *
 * It was a private constant in `src/features/booking/queries.ts` for as long as
 * the calendar was the only surface that drew a patient in colour. It is not a
 * booking fact — it is a property of the client, and the moment the client
 * record wanted to show the same person in the same colour, a second copy of
 * this subquery was the alternative. Two copies of "the client's position" is
 * exactly the drift the note above is about: they would agree until one of them
 * was edited, and then two screens would draw the same patient differently with
 * nothing to say which was right.
 *
 * `booking` already reads from this feature (`./search`), so the dependency runs
 * the way it already ran.
 */
export const clientSeq = sql<number>`(
  select count(*)
  from ${clients} as seq_peer
  where seq_peer.clinic_id = ${clients.clinicId}
    and (seq_peer.created_at, seq_peer.id) < (${clients.createdAt}, ${clients.id})
)`.mapWith(Number);
