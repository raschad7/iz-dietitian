import { billResponse, renderBill } from '@/features/billing/pdf/render';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';

/**
 * `GET /app/clients/bills/<clientId>/print/<entryId>` — one bill.
 *
 * The same handler as the statement beside it with one entry kept instead of
 * all of them; see `renderBill`. `entryId` is a charge id or a payment id, and
 * which of the two it is does not have to be said in the URL: the ledger read
 * has already merged both tables, so the id is looked for in the subscriber's
 * own entries and an id that belongs to neither is a 404 like any other.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string; clientId: string; entryId: string }> },
) {
  /* `params` is wider than `resolveLocale` asks for, which is fine — it takes
     the locale off and 404s an unknown one before anything is read. */
  const resolved = await resolveLocale(params);
  const { clientId, entryId } = await params;
  const { clinicId } = await requireStaffClinic(resolved);

  const bill = await renderBill({ clinicId, clientId, entryId, locale: resolved });

  if (!bill) return new Response(null, { status: 404 });

  return billResponse(bill);
}
