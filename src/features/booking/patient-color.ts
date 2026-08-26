import { type CSSProperties } from 'react';

/**
 * A colour of their own for every client — ten chosen colours first, then mixes
 * of them, and never the same colour twice.
 *
 * This module decides the three OKLCH numbers a client's surfaces are built
 * from and hands them to the `.patient-tone` class in `globals.css`, which turns
 * them into the card fill, the hover fill, the hairline and the avatar disc. The
 * long note there is where the *ramp* lives; this is where **which client gets
 * which colour** lives, and where the palette is proved distinct.
 *
 * ## Ten colours, then the colours between them
 *
 * The clinic has a palette: ten colours, chosen rather than computed. The first
 * ten clients get them, one each.
 *
 * The eleventh does not start the ring again — it gets the colour *between* two
 * palette entries. The twelfth gets the one between the next pair, and so on
 * round the wheel; the twenty-first starts halving those halves. Every colour
 * after the tenth is a mix of two the palette already contains, so a calendar
 * still reads as one family of colours however large the clinic gets, and no two
 * clients are ever handed the same one.
 *
 * That is the whole of the scheme, and it is what an earlier golden-angle
 * version got wrong. `seq × 137.508°` is also unique forever, but its colours
 * are unique the way random numbers are — the fourth client landed on a colour
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
 * never reaches the next anchor — so distinct clients get distinct colours by
 * construction rather than by luck.
 *
 * The assignment is a pure function of a stable identifier, so the same client is
 * the same colour on every render and on every surface. Re-picking against
 * whatever a given screen happens to be showing is the one thing this must not
 * do: a client whose colour depends on who else is on the page has no colour.
 *
 * ## What this does and does not promise
 *
 * It promises no two clients are given the same colour, and it proves — with the
 * OKLab measurements below — that the *ten* are far apart enough to be told
 * apart at a glance. It does not promise that a hundred clients are all told
 * apart by colour: roughly a dozen is the most anyone reliably distinguishes
 * side by side, and past that the gaps close below what the eye resolves no
 * matter how they are assigned. The halving order is what makes that degradation
 * graceful instead of sudden, and {@link MIN_TONE_DISTANCE} is the floor it
 * degrades *from* rather than a bound that holds forever.
 *
 * That limit is why colour is never asked to work alone here: the avatar carries
 * the client's mark and every surface prints the full name. Colour is what makes
 * a returning face recognisable across a week at a glance; the glyph and the
 * letters settle it when two colours sit close, and they are what a reader who
 * cannot separate hues at all reads instead.
 */

/** One OKLCH colour: lightness `0–1`, chroma, hue in degrees. */
export type Tone = { l: number; c: number; h: number };

/**
 * A palette entry: one hue, and what it is worth in each theme.
 *
 * The hue is shared and the lightness and chroma are not, because the two themes
 * are different problems. A card on cream has to be light enough to carry n-900
 * text; the same client's card on charcoal has to be dark enough to carry n-25.
 * The hue is what makes them the same client's colour across the two.
 */
type PaletteEntry = { h: number; light: [l: number, c: number]; dark: [l: number, c: number] };

/**
 * The ten colours, ascending by hue.
 *
 * ## They vary in all three coordinates, and that is the change
 *
 * This was ten hues at one fixed lightness and one fixed chroma, on the argument
 * that colour should say *who* and never *how important* — two cards on the grid
 * differing in hue and in nothing else. The argument is good and the palette it
 * produced was not: with two of the three coordinates pinned, the whole of the
 * separation between ten colours had to come out of a single circle of radius
 * 0.055, which put the closest pair 0.030 apart in OKLab. That clears the
 * ~0.02 just-noticeable difference and nothing more — ten colours that were
 * *different* rather than ten colours anyone could tell apart, and in the dark
 * theme especially they read as ten tints of one wash.
 *
 * Letting lightness and chroma move lifts the closest pair to **0.111 in light
 * and 0.090 in dark** — three to four times the separation, from the same ten
 * hue families. That is the difference between a palette and a set of shades.
 *
 * The cost is real and bounded: cards no longer weigh exactly the same on the
 * grid. It is bounded by the band each theme's lightness is allowed to move in
 * — 0.755–0.920 on cream, 0.285–0.455 on charcoal — which is chosen so that
 * *every* colour still clears 4.5:1 for body text at rest and on hover. The
 * measured worsts are 7.20:1 light and 6.64:1 dark, so no card is a weak card;
 * the lighter ones are simply lighter.
 *
 * ## How these ten were picked
 *
 * By search, not by eye, maximising the smallest OKLab distance across all 45
 * pairs subject to four constraints, each of which is one of the requirements
 * this palette exists to meet:
 *
 * - **in sRGB at every step.** A colour past its hue's chroma ceiling is clipped
 *   per channel by the browser, and per-channel clipping does not preserve hue:
 *   it moves the colour off the one number identifying the client, and moves two
 *   different clients towards the same corner of the cube. The fill, its hover
 *   step and the glyph are all checked, not just the fill.
 * - **≥ 4.5:1 for text**, at rest and hovered, in both themes.
 * - **≥ 30° apart in hue.** Distance alone would happily return a pale red and a
 *   deep red — far apart in OKLab, and still two reds. The hue floor is what
 *   makes these ten *families* rather than ten points.
 * - **chroma ≥ 0.045 light / 0.038 dark.** A near-neutral is easy to place far
 *   from everything else and reads as grey, not as somebody’s colour. This
 *   floor was 0.075 / 0.05 before the palette was muted, and it was lowered
 *   deliberately rather than discovered: muting is exactly the move that walks
 *   a colour towards grey, so the bound had to come down with it or refuse the
 *   change. What still guarantees these are ten colours and not ten greys is
 *   the distance floor above it, which was not touched.
 *
 * They must stay ten and stay ascending: the mixing subdivides the arcs between
 * consecutive entries, so an unsorted list would send one arc backwards across
 * the rest of the wheel, and the stride is coprime with ten specifically.
 * `patient-color.test.ts` re-derives the distances and the gamut rather than
 * trusting this note. Editing this list repaints the clinic.
 */
