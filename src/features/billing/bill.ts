import type { useTranslations } from 'next-intl';

import type { Locale } from '@/i18n/routing';
import { formatDayMonthYear, stripBidiMarks } from '@/lib/format';

import { formatAmount, sumAmounts, subscriberTotals, type SubscriberTotals } from './money';
import { PAYMENT_METHODS, type PaymentMethod } from './schema';

/**
 * A bill is a ledger row read as a document.
 *
 * **Nothing new is written when a bill is produced.** Recording a charge or a
 * payment already inserts exactly one row that says who, how much, what for and
 * when; a bill is that row printed on paper with the clinic's name above it. A
 * second `bills` table would be a copy of facts `client_charges` and
 * `client_payments` already hold, and the only way a copy can be wrong is
 * silently — the same argument the schema makes for not storing totals.
 *
 * So this module has no writer. It turns rows into {@link BillEntry} values,
 * gives each one a number a person can quote down the phone, and leaves the
 * ledger alone.
 */

/**
 * The `billing` namespace's translator, whichever side of the app asked for it.
 *
 * `useTranslations('billing')` in a component and `getTranslations({ namespace:
 * 'billing' })` in a route handler return the same typed function, and this is
 * that type — so the menu and the PDF can share the code below and a key that
 * does not exist in the catalogue is still a compile error in both.
 */
export type BillTranslator = ReturnType<typeof useTranslations<'billing'>>;

/** Which side of the ledger a bill came from. */
export type BillKind = 'charge' | 'payment';

/**
 * One printable operation.
 *
 * Charges and payments are two tables with different columns, and this is the
 * shape they have in common once each is asked the four questions a bill asks:
 * when, how much, what for, and who wrote it down. `kind` keeps the difference
 * that matters — money owed versus money received — instead of flattening two
 * opposite events into one indistinguishable list.
 */
export type BillEntry = {
  id: string;
  kind: BillKind;
  /** `YYYY-MM-DD`. The day of the service, or the day the money moved. */
  occurredOn: string;
  /** Minor units. Negative only on a payment, where it means a refund. */
  amountMinor: number;
  /**
   * What a charge was for, in the language it was typed in. `null` on a
   * payment: a payment's description is its method, which is a separate field
   * precisely because it is a fixed set and this is free text.
   */
  description: string | null;
  /** `cash` | `transfer` | `card` | `other` on a payment, `null` on a charge. */
  method: string | null;
  /**
   * Which of the clinic's services a charge was for — `monthly`, `quarterly`,
   * `consultation` — and `null` on a payment, or on a charge typed in freehand
   * before the services existed.
   *
   * `string` rather than `BillingService`, following the column it comes from:
   * the list of services grows, and a row naming one this build has never heard
   * of is a fact about the past, not a parse error. Read it through
   * `isBillingService` or `isSubscriptionService`.
   *
   * It is what `subscriptionStanding` reads to say whether a subscriber is
   * inside a term — see `subscription.ts` — which is why the Bills screen needs
   * no second query to draw that column.
   */
  service: string | null;
  note: string | null;
  /** When the row was entered, which is not when the money moved. */
  createdAt: Date;
};

/**
 * The number printed on a bill, derived from the row rather than stored.
 *
 * Eight characters, split in the middle: `1F3A-9C2E`.
 *
 * **Why not a sequence.** A `bill_no serial` column would need a migration, a
 * per-clinic counter to stop clinic A's numbering leaking clinic B's volume,
 * and a story for what happens when a row is deleted. It would also be a second
 * identity for something that already has one. This is a function of the row's
 * id, so the same bill reprints with the same number for ever and nothing has
 * to be written to hand one out.
 *
 * ## What eight characters cost
 *
 * The number used to carry the side of the ledger and the date —
 * `CHG-20260824-1F3A9C` — and neither survives the length. Both are still on
 * the bill itself and in the row beside it, which is where a reader was going
 * to look anyway; what is lost is being able to tell a charge from a payment
 * from the reference alone, quoted out of context.
 *
 * What is kept is the part that matters: 8 hex characters is one of
 * 4,294,967,296 values, taken from the head of a random UUID. A clinic would
 * have to record on the order of ten thousand bills before there was even a one
 * in a hundred chance of any two sharing a number — and the two would still be
 * separate rows under separate ids, with only the printed reference colliding.
 *
 * ## The dash
 *
 * The eight characters are one group of four, a dash, and another four. A run
 * of eight is read as one long thing and copied out wrong; two groups of four
 * are read as two, which is how a card number, an IBAN and a licence key are
 * all written and for the same reason. The dash is a separator, not a field —
 * nothing is encoded on either side of it.
 *
 * Latin digits and `A`-`F` in both languages, deliberately. A reference read
 * out on the phone or written on a receipt has to survive being said in either
 * one, and a number that changes shape with the interface language is not a
 * reference.
 */
