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
 *
 * The order here is the default one, and it is the order the columns were asked
 * for: `name` leads, `subscription` says what they are on, the money block runs
 * together, and `status` closes the row as the summary you land on rather than
 * one of the figures being summarised.
 *
 * `subscription` is the key; the heading over it reads **Remaining**, and the
 * cells under it are a count of days — see `BillsCell`.
 *
 * The money column two along answers to **Debt** ("الدين"), which is what
 * keeps the two apart: this one counts days, that one counts shekels, and for
 * one release they were both headed "Remaining".
 *
 * It sits beside the name rather than among the figures because it is not one: it is who this person currently is to the clinic — inside a term,
 * out of one, or never on a subscription at all — read from their newest
 * subscription charge by `subscriptionStanding`. A reader chasing renewals can
 * still drag it wherever they want it.
 *
 * **There is no `phone` column either.** It was here, formatted to one shape
 * down the page, and it answered a question this screen is not asked: Bills is
 * read to find out who owes what, and a number to ring them on is one click
 * away behind their name — where the rest of their record is. It also sat in
 * the middle of the money, a column of digits that are not an amount among
 * three that are, which made the figures harder to scan — the one thing this
 * screen is for.
 *
 * There is no `balance` column. The signed account position and `remaining`
 * differ in exactly one case — a subscriber who has paid ahead — and carrying
 * two money columns that agree on every other row spends width to say the same
 * thing twice. Credit still has somewhere to be read: the status chip says
 * `credit` in words, and the printed statement gives the figure.
 */
export const BILLS_COLUMNS = [
  { key: 'name', numeric: false },
  { key: 'subscription', numeric: false },
  { key: 'totalPrice', numeric: true },
  { key: 'remaining', numeric: true },
  { key: 'totalPayment', numeric: true },
  { key: 'status', numeric: false },
] as const;

export type BillsColumn = (typeof BILLS_COLUMNS)[number];
export type BillsColumnKey = BillsColumn['key'];

/**
 * The actions column is not in the list above and cannot be dragged.
 *
 * It holds the row's charge, payment and print controls, it has no
 * heading to grab, and a reader who dropped it into the middle of the figures
 * would have made the table worse in a way that is hard to undo. It stays at
 * the end. This count is also what a full-width row — the empty state — has to
 * span.
 */
export const COLUMN_COUNT = BILLS_COLUMNS.length + 1;

/**
 * The width held back for the actions column, as a CSS length.
 *
 * The cell carries four 48px controls with 4px between them — charge, payment,
 * send and the menu — plus `TableCell`'s own 12px of padding either side: 228px
 * that does not scale with anything. Given an equal share of the table like
 * every other column, it was the share that was too small on a tablet, so the
 * menu at the end of the row was drawn outside the cell it belongs to.
 *
 * Stated here rather than in the table because it is a fact about what the
 * actions cell *contains*, and this file is where the actions column is
 * documented. See the `colgroup` in `BillsTable` for how the rest of the width
 * is divided once this is taken off.
 */
export const ACTIONS_COLUMN_WIDTH = '14.5rem';

/**
 * How many shares of the remaining width the name takes. The other five
 * columns take one each.
 *
 * An even split gave a subscriber's name the same room as a figure, and a name
 * is not a figure: three or four Arabic words against `₪280`, in the one column
 * somebody reads to find the row they want. On a desktop the shares are wide
 * enough that it did not show; on a tablet the names truncated to `محمد ج…`
 * while the money columns sat half empty beside them.
 *
 * **Three, having tried two.** The cell also carries the tone disc, so about
 * 40px of the name's column is spent before a letter is drawn — two shares
 * bought most of that back and left the names still clipped. Three is what
 * makes a full Arabic name fit on a tablet. Every other column gives up about a
 * quarter of what an even split would have given it, which the money can afford:
 * the figures are drawn compact (`₪280`, not `₪280.00`) and the remaining
 * column is a chip.
 */
const NAME_COLUMN_SHARES = 3;

/** Shares in play once the name has taken its two. */
const TOTAL_SHARES = BILLS_COLUMNS.length - 1 + NAME_COLUMN_SHARES;

/**
 * The name column's width, as a CSS length.
 *
 * Set on the heading rather than in the table's `colgroup`, and that is the
 * whole reason it is a string here instead of a `<col>` beside the actions one:
 * the columns can be dragged into another order, that order lives in the
 * browser, and a `colgroup` is positional — the wide track would stay in the
 * first slot while the name moved out of it. The heading travels with its own
 * column, so the width travels with it too. See `BillsColumnHeader`.
 *
 * The five columns that are left are given no width at all and split what
 * remains evenly between them, which works out at one share each.
 */
export const NAME_COLUMN_WIDTH = `calc((100% - ${ACTIONS_COLUMN_WIDTH}) * ${NAME_COLUMN_SHARES} / ${TOTAL_SHARES})`;