/*
  Muted, at the clinic’s request: the cards read too strong against a page
  that is mostly white. Every chroma is the one it was, scaled — light by
  0.6, dark by 0.75 — and every lightness is untouched, so the grid gets
  quieter without any card moving up or down against the text on it.

  **The two scales differ because the two bands have different room.** The
  floor below is on the *distance* between the ten, and the dark band starts
  closer together than the light one does: 0.6 there lands at 0.055 and fails.
  0.7 is the least that clears the floor and 0.75 is what it takes, for the
  margin. Re-measure before changing either — the test derives both rather
  than trusting this note.
*/
const PATIENT_PALETTE: readonly PaletteEntry[] = [
  { h: 21, light: [0.755, 0.084], dark: [0.285, 0.041] }, // red
  { h: 53, light: [0.87, 0.045], dark: [0.415, 0.068] }, // amber
  { h: 92, light: [0.755, 0.057], dark: [0.345, 0.045] }, // olive
  { h: 142, light: [0.835, 0.096], dark: [0.455, 0.105] }, // green
  { h: 173, light: [0.92, 0.045], dark: [0.42, 0.056] }, // mint
  { h: 203, light: [0.835, 0.078], dark: [0.34, 0.038] }, // cyan
  { h: 236, light: [0.755, 0.084], dark: [0.445, 0.068] }, // blue
  { h: 273, light: [0.835, 0.045], dark: [0.285, 0.053] }, // violet
  { h: 305, light: [0.755, 0.081], dark: [0.305, 0.109] }, // purple
  { h: 339, light: [0.755, 0.117], dark: [0.385, 0.109] }, // magenta
];

/** The palette as plain tones, per theme — what the distinctness check reads. */
export function paletteTones(theme: 'light' | 'dark'): Tone[] {
  return PATIENT_PALETTE.map((entry) => ({ l: entry[theme][0], c: entry[theme][1], h: entry.h }));
}

/**
 * Which arc each position moves to — coprime with the palette length, which is
 * the whole of why it is 3. See the note at the top of the file.
 */
const PALETTE_STRIDE = 3;

/**
 * The smallest OKLab distance any two of the ten may sit at.
 *
 * A just-noticeable difference in OKLab is around 0.02, and that is the floor a
 * colour code has to clear rather than the bar it should aim at: two cards on
 * one day want to be obviously different, not barely different. 0.06 is roughly
 * three JNDs and is the line the test holds; the palette clears it with room, at
 * 0.067 light and 0.069 dark — both narrower than before the palette was
 * muted, and both still clear.
 *
 * It is a bound on the *ten*, not on every client. Mixes fill the gaps between
 * them by design, so the fortieth client is necessarily closer to their nearest
 * neighbour than the tenth was — see "what this does and does not promise".
 */
export const MIN_TONE_DISTANCE = 0.06;

/** OKLCH → OKLab. The `a`/`b` pair is the colour plane the distances live in. */
function toLab({ l, c, h }: Tone): [number, number, number] {
  const radians = (h * Math.PI) / 180;
  return [l, c * Math.cos(radians), c * Math.sin(radians)];
}

/**
 * How far apart two colours read, in OKLab — the straight-line distance between
 * them, which is what OKLab is built to make meaningful.
 *
 * All three coordinates count. The old version took two hues and a shared
 * chroma, which was the right shape for a palette that varied in hue alone and
 * is not one that can measure this palette at all.
 */
export function toneDistance(a: Tone, b: Tone): number {
  const [al, aa, ab] = toLab(a);
  const [bl, ba, bb] = toLab(b);

  return Math.hypot(al - bl, aa - ba, ab - bb);
}

/**
 * OKLab → linear sRGB, and whether the result is a colour sRGB actually has.
 *
 * The matrices are the ones from Björn Ottosson's OKLab definition, which is
 * also what the browser evaluates `oklch()` with — so "in gamut" here means the
 * same thing it will mean at paint time.
 */
