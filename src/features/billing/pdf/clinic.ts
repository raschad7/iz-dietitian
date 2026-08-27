import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { clinics, practitioners } from '@/db/schema';

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
): Promise<{
  name: string;
  phone: string | null;
  address: string | null;
  /** The clinic's mark as a `data:` URL, or `null`. See the `logo` column. */
  logo: string | null;
  /**
   * Who practises here, for a bill that names the dietitian as well as the
   * clinic — many do, and a patient reads the name they were seen by.
   *
   * The clinic's *first* practitioner by creation, which for every clinic in
   * this app today is its only one: a clinic is created by one person signing
   * up. A clinic that grows a second would want the one who saw the patient,
   * which is a fact about the appointment rather than about the clinic, and is
   * a different read for a different day. `null` where there is no row at all.
   */
  doctorName: string | null;
} | null> {
  const [row] = await db
    .select({
      name: clinics.name,
      phone: clinics.phone,
      address: clinics.address,
      logo: clinics.logoUrl,
      doctorName: practitioners.name,
    })
    .from(clinics)
    /* A left join, so a clinic with no practitioner row still heads its own
       bills — the name is an addition to the page, not a condition of it. */
    .leftJoin(practitioners, eq(practitioners.clinicId, clinics.id))
    .where(eq(clinics.id, clinicId))
    .orderBy(practitioners.createdAt)
    .limit(1);

  return row ?? null;
}
