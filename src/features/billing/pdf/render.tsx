import { renderToBuffer } from '@react-pdf/renderer';
import { getTranslations } from 'next-intl/server';

import {
  batchNumbers,
  billFileName,
  sentBillFileName,
  sentStatementFileName,
  statementFileName,
  type BillEntry,
} from '@/features/billing/bill';
import { clientBillingRecord } from '@/features/billing/queries';
import { wallClockIn } from '@/features/booking/completed';
import { DISPLAY_TIME_ZONE } from '@/lib/format';
import { formatPhoneDisplay } from '@/lib/phone-format';
import type { Locale } from '@/i18n/routing';

import { BillDocument } from './bill-document';
import { billingClinicHeader } from './clinic';
import { registerFonts } from './fonts';

/**
 * Turning a subscriber's ledger into a PDF, for the two routes that serve one.
 *
 * Both routes do the same four things — prove the subscriber belongs to the
 * caller's clinic, read the ledger, render, answer with the bytes — and differ
 * only in how many entries they keep. That difference is the `entryId`
 * argument; everything else lives here so the two cannot drift apart on the
 * things that matter, which are the tenant check and the headers.
 */

/**
 * What a route hands back: the bytes, and what to call the file — twice.
 *
 * `fileName` is the ASCII reference a `Content-Disposition` header can carry.
 * `sentFileName` is the name a person reads in a chat. Both are derived here,
 * where the subscriber and the entry's own number are already in hand; deriving
 * either at a call site would mean loading the ledger a second time to count.
 */
export type RenderedBill = { body: Uint8Array; fileName: string; sentFileName: string };

/**
 * Renders one subscriber's bills.
 *
 * `entryId` picks a single operation; omitting it prints the statement — every
 * operation on the account. Returns `null` when the subscriber is not this
 * clinic's, or when a named entry is not on their ledger, so the route answers
 * 404 in both cases. **A wrong id and someone else's id give the same answer**,
 * deliberately: telling them apart would confirm that another clinic's bill
 * exists.
 */
export async function renderBill({
  clinicId,
  clientId,
  entryId,
  locale,
}: {
  clinicId: string;
  clientId: string;
  entryId?: string;
  locale: Locale;
}): Promise<RenderedBill | null> {
  const [record, clinic, t] = await Promise.all([
    clientBillingRecord(clinicId, clientId),
    billingClinicHeader(clinicId),
    getTranslations({ locale, namespace: 'billing' }),
  ]);

  if (!record || !clinic) return null;

  let entries: BillEntry[] = record.entries;

  if (entryId) {
    const found = record.entries.find((entry) => entry.id === entryId);
    if (!found) return null;
    entries = [found];
  }

  /* Idempotent, and called here rather than at import so nothing depends on
     module evaluation order. See `fonts.ts`. */
  registerFonts();

  const today = wallClockIn(DISPLAY_TIME_ZONE).date;

  const body = await renderToBuffer(
    <BillDocument
      locale={locale}
      variant={entryId ? 'single' : 'statement'}
      entries={entries}
      t={t}
      header={{
        clinicName: clinic.name,
        clinicPhone: formatPhoneDisplay(clinic.phone) || null,
        clinicAddress: clinic.address,
        clientName: record.client.fullName,
        clientPhone: formatPhoneDisplay(record.client.phone) || null,
        issuedOn: today,
      }}
    />,
  );

  const single = entryId ? entries[0] : undefined;

  /* The subscriber's own running count, from the *whole* ledger rather than
     the one entry being printed — a bill is "payment 3" because it is the
     third thing on this account, and slicing the list first would make every
     single-bill send "payment 1". */
  const number = single ? (batchNumbers(record.entries).get(single.id) ?? 1) : 0;

  return {
    body,
    fileName: single ? billFileName(single) : statementFileName(clientId, today),
    sentFileName: single
      ? sentBillFileName(record.client.fullName, number)
      : sentStatementFileName(record.client.fullName),
  };
}

/**
 * The response both routes send.
 *
 * `inline` rather than `attachment`, and the printers depend on it: they are
 * plain links that open the bill in the browser's own PDF viewer, where the
 * preview is the document and Ctrl+P is the print dialog — see
 * `PrintBillButton`. `attachment` would drop a file in Downloads instead and
 * leave the reader to find it. The file still carries a name, for when it is
 * saved from the viewer.
 *
 * `no-store`, because a bill is a snapshot of a ledger that changes the moment
 * another payment is recorded, and a cached one would print yesterday's balance
 * with today's date on it.
 */
export function billResponse({ body, fileName }: RenderedBill): Response {
  return new Response(body as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  });
}
