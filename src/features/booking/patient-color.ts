import { type CSSProperties } from 'react';

/**
 * A colour of their own for every client — the ten palette colours first, then
 * mixes of them, and never the same colour twice.
 *
 * This module decides one number — the hue, in degrees — and hands it to the
 * `.patient-tone` class in `globals.css`, which builds the card fill, the hover
 * fill, the hairline and the avatar disc from it. The long note there is where
 * the colour reasoning lives; this is where *which client gets which* lives,
 * and nothing else.
 *
 * ## Ten colours, then the colours between them
 *
 * The clinic has a palette: ten named hues, chosen rather than computed. The
 * first ten clients get them, one each.
 *
 * The eleventh does not start the ring again — it gets the colour *between* two
 * palette entries. The twelfth gets the one between the next pair, and so on
 * round the wheel; the twenty-first starts halving those halves. Every colour
 * after the tenth is a mix of two the palette already contains, so a calendar
 * still reads as one family of colours however large the clinic gets, and no two
 * clients are ever handed the same one.
 *
 * That is the whole of the scheme, and it is what an earlier golden-angle
 * version got wrong. `seq × 137.508°` is also unique forever, but its hues are
 * unique the way random numbers are — the fourth client landed on a colour
 * belonging to no set, and the palette was a fiction. Mixing keeps the anchors
 * real: the wheel fills in *from* the ten, in the order that keeps the widest
 * gaps longest.
 *
 * ## How the mixing is ordered
 *
 * Two numbers come out of the client's position:
 *
 * - **which segment** — `seq × 3 (mod 10)`, one of the ten arcs between adjacent
 *   palette colours. A stride of 3 is coprime with 10, so ten consecutive
 *   clients cover all ten arcs exactly once, and two people registered together
 *   land a third of the way around the wheel apart rather than side by side.
 * - **how far along it** — `vanDerCorput(floor(seq / 10))`, which yields 0, ½,
 *   ¼, ¾, ⅛, ⅝… That order is the point: it always halves the *largest*
 *   remaining gap, so at every clinic size the colours in use are as far apart as
 *   that many colours can be. Filling a segment left to right would spend the
 *   eleventh through twentieth clients crowded into one arc.
 *
 * Distinct positions give distinct `(segment, offset)` pairs — the stride is a
 * bijection mod 10, the sequence never repeats a fraction, and an offset below 1
 * never reaches the next anchor — so distinct clients get distinct hues by
 * construction rather than by luck.
 *
 * ## What this does and does not promise
 *
 * It promises no two clients are given the same colour. It does not promise that
 * a hundred clients are all *told apart* by colour: roughly a dozen hues is the
 * most anyone reliably distinguishes side by side, and past that the gaps close
 * below what the eye resolves no matter how they are assigned. The halving order
 * is what makes the degradation graceful instead of sudden.
 *
 * That limit is why colour is never asked to work alone here: the avatar carries
 * the client's initials and every surface prints the full name. Colour is what
 * makes a returning face recognisable across a week at a glance; the letters are
 * what settle it when two hues sit close, and they are what a reader who cannot
 * separate hues at all reads instead.
 */

/**
 * The ten hues, in OKLCH degrees, ascending — the clinic's palette, and the
 * anchors every later colour is mixed from.
 *
 * Spread around the wheel with the gaps placed by eye rather than by division:
 * the yellow-to-green stretch needs more room than the blues, because that is
 * where a fixed step produces two tones nobody separates. Each is only a hue —
 * `.patient-tone` sets the lightness and the chroma, and does it twice, once per
 * theme, which is what keeps all ten legible on cream and on charcoal.
 *
 * They must stay in ascending order: the segments below are the arcs between
 * consecutive entries, and an unsorted list would make one of them run backwards
 * across the rest of the wheel. Editing the list repaints the clinic.
 */
const PALETTE = [
  25, // red
  55, // orange
  90, // amber
  135, // green
  165, // emerald
  195, // teal
  230, // blue
  265, // indigo
  300, // violet
  335, // pink
] as const;

/**
 * How far along the palette each position moves. Coprime with `PALETTE.length`,
 * so ten consecutive clients cover every arc before any is revisited — see the
 * note above.
 */
const PALETTE_STRIDE = 3;

/**
 * 0, ½, ¼, ¾, ⅛, ⅝, ⅜, ⅞… — the binary digits of `n` read backwards through the
 * point.
 *
 * The low-discrepancy sequence, which is the property being bought: each new
 * value falls in the largest gap the previous ones left. Halving in this order
 * is what lets the palette be subdivided indefinitely while the colours actually
 * in use stay as spread as their number allows.
 */
function vanDerCorput(n: number): number {
  let fraction = 0;
  let place = 0.5;
  let rest = n;

  while (rest > 0) {
    fraction += (rest % 2) * place;
    rest = Math.floor(rest / 2);
    place /= 2;
  }

  return fraction;
}

/**
 * The client's hue in degrees, `0 ≤ h < 360`.
 *
 * Stable for the life of the record: positions are handed out in registration
 * order and only ever appended to, so a client's colour is decided once and
 * never moves under them.
 */
export function patientHue(clientSeq: number): number {
  // Guarded rather than trusted: a negative or fractional seq is not something
  // the queries produce, but an index arriving from somewhere unexpected should
  // land on a colour rather than on `NaN`.
  const seq = Number.isFinite(clientSeq) ? Math.max(Math.trunc(clientSeq), 0) : 0;

  const size = PALETTE.length;
  const segment = (seq * PALETTE_STRIDE) % size;
  const offset = vanDerCorput(Math.floor(seq / size));

  const from = PALETTE[segment] ?? PALETTE[0];
  // The last segment wraps: pink back round to red, the long way through the
  // reds nothing else occupies. `+ 360` keeps the interpolation going forwards.
  const to = segment === size - 1 ? PALETTE[0] + 360 : (PALETTE[segment + 1] ?? PALETTE[0]);

  return (from + (to - from) * offset) % 360;
}

/**
 * The hue as the one custom property `.patient-tone` reads.
 *
 * Pair it with that class: the style supplies the number, the class supplies
 * the ramp built from it.
 *
 * Three decimals, because rounding is quantising and quantising is how two
 * distinct hues become the same colour again. A tenth of a degree cuts the wheel
 * into 3,600 slots, which the halving above reaches sooner than it sounds; a
 * thousandth gives 360,000 and keeps the emitted markup from carrying seventeen
 * digits of float on every card.
 */
export function patientToneStyle(clientSeq: number): CSSProperties {
  return { '--tone-h': patientHue(clientSeq).toFixed(3) } as CSSProperties;
}
