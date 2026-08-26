import 'server-only';

import ExcelJS from 'exceljs';

import type { BillsExport, DetailRow, SummaryRow } from './data';

/** The three a clinic can ask for. */
export const EXPORT_FORMATS = ['csv', 'xlsx', 'pdf'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** Every bill listed, or one line a subscriber. */
export const EXPORT_LEVELS = ['detailed', 'summary'] as const;
export type ExportLevel = (typeof EXPORT_LEVELS)[number];

export function isExportFormat(value: unknown): value is ExportFormat {
  return EXPORT_FORMATS.some((format) => format === value);
}

export function isExportLevel(value: unknown): value is ExportLevel {
  return EXPORT_LEVELS.some((level) => level === value);
}

/**
 * The column headings, handed in already translated.
 *
 * A file is read by whoever the clinic sends it to, so the headings follow the
 * language the dietitian exported in rather than the patient locale the
 * WhatsApp templates are fixed to. Nobody outside the clinic sees this.
 */
export type ExportHeadings = {
  client: string;
  phone: string;
  kind: string;
  description: string;
  date: string;
  amount: string;
  entries: string;
  charged: string;
  paid: string;
  remaining: string;
};

/** Minor units as a plain decimal — a number in a file, not a formatted price. */
function major(minor: number): number {
  return minor / 100;
}

function detailColumns(h: ExportHeadings) {
  return [h.client, h.phone, h.kind, h.description, h.date, h.amount];
}

function summaryColumns(h: ExportHeadings) {
  return [h.client, h.phone, h.entries, h.charged, h.paid, h.remaining];
}

function detailCells(row: DetailRow): (string | number)[] {
  return [row.clientName, row.clientPhone ?? '', row.kind, row.description, row.occurredOn, major(row.amountMinor)];
}

function summaryCells(row: SummaryRow): (string | number)[] {
  return [
    row.clientName,
    row.clientPhone ?? '',
    row.entries,
    major(row.chargedMinor),
    major(row.paidMinor),
    major(row.remainingMinor),
  ];
}

function rowsFor(data: BillsExport, level: ExportLevel, h: ExportHeadings) {
  return level === 'detailed'
    ? { head: detailColumns(h), body: data.detail.map(detailCells) }
    : { head: summaryColumns(h), body: data.summary.map(summaryCells) };
}

/**
 * One CSV field, quoted only where it has to be.
 *
 * ⚠ **A leading `=`, `+`, `-` or `@` is prefixed with a quote.** A spreadsheet
 * treats those as the start of a formula, so a patient whose name a clinic
 * typed as `=Ahmad` would execute on open — the injection every CSV export
 * that skips this is vulnerable to. The apostrophe is the convention Excel and
 * Sheets both read as "this is text".
 */
function csvField(value: string | number): string {
  const text = String(value);
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;

  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/**
 * CSV, with a BOM.
 *
 * Excel on Windows reads a BOM-less file as the system codepage, which turns
 * every Arabic name in this clinic's register into mojibake. Three bytes fixes
 * it and nothing else reads them as content.
 */
export function toCsv(data: BillsExport, level: ExportLevel, h: ExportHeadings): Uint8Array {
  const { head, body } = rowsFor(data, level, h);
  const lines = [head, ...body].map((row) => row.map(csvField).join(','));

  return new TextEncoder().encode(`﻿${lines.join('\r\n')}\r\n`);
}

/**
 * A real spreadsheet: typed number cells, a frozen header, and columns wide
 * enough to read.
 *
 * The amounts are numbers rather than strings, which is the whole reason to
 * offer this over CSV — a column that sums in a pivot table is what an
 * accountant asked for. The date stays a plain `YYYY-MM-DD` string: Excel's
 * date parsing is locale-dependent and a clinic emailing this abroad would find
 * days and months swapped.
 */
export async function toXlsx(
  data: BillsExport,
  level: ExportLevel,
  h: ExportHeadings,
  sheetName: string,
): Promise<Uint8Array> {
  const { head, body } = rowsFor(data, level, h);

  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(sheetName);

  sheet.addRow(head);
  for (const row of body) sheet.addRow(row);

  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  /* Wide enough for the longest thing in each, capped so one long description
     cannot push the money columns off the screen. */
  sheet.columns.forEach((column, index) => {
    const longest = [head[index], ...body.map((row) => row[index])].reduce<number>(
      (width, cell) => Math.max(width, String(cell ?? '').length),
      0,
    );

    column.width = Math.min(Math.max(longest + 2, 10), 40);
  });

  const buffer = await book.xlsx.writeBuffer();

  return new Uint8Array(buffer);
}

/** The rows a PDF renderer needs, without it having to know the shapes above. */
export function toTable(
  data: BillsExport,
  level: ExportLevel,
  h: ExportHeadings,
): { head: string[]; body: string[][] } {
  const { head, body } = rowsFor(data, level, h);

  return { head, body: body.map((row) => row.map((cell) => String(cell))) };
}
