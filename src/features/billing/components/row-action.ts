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

/**
 * How the three secondary buttons on the record's Expenses tab are drawn — Add
 * a bill, Export bills, Send by WhatsApp.
 *
 * A grey outline, black words, and a grey fill under the pointer. One string
 * for all three, so the row cannot end up with one button dressed differently
 * from its neighbours.
 *
 * ## Why they are neutral
 *
 * They used to flip to `--accent-green` with white words on hover. That fill
 * was the loudest thing in the panel and it sat on the *secondary* row: the
 * primary action here is Record a payment, one button to its left, and three
 * green fills beside it left the reader with four things shouting equally. Grey
 * is what a secondary control looks like — the panel's figures stay the
 * brightest thing on the card, which is what the card is read for.
 *
 * It also drops a contrast problem rather than documenting one. White on that
 * green was about 1.7:1; `--foreground` on `--muted` is the app's ordinary text
 * pairing, legible at rest and under the pointer alike.
 *
 * ## The three tokens
 *
 * - `border-border` — `--n-200`, the divider grey. Present at rest and pinned
 *   on hover, so the outline does not change colour as the fill arrives; the
 *   fill alone is the feedback.
 * - `text-foreground` — the app's near-black body ink rather than the button
 *   variant's own. These carry their only label in those words.
 * - `bg-muted` — the sunken-surface grey. A token rather than a literal, so
 *   dark mode gets its own answer instead of a light swatch burned into a
 *   hover state.
 *
 * **The radius is pinned, not left alone.** `rounded-[10px]` is the same
 * control radius the button already carries, restated on hover so that nothing
 * — a variant, a future utility, tailwind-merge picking a different winner —
 * can change the shape of these under the pointer. A control that changes
 * shape when you reach for it is a control that moves as you aim.
 *
 * `aria-expanded` takes the hover treatment too: Add a bill carries that
 * attribute while its dialog is open, and it should not shed the fill the
 * moment the pointer leaves to use the thing it opened.
 */
export const PANEL_ACTION_CLASS =
  'border-border text-foreground hover:rounded-[10px] hover:border-border hover:bg-muted hover:text-foreground aria-expanded:rounded-[10px] aria-expanded:border-border aria-expanded:bg-muted aria-expanded:text-foreground';

/**
 * How a row inside a billing popover menu answers the pointer: a step darker
 * than the `ghost` variant's own hover.
 *
 * Shared by the Bills row's overflow menu and the Expenses panel's — two menus
 * with an item in common (the statement), so one string keeps them from
 * drifting into two shapes of the same list.
 *
 * Ghost flips to `--accent` — `#E5E7EB` — which is the right weight for a
 * control sitting on a page, and too light inside a popover: the panel is
 * already a raised surface, so a near-white fill on a near-white card is a
 * state you have to look for rather than one you notice.
 *
 * An alpha over whatever is beneath it rather than a darker swatch, so it works
 * in both themes without a second rule — black at 15% in the light theme, and
 * in the dark one `--foreground` is the pale ink, so the same class lightens
 * instead of darkening. That is the same "more contrast with the panel" either
 * way, which is what the state is for.
 *
 * **The edge is pinned transparent in every state, and that is not belt and
 * braces.** The statement item is a `PrintBillButton`, and its labelled shape
 * is the `outline` variant — which carries a hover border of its own. Handing
 * it the `ghost` variant afterwards replaces `border-primary` but not the hover
 * rule beside it: tailwind-merge treats `border` and `hover:border` as
 * different groups, so the edge survived a class that looks like it should have
 * removed it, and only that one row in the menu grew a border under the
 * pointer. Naming the hover state explicitly is what actually wins.
 */
export const MENU_ITEM_CLASS =
  'w-full max-w-none justify-start border-transparent hover:border-transparent hover:bg-foreground/15 aria-expanded:border-transparent aria-expanded:bg-foreground/15';
