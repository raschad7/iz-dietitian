import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { clinics } from '@/db/schema';

/**
 * The three columns that head a bill: who is billing, and how to reach them.
 *
 * Its own read rather than `getClinicProfile`, which returns the opening hours,
 * the onboarding timestamp and the practitioner beside them — none of which a
 * receipt prints. Its own read rather than `getClinicBrand` too: that one is
 * deliberately two columns because the rail runs it on every page load, and
 * widening it to serve this route would put the address on every navigation.
 *
 * The logo is not fetched. `logo_url` holds a data URI of roughly 40 KB, and a
 * bill is a document a clinic prints in a batch — the name in type at the head
 * of the page identifies it, and dragging the image through every render is a
 * cost paid on every bill for something a printer renders as a grey smudge.
 */
export async function billingClinicHeader(
  clinicId: string,
): Promise<{ name: string; phone: string | null; address: string | null } | null> {
  const [row] = await db
    .select({ name: clinics.name, phone: clinics.phone, address: clinics.address })
    .from(clinics)
    .where(eq(clinics.id, clinicId))
    .limit(1);

  return row ?? null;
}
