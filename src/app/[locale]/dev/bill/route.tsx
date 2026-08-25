import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { renderToBuffer } from '@react-pdf/renderer';

import type { BillEntry } from '@/features/billing/bill';
import { BillDocument } from '@/features/billing/pdf/bill-document';
import { registerFonts } from '@/features/billing/pdf/fonts';
import { billResponse } from '@/features/billing/pdf/render';
import { resolveLocale } from '@/i18n/params';

/**
 * The printed bill, against fixture data and without a session.
 *
 * `/{locale}/dev/bill` draws the statement; `?variant=single` draws one bill.
 *
 * The real routes sit behind `requireStaffClinic` and read a clinic's own
 * ledger, so the one document nobody can look at without logging in as a
 * dietitian with money on the books is the document most likely to be wrong —
 * Arabic that does not join, a total that does not foot, a column that runs off
 * the page. This renders the same component the real routes render, with rows
 * chosen to exercise what is hard: mixed Arabic and English descriptions, a
 * refund, a note, and a subscriber who has paid part of what they owe.
 *
 * Dev-only, like the shell and the gallery beside it: 404 in production, no
 * session guard, and no data access at all.
 */

const FIXTURES: BillEntry[] = [
  {
    id: '1f3a9c2e-0000-4000-8000-000000000001',
    kind: 'charge',
    occurredOn: '2026-08-24',
    amountMinor: 27000,
    description: 'زيارة متابعة',
    method: null,
    note: 'الشهر الثاني',
    createdAt: new Date('2026-08-24T09:00:00Z'),
  },
  {
    id: '9b2d7e11-0000-4000-8000-000000000002',
    kind: 'payment',
    occurredOn: '2026-08-20',
    amountMinor: 15000,
    description: null,
    method: 'cash',
    note: null,
    createdAt: new Date('2026-08-20T09:00:00Z'),
  },
  {
    id: '3c4d5e66-0000-4000-8000-000000000003',
    kind: 'charge',
    occurredOn: '2026-07-02',
    amountMinor: 45000,
    description: 'Monthly subscription — three sessions',
    method: null,
    note: null,
    createdAt: new Date('2026-07-02T09:00:00Z'),
  },
  {
    id: '7ae10b45-0000-4000-8000-000000000004',
    kind: 'payment',
    occurredOn: '2026-07-05',
    amountMinor: -7000,
    description: null,
    method: 'transfer',
    note: 'Refund for a cancelled session',
    createdAt: new Date('2026-07-05T09:00:00Z'),
  },
];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  if (process.env.NODE_ENV === 'production') notFound();

  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'billing' });
  const single = new URL(request.url).searchParams.get('variant') === 'single';

  registerFonts();

  const body = await renderToBuffer(
    <BillDocument
      locale={locale}
      variant={single ? 'single' : 'statement'}
      entries={single ? FIXTURES.slice(0, 1) : FIXTURES}
      t={t}
      header={{
        clinicName: locale === 'ar' ? 'عيادة قِوام للتغذية' : 'Qiwam Nutrition Clinic',
        clinicPhone: '+970 59-705-8996',
        clinicAddress: locale === 'ar' ? 'رام الله، فلسطين' : 'Ramallah, Palestine',
        clientName: locale === 'ar' ? 'محمد قنام' : 'Mohammad Qannam',
        clientPhone: '+970 59-123-4567',
        issuedOn: '2026-08-24',
      }}
    />,
  );

  /* The real routes' own response, headers included — a fixture that is
     served differently from the document it stands in for is not a fixture. */
  return billResponse({ body, fileName: single ? 'BILL-FIXTURE.pdf' : 'STATEMENT-FIXTURE.pdf' });
}
