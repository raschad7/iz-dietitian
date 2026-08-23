/**
 * The portal's content column, in one place.
 *
 * Every portal screen — the five tab destinations, the account screens, and the
 * two sticky bars that sit above them — centres its content in the same box.
 * That box used to be written out as `mx-auto w-full max-w-3xl` at fourteen
 * call sites, which is fourteen chances for a header's column and the cards
 * under it to drift apart. `(tabs)/layout.tsx` already carries a long note on
 * what that misalignment looks like when it happens; these constants are what
 * make it impossible rather than merely documented.
 *
 * ## Why there are two
 *
 * `max-w-3xl` is a phone column. On a 1440px desktop the rail takes 256px and
 * the column takes 768px of what is left, so a third of the screen is white
 * margin either side of a single stack of cards — the portal rendered as a
 * phone held up in the middle of a monitor.
 *
 * The fix is not simply a wider cap. A 1136px-wide list of switch rows is more
 * empty space than a 768px one, not less: the label goes to one edge, the
 * control to the other, and the gap between them grows with the screen. Width
 * is only worth taking where there is a second column of content to put in it.
 *
 * So screens divide in two:
 *
 * - {@link PORTAL_COLUMN} — screens that lay out in columns from `lg`: the
 *   home tab's picker-and-ring aside beside the day's meals, progress's chart
 *   grid, the appointment lists, the profile's record beside the clinic, the
 *   settings index, and the three screens built from `SettingsPoint` cards.
 * - {@link PORTAL_COLUMN_NARROW} — screens that are honestly one column of
 *   rows: the password form, the clinic's contact card, the notification
 *   switches. These stay at the reading measure and centre, which is what they
 *   should do on a desktop.
 *
 * ## The breakpoint is `lg`, and it is not a free choice
 *
 * `lg` is where the portal's desktop face begins: `globals.css` holds the rail
 * back to `lg`, `PortalTabBar` runs to `lg`, and `main`'s bottom clearance for
 * that bar is dropped at `lg`. Widening here on any other breakpoint would
 * open the column while the phone's bottom bar is still on screen. One layout,
 * one line — move any of them and move all of them.
 */

/** The measure for screens with a column layout from `lg`. */
export const PORTAL_COLUMN = 'mx-auto w-full max-w-3xl lg:max-w-6xl';

/**
 * The measure for screens that are one column of rows at every width — a form,
 * a switch list, a single card. Widening these only stretches the gap between a
 * label and its control.
 */
export const PORTAL_COLUMN_NARROW = 'mx-auto w-full max-w-3xl';
