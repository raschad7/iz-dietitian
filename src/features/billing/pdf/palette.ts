/**
 * The four greys every PDF this clinic prints is drawn in.
 *
 * ## Why raw hex is right here, and only here
 *
 * `enzyme/no-raw-hex` exists because a colour in a component should come from
 * the token scale, so one edit in `globals.css` repaints the app. A PDF is
 * outside that entirely: `@react-pdf/renderer` resolves no CSS custom
 * properties, has no cascade to inherit from, and produces a file that will be
 * opened next year by somebody who has never loaded this stylesheet. There is
 * no token to reach for, so the values are literal and the rule is disabled
 * once, here, rather than restated at four sites in each document. The rule
 * itself only runs on .tsx/.jsx, which is why this file needs no disable
 * comment — it needs the reason written down instead.
 *
 * These are also deliberately **not** the app's greens. A bill is a financial
 * record: it is printed in black on white, photocopied, and filed. Brand colour
 * on it would cost toner and say nothing.
 *
 * Two documents share this — the statement (`bill-document.tsx`) and the
 * register export (`export/document.tsx`). They are the only two things this
 * app prints, and two printed documents from one clinic that do not look
 * related is the sort of detail a patient never notices and an accountant does.
 */
export const PDF_PALETTE = {
  /** Body text. Near-black rather than black: kinder on a laser printer. */
  ink: '#1b1b1b',
  /** Labels, captions, and anything the eye should pass over. */
  muted: '#6b6b6b',
  /** Hairlines between rows and under headings. */
  rule: '#d9d9d9',
  /** The band behind a table's header row. */
  band: '#f4f4f4',
} as const;
