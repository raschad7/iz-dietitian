import { renderToBuffer } from '@react-pdf/renderer';
import { getTranslations } from 'next-intl/server';
import type { NextRequest } from 'next/server';

import { describeEntry } from '@/features/billing/bill';
import { BillsExportDocument } from '@/features/billing/export/document';
import { loadBillsExport, type ExportRange } from '@/features/billing/export/data';
import {
  isExportFormat,
  isExportLevel,
  toCsv,
  toTable,
  toXlsx,
  type ExportFormat,
  type ExportHeadings,
} from '@/features/billing/export/formats';
import { registerFonts } from '@/features/billing/pdf/fonts';
import { resolveLocale } from '@/i18n/params';
import { DISPLAY_TIME_ZONE } from '@/lib/format';
import { wallClockIn } from '@/features/booking/completed';
import { requireStaffClinic } from '@/lib/session';

/**
 * The bills export, as a file.
 *
 * A route and not a server action, because the answer is a download. An action
 * would have to hand bytes back to the browser for a script to turn into a
 * blob and click for the reader — three steps to arrive at what a link already
 * does, and a `Content-Disposition` the browser understands natively. See the
 * dialog, which is a plain form with `method="get"`.
 *
 * ## What is checked, and where
 *
 * `requireStaffClinic` first, so the clinic is the caller's own before a row is
 * read — the export reads every subscriber a clinic has, which makes this the
 * broadest read in the app and the one least forgiving of a missing guard.
 *
 * Everything after it is a search param, so everything after it is refused
 * rather than trusted: an unknown format or level falls back rather than
 * reaching a writer, and the dates are only ever compared as strings against
 * `YYYY-MM-DD` days from the ledger.
 */
const MIME: Record<ExportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

/**
 * The window a `period` asks for, resolved against the clinic’s own today.
 *
 * The presets are turned into dates here rather than in the dialog, because
 * "this month" is a question about the clinic’s calendar and the browser
 * asking it may be in another timezone — a dietitian on a laptop still set to
 * where they were last week would otherwise export a different month than the
 * one the register is keeping.
 *
 * `custom` is the only one that reads `from` and `to`, and both are optional:
 * a from with no to is everything since, which is a reasonable thing to ask
 * for and costs nothing to allow.
 */
function rangeFor(period: string | null, from: string | null, to: string | null): ExportRange {
  const today = wallClockIn(DISPLAY_TIME_ZONE).date;
  const [year, month] = today.split('-').map(Number) as [number, number, number];

  if (period === 'custom') return { from: day(from), to: day(to) };

  if (period === 'thisMonth') {
    return { from: `${today.slice(0, 7)}-01`, to: today };
  }

  if (period === 'last3') {
    /* Two whole months back plus this one, from the 1st — "last 3 months" on a
       ledger means three calendar months, not ninety days. */
    const start = new Date(Date.UTC(year, month - 3, 1));

    return { from: start.toISOString().slice(0, 10), to: today };
  }

  if (period === 'thisYear') return { from: `${year}-01-01`, to: today };

  /* `all`, and anything unrecognised. An open window is the safe fallback: it
     returns more than was asked for rather than silently less. */
  return { from: null, to: null };
}

/** A `YYYY-MM-DD` from the query, or null for an open end. */
function day(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ locale: string }> },
) {
  const locale = await resolveLocale(params);
  const { clinicId } = await requireStaffClinic(locale);

  const query = request.nextUrl.searchParams;

  const format = isExportFormat(query.get('format')) ? (query.get('format') as ExportFormat) : 'csv';
  const level = isExportLevel(query.get('level')) ? query.get('level')! : 'detailed';

  const range = rangeFor(query.get('period'), query.get('from'), query.get('to'));

  const t = await getTranslations({ locale, namespace: 'billing' });

  const data = await loadBillsExport(clinicId, range, {
    charge: t('export.kindCharge'),
    payment: t('export.kindPayment'),
    /* The same describer the record's own ledger uses, so a line reads the same
       in a file as it does on the screen it was exported from. */
    describe: (entry) => describeEntry(entry, locale, t).title,
  });

  const headings: ExportHeadings = {
    client: t('export.columns.client'),
    phone: t('export.columns.phone'),
    kind: t('export.columns.kind'),
    description: t('export.columns.description'),
    date: t('export.columns.date'),
    amount: t('export.columns.amount'),
    entries: t('export.columns.entries'),
    charged: t('fields.totalPrice'),
    paid: t('fields.totalPayment'),
    remaining: t('fields.remaining'),
  };

  const today = wallClockIn(DISPLAY_TIME_ZONE).date;
  const fileName = `${t('export.fileName')} - ${today}.${format}`;

  const body = await render(format, data, level as 'detailed' | 'summary', headings, {
    locale,
    title: t('export.title'),
    subtitle:
      range.from || range.to
        ? `${range.from ?? '…'} – ${range.to ?? '…'}`
        : t('export.duration.all'),
    empty: t('export.empty'),
    sheet: t('export.sheetName'),
  });

  return new Response(body as BodyInit, {
    headers: {
      'Content-Type': MIME[format],
      /*
        `attachment`, where the bill routes use `inline`. A statement is opened
        and read; this is a file taken away to a spreadsheet, and opening a
        workbook in a browser tab helps nobody.

        The filename is quoted and also sent as `filename*`, because it holds
        Arabic in an Arabic clinic and the unquoted form is ASCII-only.
      */
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Cache-Control': 'no-store',
    },
  });
}

async function render(
  format: ExportFormat,
  data: Awaited<ReturnType<typeof loadBillsExport>>,
  level: 'detailed' | 'summary',
  headings: ExportHeadings,
  words: { locale: 'en' | 'ar'; title: string; subtitle: string; empty: string; sheet: string },
): Promise<Uint8Array> {
  if (format === 'csv') return toCsv(data, level, headings);
  if (format === 'xlsx') return toXlsx(data, level, headings, words.sheet);

  /* Idempotent, and called here rather than at import — see `fonts.ts`. */
  registerFonts();

  const table = toTable(data, level, headings);

  return renderToBuffer(
    <BillsExportDocument
      locale={words.locale}
      title={words.title}
      subtitle={words.subtitle}
      head={table.head}
      body={table.body}
      emptyLabel={words.empty}
    />,
  );
}
