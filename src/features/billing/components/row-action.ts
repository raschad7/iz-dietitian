/**
 * How every icon at the end of a Bills row is drawn.
 *
 * Four controls sit there — add a charge, record a payment, print the account,
 * open the ledger — and they are peers. One string, imported by all four, so a
 * change to the set is one edit and none of them can drift into looking like
 * the odd one out.
 *
 * ## Grey at rest
 *
 * `text-muted-foreground` rather than the `ghost` variant's olive. That variant
 * is the system saying "act on me", which is right once on a screen and wrong
 * twenty-five times down a register: a page of rows would carry a hundred brand
 * marks while the actual primary action sits at the top of the page. The same
 * argument `neutralGhost` makes in `button.tsx`, one step quieter — grey lets
 * the figures in the row be what the eye lands on.
 *
 * ## Green under the pointer
 *
 * `hover:text-primary` colours the stroke itself, because these are line icons
 * drawn in `currentColor`. It arrives with the fill rather than instead of it,
 * so the control says pressable twice — by lighting up and by taking a
 * background — and a reader who is on the wrong icon can see it before they
 * press.
 *
 * `focus-visible` gets the same treatment: a keyboard reader has no pointer to
 * hover with, and the ring alone does not say which of four icons is armed.
 *
 * ## The fill
 *
 * `bg-primary/5` — the brand green at a twentieth of its opacity.
 *
 * **Green, and almost not there.** Over a white row that lands around
 * `#F6FBF3`: still recognisably the hue of the stroke it appears with, so the
 * control reads as one green mark rather than a green glyph on a neutral
 * square, but far too faint to read as a box. What the eye registers is the
 * *icon* changing; the fill only says where the target's edges are.
 *
 * The number has been walked down twice to get here — `green-100`, then a tenth
 * of the primary — because an opaque swatch from the ramp is mixed for a
 * surface (a card, a callout, a chip) and behind a 36px icon any of them reads
 * as a filled button, which is a promise these four do not keep.
 *
 * **An alpha, not a swatch.** It composites over whatever the row is already
 * painted — the register's own hover, the opened panel's tint — where an opaque
 * colour would punch a hole of a different shade through each of them.
 *
 * The 5 is the knob, in one place for all four icons: down to `/3` if it still
 * reads as a background, up to `/8` if the target needs finding from further
 * away.
 *
 * `aria-expanded` takes it too. The chevron carries that attribute while the
 * ledger is open, and the variant would otherwise leave the one control that is
 * actually doing something wearing the neutral fill the other three shed.
 *
 * ## Its corners
 *
 * `rounded-sm` — 8px, the design system's `radius.sm` — over the button's own
 * 10px control radius. Two pixels sounds like nothing and is not: at 36px, ten
 * reads as a rounded square, and four rounded squares in a row read as a
 * segmented control, a set of choices, rather than as four separate things you
 * can do.
 */
export const ROW_ACTION_CLASS =
  'rounded-sm text-muted-foreground hover:bg-primary/5 hover:text-primary aria-expanded:bg-primary/5 aria-expanded:text-primary focus-visible:bg-primary/5 focus-visible:text-primary';
