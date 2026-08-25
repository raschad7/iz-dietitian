/**
 * The Bills table's columns.
 *
 * The list and the count, with no browser in them: the table shell renders on
 * the server and needs `COLUMN_COUNT` to size its empty state, so this file
 * carries no `'use client'` and no storage. The reader's own order — the part
 * that only exists in a browser — is `useBillsColumns` next door.
 */

/**
 * A column's identity — also its translation key under `billing.fields`.
 *
 * `numeric` means `dir="ltr"` and tabular figures, so a shekel amount reads
 * left-to-right and the digits line up down the column inside Arabic text.
 * Phone is one for the same reason the register isolates it: letting a number
 * inherit the Arabic direction moves a leading `+` to the wrong end.
 *
 * The order here is the default one, and it is the order the columns were asked
 * for: `name` leads, the money block runs together, and `status` closes the row
 * as the summary you land on rather than one of the figures being summarised.
 *
 * There is no `balance` column. The signed account position and `remaining`
 * differ in exactly one case — a subscriber who has paid ahead — and carrying
 * two money columns that agree on every other row spends width to say the same
 * thing twice. Credit still has somewhere to be read: the status chip says
 * `credit` in words, and the printed statement gives the figure.
 */
export const BILLS_COLUMNS = [
  { key: 'name', numeric: false },
  { key: 'totalPrice', numeric: true },
  { key: 'phone', numeric: true },
  { key: 'remaining', numeric: true },
  { key: 'totalPayment', numeric: true },
  { key: 'status', numeric: false },
] as const;

export type BillsColumn = (typeof BILLS_COLUMNS)[number];
export type BillsColumnKey = BillsColumn['key'];

/**
 * The actions column is not in the list above and cannot be dragged.
 *
 * It holds the row's charge, payment, print and disclosure controls, it has no
 * heading to grab, and a reader who dropped it into the middle of the figures
 * would have made the table worse in a way that is hard to undo. It stays at
 * the end. This count is also what a full-width row — the empty state, and the
 * opened ledger panel — has to span.
 */
export const COLUMN_COUNT = BILLS_COLUMNS.length + 1;