export function billNumber(entry: Pick<BillEntry, 'id'>): string {
  const hex = entry.id.replaceAll('-', '').slice(0, 8).toUpperCase();

  return `${hex.slice(0, 4)}-${hex.slice(4)}`;
}

/**
 * Newest first, and stable when two land on the same day.
 *
 * The date is a `date`, so a subscriber billed and paid on one afternoon has
 * two entries the date alone cannot order. `createdAt` breaks the tie in the
 * order they were entered, which is the order they happened; the id breaks a
 * tie in that, so the list is identical on every render and the printed
 * statement matches the dropdown a reader is looking at.
 */
export function compareEntries(a: BillEntry, b: BillEntry): number {
  if (a.occurredOn !== b.occurredOn) return a.occurredOn < b.occurredOn ? 1 : -1;

  const created = b.createdAt.getTime() - a.createdAt.getTime();
  if (created !== 0) return created;

  return a.id < b.id ? 1 : -1;
}

/**
 * Each bill's place in the subscriber's own ledger — 1 for the first one they
 * were ever billed or paid, counting up.
 *
 * The short number a person says out loud. `billNumber` is the reference that
 * survives being written on a receipt and quoted a year later, and it is
 * eighteen characters long; nobody reads that across a desk. "The fourth one"
 * is what they say, and this is what makes that unambiguous on screen.
 *
 * **Counted from the oldest, not the newest.** The list is drawn newest-first,
 * so numbering it in the order it is displayed would renumber every bill the
 * subscriber has every time a new one is recorded — a receipt printed on Monday
 * would disagree with the screen on Tuesday. Counting forward from the first
 * bill means a number, once given, is never taken back.
 *
 * One sequence over the whole ledger rather than one per kind: a charge and a
 * payment that both called themselves "3" would need the row beside them to say
 * which "3" they were, and the point of this column is to be sayable on its own.
 *
 * Returned as a map rather than as a field on the entry, because it is a fact
 * about the *set* — no row can know its own position — and computing it where
 * the set is known keeps it from being derived twice and disagreeing.
 */
export function batchNumbers(entries: readonly BillEntry[]): Map<string, number> {
  const oldestFirst = [...entries].sort(compareEntries).reverse();

  return new Map(oldestFirst.map((entry, index) => [entry.id, index + 1]));
}

/** The totals a statement foots to, summed from the entries it actually lists. */
export function entryTotals(entries: readonly BillEntry[]): SubscriberTotals {
  const charged = sumAmounts(entries.filter((entry) => entry.kind === 'charge').map((entry) => entry.amountMinor));
  const paid = sumAmounts(entries.filter((entry) => entry.kind === 'payment').map((entry) => entry.amountMinor));

  return subscriberTotals(charged, paid);
}

/**
 * The file a browser saves the PDF as.
 *
 * ASCII only, and built from the bill number rather than the subscriber's name:
 * an Arabic name in a `Content-Disposition` header has to be RFC 5987 encoded
 * to survive, and half the tools that later receive the file mangle it anyway.
 * The number is the reference the clinic quotes, so it is also the name.
 *
 * `BILL-` in front of it, which the number itself no longer carries. Eight hex
 * characters are a fine reference on a page that says what they refer to, and a
 * poor file name in a folder of thirty downloads that does not.
 */
export function billFileName(entry: Pick<BillEntry, 'id'>): string {
  return `BILL-${billNumber(entry)}.pdf`;
}

/** The statement's file name — one subscriber's whole ledger. */
export function statementFileName(clientId: string, today: string): string {
  return `STATEMENT-${today.replaceAll('-', '')}-${clientId.replaceAll('-', '').slice(0, 6).toUpperCase()}.pdf`;
}

