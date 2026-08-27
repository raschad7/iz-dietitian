import { billResponse, renderBill } from '@/features/billing/pdf/render';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';

/**
 * `GET /app/clients/bills/<clientId>/print` — one subscriber's whole ledger as
 * a PDF.
 *
 * A route handler rather than a page, because the answer is a file: a page
 * would have to render HTML that then fetches this anyway. It sits under the
 * Bills segment so the URL says what it prints, and so the staff guard that
 * covers the rest of `/app` covers it too — `requireStaffClinic` is what makes
 * `clientId` in the path safe, since it is the caller's own clinic that scopes
 * the read and not the id they typed.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string; clientId: string }> },
) {
  /* `params` is wider than `resolveLocale` asks for, which is fine — it takes
     the locale off and 404s an unknown one before anything is read. */
  const resolved = await resolveLocale(params);
  const { clientId } = await params;
  const { clinicId } = await requireStaffClinic(resolved);

  const bill = await renderBill({ clinicId, clientId, locale: resolved });

  /* Not this clinic's subscriber, or no such subscriber — the same answer for
     both, so a 404 cannot be used to probe another clinic's register. */
  if (!bill) return new Response(null, { status: 404 });

  return billResponse(bill);
}
