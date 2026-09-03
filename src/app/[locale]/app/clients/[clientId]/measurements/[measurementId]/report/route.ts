import { getMeasurementFile } from '@/features/measurements/queries';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';

/**
 * `GET /app/clients/<clientId>/measurements/<measurementId>/report` — the
 * original body composition report a measurement was read from.
 *
 * A route handler rather than a page, for the reason
 * `docs/architecture.md` gives for the printable bills: the answer is a file, a
 * server action cannot return one for the browser to open, and a page that
 * rendered HTML which then fetched the bytes would be this endpoint with a page
 * in front of it.
 *
 * `requireStaffClinic` is what makes the ids in the path safe — the read is
 * scoped by the caller's own clinic, not by what they typed. A measurement
 * belonging to another clinic is a 404, the same answer as one that does not
 * exist, so this cannot be used to probe another clinic's records.
 *
 * ⚠ **Staff only, and deliberately not reachable from the portal.** The sheet
 * carries visceral fat, a metabolic age and the machine's own scores — figures
 * that need a clinician to interpret them. What a client may see is the
 * portal's own summary, and it is a different thing on purpose.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string; clientId: string; measurementId: string }> },
) {
  const locale = await resolveLocale(params);
  const { clientId, measurementId } = await params;
  const { clinicId } = await requireStaffClinic(locale);

  const file = await getMeasurementFile(clinicId, clientId, measurementId);
  if (!file) return new Response(null, { status: 404 });

  const bytes = Buffer.from(file.content, 'base64');

  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': file.contentType,
      'Content-Length': String(bytes.byteLength),
      /*
        `inline`, so the browser opens it rather than dropping it in Downloads —
        the dietitian pressing "open the original" wants to look at it beside
        the figures, not collect a file. The name still travels for a save.
      */
      'Content-Disposition': `inline; filename="${encodeURIComponent(file.fileName)}"`,
      // A clinical record, never a shared cache.
      'Cache-Control': 'private, no-store',
    },
  });
}