/**
 * One entry as the two lines a menu row shows: what it was, and how much.
 *
 * Shared by the dropdown and the PDF so a bill a reader picked from the menu
 * cannot describe itself differently once it is on paper. `t` is passed in
 * rather than imported, because this runs both inside React and inside a route
 * handler — see {@link BillTranslator}.
 *
 * A payment is named by its method, and `method` is free text in the database
 * (see the column's own comment), so a value the catalogue has no word for
 * falls back to "other" rather than printing a raw key on a receipt.
 */
function asMethod(method: string | null): PaymentMethod {
  return PAYMENT_METHODS.find((known) => known === method) ?? 'other';
}

export function describeEntry(
  entry: BillEntry,
  locale: Locale,
  t: BillTranslator,
): { title: string; date: string; amount: string } {
  const title =
    entry.kind === 'charge'
      ? (entry.description ?? t('bills.charge'))
      : t(`methods.${asMethod(entry.method)}`);

  return {
    title,
    /*
      Midday, not midnight. `occurredOn` is a plain `date` — a day, with no
      instant in it — and reading it as `00:00Z` puts it in the previous day for
      any zone behind UTC. Noon is the hour no time zone can push across a date
      boundary.
    */
    date: formatDayMonthYear(locale, `${entry.occurredOn}T12:00:00Z`),
    /*
      Stripped, because both of these are shown inside elements that have
      already declared their direction — a `dir="ltr"` cell on screen, a PDF
      with no bidi engine at all. See `stripBidiMarks`.
    */
    amount: stripBidiMarks(formatAmount(locale, entry.amountMinor)),
  };
}

/**
 * What a bill is called when it is **sent** rather than downloaded.
 *
 * The two names differ on purpose, and the reason is the channel rather than
 * taste. {@link billFileName} and {@link statementFileName} go out in a
 * `Content-Disposition` header, where an Arabic name has to be RFC 5987
 * encoded to survive and gets mangled by half the tools that later touch the
 * file — so they are ASCII references. A name sent to WhatsApp travels as JSON
 * in a request body: it arrives as typed, and it lands in a chat where the
 * person reading it knows their own name and not a hex reference.
 *
 * So this is the human name — "سارة خالد - دفعة 3" — for the one channel that
 * can carry one.
 *
 * **Arabic, whatever language the dietitian is working in.** The file is read
 * by the patient, not by the person who pressed the button, and it lands in a
 * chat beside a message that is already Arabic by the same rule — see
 * `PATIENT_MESSAGE_LOCALE`. A staff member in the English UI sending an
 * Arabic-speaking subscriber a file called "payment 3" would be the one part of
 * that exchange written for the wrong reader.
 *
 * The digits stay Latin, which is the project's rule everywhere a number is
 * written (`nu-latn` in `src/lib/format.ts`) and is what keeps a folder of
 * these sorting in the order they were sent.
 *
 * The number is the subscriber's own running count from {@link batchNumbers},
 * not the hex reference: it is what makes a folder of these sort and read as a
 * sequence, which is the whole reason a file has a name.
 *
 * ⚠ It says **دفعة** whatever the operation was, because that is what the
 * clinic calls these. A charge sent on its own will also arrive as "دفعة N";
 * the document itself says which it is.
 */
export function sentBillFileName(clientName: string, number: number): string {
  return `${sanitizeFileName(clientName)} - دفعة ${number}.pdf`;
}

/** The whole account, sent — "سارة خالد - سجل الدفعات". */
export function sentStatementFileName(clientName: string): string {
  return `${sanitizeFileName(clientName)} - سجل الدفعات.pdf`;
}

/**
 * Strips what a file system will not take, and nothing else.
 *
 * A name is a person's name: the Arabic stays, the spaces stay. What goes is
 * the set Windows and POSIX refuse — a slash in a name would read as a folder
 * on the receiving phone — plus the runs of whitespace that a trimmed-down name
 * can leave behind.
 */
function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim();

  /* A record with no usable name still has to produce a file, and it is read
     by the same person as the rest of the name. */
  return cleaned || 'فاتورة';
}