function inGamut(tone: Tone): boolean {
  const [labL, a, b] = toLab(tone);

  const lRoot = labL + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = labL - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = labL - 0.0894841775 * a - 1.291485548 * b;

  const long = lRoot ** 3;
  const medium = mRoot ** 3;
  const short = sRoot ** 3;

  const channels = [
    4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
    -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short,
  ];

  return channels.every((channel) => channel >= 0 && channel <= 1);
}

/**
 * The colour, with its chroma pulled back to the most that hue and lightness can
 * hold in sRGB.
 *
 * **Only mixes need this, and they genuinely do.** The ten anchors are searched
 * inside the gamut, but the gamut is not convex: the straight line between two
 * colours that are both inside it passes outside for a stretch of the hues in
 * between — measured, that is around one client in five past the tenth. Left
 * alone, the browser clips those per channel, which does not preserve hue and so
 * loses the one number identifying the client, in the surfaces least able to
 * spare it.
 *
 * Bisection rather than an analytic solve: the sRGB boundary in OKLCH has no
 * closed form, twenty steps land within 0.0004 of it, and this runs once per
 * client per render on a list of a few dozen.
 *
 * Reducing chroma rather than lightness on purpose — lightness is what carries
 * the text contrast the band was chosen for, and a mix that quietly darkened to
 * stay in gamut would be a mix that quietly failed contrast.
 */
function clampToGamut(tone: Tone): Tone {
  if (inGamut(tone)) return tone;

  let low = 0;
  let high = tone.c;

  for (let step = 0; step < 20; step += 1) {
    const mid = (low + high) / 2;
    if (inGamut({ ...tone, c: mid })) low = mid;
    else high = mid;
  }

  return { ...tone, c: low };
}

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

/** Where in the palette a client sits: which arc, and how far along it. */
function positionOf(clientSeq: number): { segment: number; offset: number } {
  // Guarded rather than trusted: a negative or fractional seq is not something
  // the queries produce, but an index arriving from somewhere unexpected should
  // land on a colour rather than on `NaN`.
  const seq = Number.isFinite(clientSeq) ? Math.max(Math.trunc(clientSeq), 0) : 0;
  const size = PATIENT_PALETTE.length;

  return {
    segment: (seq * PALETTE_STRIDE) % size,
    offset: vanDerCorput(Math.floor(seq / size)),
  };
}

/**
 * The client's colour in one theme: a palette entry for the first ten, a mix of
 * two of them for everyone after.
 *
 * All three coordinates interpolate. Lightness and chroma have to travel with
 * the hue now that the anchors differ in them — carrying a mixed hue at one
 * anchor's lightness would put the mix in neither colour's family.
 */
export function patientTone(clientSeq: number, theme: 'light' | 'dark'): Tone {
  const { segment, offset } = positionOf(clientSeq);
  const size = PATIENT_PALETTE.length;

  const from = PATIENT_PALETTE[segment] ?? PATIENT_PALETTE[0]!;
  const to = PATIENT_PALETTE[(segment + 1) % size] ?? PATIENT_PALETTE[0]!;

  // The last segment wraps: magenta back round to red, the long way through the
  // reds nothing else occupies. `+ 360` keeps the interpolation going forwards.
  const toHue = segment === size - 1 ? to.h + 360 : to.h;

  const [fromL, fromC] = from[theme];
  const [toL, toC] = to[theme];

  return clampToGamut({
    l: fromL + (toL - fromL) * offset,
    c: fromC + (toC - fromC) * offset,
    h: (from.h + (toHue - from.h) * offset) % 360,
  });
}

/**
 * The client's hue in degrees, `0 ≤ h < 360`.
 *
 * The one coordinate that is the same in both themes, for the callers that only
 * need to name a colour rather than paint one.
 */
export function patientHue(clientSeq: number): number {
  return patientTone(clientSeq, 'light').h;
}

/**
 * The client's colour as the custom properties `.patient-tone` reads.
 *
 * **Five properties, one of which is the hue.** It used to be the hue alone,
 * because the ramp held lightness and chroma fixed and only needed telling which
 * way round the wheel to go. Now that the ten differ in all three, the element
 * has to carry both themes' lightness and chroma: the class picks the light pair
 * and `.dark .patient-tone` picks the dark one, because a server-rendered inline
 * style cannot know which theme it will be painted in.
 *
 * Three decimals, because rounding is quantising and quantising is how two
 * distinct colours become one again. A tenth of a degree cuts the wheel into
 * 3,600 slots, which the halving above reaches sooner than it sounds; a
 * thousandth gives 360,000 and keeps the emitted markup from carrying seventeen
 * digits of float on every card.
 */
export function patientToneStyle(clientSeq: number): CSSProperties {
  const light = patientTone(clientSeq, 'light');
  const dark = patientTone(clientSeq, 'dark');

  return {
    '--tone-h': light.h.toFixed(3),
    '--tone-l-light': light.l.toFixed(3),
    '--tone-c-light': light.c.toFixed(3),
    '--tone-l-dark': dark.l.toFixed(3),
    '--tone-c-dark': dark.c.toFixed(3),
  } as CSSProperties;
}
