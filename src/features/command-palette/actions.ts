'use server';

import { z } from 'zod';

import { type Locale } from '@/i18n/routing';
import { requireStaffClinic } from '@/lib/session';

import { listPaletteClients, searchClientsForPalette } from './queries';
import { type PaletteClient } from './types';

/**
 * The palette's reads.
 *
 * A server action is a public endpoint. Neither of these is guarded by the
 * layout that renders the rail — that guard protects a page render, not a POST
 * — so both re-verify the session and take their clinic from it rather than
 * from anything the caller sent. `requireStaffClinic` is the only source of a
 * clinic id in this file, and there is no parameter that could override it.
 */

/**
 * A single query field's contents, bounded.
 *
 * The cap is not about the database — `ilike` on a folded column does not care
 * — it is about not accepting an unbounded string from an unauthenticated-until
 * -checked endpoint. 120 characters is longer than any name a person types
 * looking for someone.
 */
const querySchema = z.string().max(120);

/**
 * Find subscribers by name.
 *
 * Returns `[]` for anything the schema refuses rather than throwing. The caller
 * is a keystroke handler: a rejected query means "no matches", which the list
 * already knows how to draw, and an exception there would surface as an unhandled
 * rejection in the browser for what is only ever a typo or a paste.
 */
export async function searchClientsAction(locale: Locale, q: string): Promise<PaletteClient[]> {
  const { clinicId } = await requireStaffClinic(locale);

  const parsed = querySchema.safeParse(q);
  if (!parsed.success) return [];

  return searchClientsForPalette(clinicId, parsed.data);
}

/**
 * Who this clinic has, for the picker to open on.
 *
 * A separate action rather than `searchClientsAction(locale, '')`, because that
 * one answers a blank query with `[]` on purpose — see the note on
 * `listPaletteClients`. Two callers wanting opposite things from an empty
 * string is exactly the case for two functions.
 */
export async function listClientsAction(locale: Locale): Promise<PaletteClient[]> {
  const { clinicId } = await requireStaffClinic(locale);
  return listPaletteClients(clinicId);
}
