import { sql } from 'drizzle-orm';

import { clients } from '@/db/schema';

/**
 * The client's position in their own clinic, counted from 0.
 *
 * This is what makes a patient's colour *theirs* and nobody else's. The colour
 * used to be hashed from the client id, and a hash cannot promise what a colour
 * code has to: two ids can land a fraction of a degree apart on the wheel, which
 * is not a near-miss but the same colour. An index cannot — distinct clients
 * hold distinct positions, so `patientHue` can hand out the ten palette colours
 * and then the mixes between them without ever repeating one.
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
/**
 * ## The outer columns are qualified by hand, and have to be
 *
 * `${clients.clinicId}` looks like the right way to name the outer row and is
 * not: Drizzle renders a column reference *unqualified* — plain `"clinic_id"` —
 * whenever the surrounding statement has only one table it could belong to. In
 * ordinary SQL that is fine. Inside this subquery it is silently catastrophic,
 * because there are now two tables in scope and the unqualified name binds to
 * the nearest one, which is `seq_peer`:
 *
 * ```sql
 * where seq_peer.clinic_id = "clinic_id"                            -- seq_peer's own
 *   and (seq_peer.created_at, seq_peer.id) < ("created_at", "id")   -- itself
 * ```
 *
 * Every row is then compared against itself, the predicate is never true, and
 * the count is `0` for every client in the clinic. It does not error, return
 * null, or fail a type check — it returns a number, the right shape, and the
 * same one every time. That shipped, and the whole patient-colour scheme
 * quietly collapsed onto hue 0: every card, every avatar, every glyph the same
 * colour, which reads as "the colours don't work" rather than as a broken join.
 *
 * Spelling `"clients"` out is what forces the outer binding. It holds for every
 * caller because none of them alias the table — `getClient` and
 * `listBookableClients` select from it directly, and `listAppointments` joins it
 * under its own name. A caller that aliased `clients` would break this, and
 * would do so the same silent way, so alias it here too if that ever happens.
 */
export const clientSeq = sql<number>`(
  select count(*)
  from ${clients} as seq_peer
  where seq_peer.clinic_id = "clients"."clinic_id"
    and (seq_peer.created_at, seq_peer.id) < ("clients"."created_at", "clients"."id")
)`.mapWith(Number);
