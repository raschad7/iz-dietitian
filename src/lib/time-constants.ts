/**
 * Time constants the database schema and the pure booking validator must agree
 * on, in a module that imports nothing.
 *
 * They cannot simply live in one place and be imported by the other: the schema
 * pulls in Drizzle, and `src/features/booking/validation.ts` is deliberately
 * free of database imports so it can run in the browser and under `bun test`.
 * The same reasoning gave `src/lib/auth-constants.ts` its existence — a value
 * two layers share, owned by neither.
 *
 * Change one of these and the check constraints, the grid geometry and the
 * validator all move together.
 */

/** The calendar's quantum: dragging snaps to it, and it is the shortest booking. */
export const SLOT_MINUTES = 15;

export const MINUTES_PER_DAY = 24 * 60;
