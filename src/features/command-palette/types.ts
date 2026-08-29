/**
 * The palette's shared shapes, in a module with no database import.
 *
 * `PaletteClient` lived in `queries.ts` first, and that was a bundling bug
 * rather than a tidiness one: the palette is a client component, `queries.ts`
 * imports `@/db`, and a client module that names *anything* in it drags the
 * `postgres` driver into the browser graph — where it asks for `fs` and the
 * build fails outright. An `import type` should erase, but the safe rule is the
 * one this file exists to enforce: a type crossing the server/client line lives
 * where nothing else does.
 *
 * The same reason `features/clients/types.ts` exists.
 */

/**
 * A subscriber as the palette draws one: a name, a number, and where to go.
 *
 * Deliberately three columns and not the register's `ClientListItem`. That type
 * carries plan status, adherence and a billing state, each of which costs a
 * join — work worth doing for a screen that displays them and pure waste for a
 * row that shows a name and a phone number and then navigates away.
 */
export type PaletteClient = {
  id: string;
  fullName: string;
  phone: string | null;
  /**
   * Their position in the clinic, which is what their colour is derived from —
   * `patientTone` in `features/booking/patient-color.ts`. Carried so the disc
   * beside a name here is the same hue as their appointment blocks and their
   * row in the register, rather than a fourth grey circle.
   */
  seq: number;
};

/**
 * How many rows the palette will show. Eight is what fits above the fold of the
 * list without the group below it — the destinations — being pushed out of
 * sight; a palette that has to be scrolled to reach navigation is a palette
 * that has stopped being faster than the rail.
 */
export const PALETTE_CLIENT_LIMIT = 8;
