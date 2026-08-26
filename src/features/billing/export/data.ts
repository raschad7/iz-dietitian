import 'server-only';

import { and, asc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { clients } from '@/db/schema';
import { compareEntries, type BillEntry } from '@/features/billing/bill';
import { ledgerByClient } from '@/features/billing/queries';

/**
 * What a bills export is made of, gathered once for every subscriber a clinic
 * has.
 *
 * ## Why the range decides lines and not totals
 *
 * `remainingMinor` is always the *whole* account's, whatever window was asked
 * for. A subscriber billed in March who paid in January owes nothing, and a
 * March-only figure that said otherwise would invite a dietitian to chase a
 * settled account off the back of a file they were told was authoritative.
 * Charged and paid are the window's, because those are answers to "what
 * happened in this period"; what is *left* is not a thing a period can have.
 *
 * ## Why it does not go through `listClients`
 *
 * That query is the register's, and the register is paged. An export is the
 * whole clinic by definition, and asking a pager for everything would mean
 * borrowing its filters and its sort to ignore both. Three columns straight
 * from the table is the smaller and the more honest read.
 */
export type ExportRange = { from: string | null; to: string | null };

/** One line of the detailed level: a bill, with the subscriber it belongs to. */
export type DetailRow = {
  clientName: string;
  clientPhone: string | null;
  /** `charge` or `payment`, already worded for the reader. */
  kind: string;
  /** What the charge was for, or how the money came in. */
  description: string;
  occurredOn: string;
  /** Minor units. Negative on a refund, as the ledger stores it. */
  amountMinor: number;
};

/** One line of the summary level: a subscriber, once, and where they stand. */
export type SummaryRow = {
  clientName: string;
  clientPhone: string | null;
  /** How many entries fell inside the window — the lines the detail would draw. */
  entries: number;
  chargedMinor: number;
  paidMinor: number;
  /** The whole account's, never the window's. See above. */
  remainingMinor: number;
};

export type BillsExport = {
  detail: DetailRow[];
  summary: SummaryRow[];
  range: ExportRange;
};

/** Whether a day falls inside the window, with either end left open. */
function inRange(day: string, range: ExportRange): boolean {
  if (range.from && day < range.from) return false;
  if (range.to && day > range.to) return false;

  return true;
}

/** Charged and paid across a set of entries, in minor units. */
function totals(entries: readonly BillEntry[]): { chargedMinor: number; paidMinor: number } {
  let chargedMinor = 0;
  let paidMinor = 0;

  for (const entry of entries) {
    if (entry.kind === 'charge') chargedMinor += entry.amountMinor;
    else paidMinor += entry.amountMinor;
  }

  return { chargedMinor, paidMinor };
}

/**
 * Every subscriber's bills, at both levels, for one clinic.
 *
 * Scoped to the clinic the caller was handed and nothing wider — the same rule
 * every other read in this feature follows.
 *
 * Subscribers with nothing in the window are dropped from both levels. An
 * export is a document somebody reads, and a hundred rows of zeroes for people
 * who were not billed this month makes the ones who were harder to find.
 */
export async function loadBillsExport(
  clinicId: string,
  range: ExportRange,
  words: {
    charge: string;
    payment: string;
    /** How a line is described — the caller's translator, applied per entry. */
    describe: (entry: BillEntry) => string;
  },
): Promise<BillsExport> {
  const roster = await db
    .select({ id: clients.id, fullName: clients.fullName, phone: clients.phone })
    .from(clients)
    .where(and(eq(clients.clinicId, clinicId), eq(clients.status, 'active')))
    .orderBy(asc(clients.fullName));

  const ledgers = await ledgerByClient(
    clinicId,
    roster.map((client) => client.id),
  );

  const detail: DetailRow[] = [];
  const summary: SummaryRow[] = [];

  for (const client of roster) {
    const entries = ledgers.get(client.id) ?? [];
    const window = entries.filter((entry) => inRange(entry.occurredOn, range));

    if (window.length === 0) continue;

    /* Oldest first in a file, where a ledger is read down the page the way a
       statement is. `compareEntries` sorts newest first for a screen, which is
       scanned for what happened last. */
    for (const entry of [...window].sort(compareEntries).reverse()) {
      detail.push({
        clientName: client.fullName,
        clientPhone: client.phone,
        kind: entry.kind === 'charge' ? words.charge : words.payment,
        description: words.describe(entry),
        occurredOn: entry.occurredOn,
        amountMinor: entry.amountMinor,
      });
    }

    const inWindow = totals(window);
    const whole = totals(entries);

    summary.push({
      clientName: client.fullName,
      clientPhone: client.phone,
      entries: window.length,
      chargedMinor: inWindow.chargedMinor,
      paidMinor: inWindow.paidMinor,
      /* Never negative: a subscriber in credit has nothing to collect, and a
         minus sign in a "still owed" column reads as a debt the wrong way
         round. That they are in credit is on their own statement. */
      remainingMinor: Math.max(0, whole.chargedMinor - whole.paidMinor),
    });
  }

  return { detail, summary, range };
}
