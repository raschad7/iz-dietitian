import { type CSSProperties } from 'react';

/**
 * A colour of their own for every client, and never the same one twice.
 *
 * This module decides one number — the hue, in degrees — and hands it to the
 * `.patient-tone` class in `globals.css`, which builds the card fill, the hover
 * fill, the hairline and the avatar disc from it. The long note there is where
 * the colour reasoning lives; this is where *which client gets which* lives,
 * and nothing else.
 *
 * ## The input is a position, not a hash
 *
 * It takes `clientSeq` — the client's index within their clinic, counted from 0
 * and assigned in registration order (see `clientSeq` in `./queries.ts`).
 *
 * Two earlier versions of this got it wrong in the same way. A fixed set of
 * four tones meant the fifth client repeated the first. Hashing the client id
 * into a hue removed the fixed set but not the repetition: a hash scatters, and
 * scattering is precisely what puts two values a fraction of a degree apart —
 * which is not a near-miss, it is the same colour. Both failed because they
 * chose each client's colour without reference to anyone else's.
 *
 * An index cannot fail that way. Distinct clients hold distinct positions, so
 * they get distinct hues, by construction rather than by luck.
 *
 * ## Why the golden angle spaces them
 *
 * `seq × 137.508° (mod 360)`, the angle a sunflower packs its seeds at. It is
 * the choice that keeps *every* prefix of the sequence evenly spread: the first
 * three clients sit ~120° apart, the first eight ~45°, the first twenty ~18° —
 * always the widest minimum gap the count allows, never clumping into one arc
 * and never leaving the wheel half empty. Numbering the hues `seq × (360/N)`
 * would beat it for one fixed N and then repaint the whole clinic the next time
 * somebody registered.
 *
 * 137.508 is φ-derived and its multiples do not revisit an earlier angle, so
 * the sequence has no period a clinic could reach.
 *
 * ## What this does and does not promise
 *
 * It promises no two clients are given the same colour. It does not promise
 * that a hundred clients are all *told apart* by colour — roughly a dozen hues
 * is the most anyone reliably distinguishes side by side, and past that the
 * gaps close below what the eye resolves no matter how they are assigned.
 *
 * That limit is why colour is never asked to work alone here: the avatar
 * carries the client's initials and every surface prints the full name. Colour
 * is what makes a returning face recognisable across a week at a glance; the
 * letters are what settle it when two hues sit close, and they are what a
 * reader who cannot separate hues at all reads instead.
 */

/** 137.508° — see the note above on why this particular angle. */
const GOLDEN_ANGLE = 137.507764;

/**
 * The client's hue in degrees, `0 ≤ h < 360`.
 *
 * Stable for the life of the record: positions are handed out in registration
 * order and only ever appended to, so a client's colour is decided once and
 * never moves under them.
 */
export function patientHue(clientSeq: number): number {
  return (clientSeq * GOLDEN_ANGLE) % 360;
}

/**
 * The hue as the one custom property `.patient-tone` reads.
 *
 * Pair it with that class: the style supplies the number, the class supplies
 * the ramp built from it.
 *
 * Three decimals, because rounding is quantising and quantising is how
 * distinct hues become the same colour again. A tenth of a degree cuts the
 * wheel into 3,600 slots, which a clinic reaches sooner than it sounds; a
 * thousandth gives 360,000 and keeps the emitted markup from carrying
 * seventeen digits of float on every card.
 */
export function patientToneStyle(clientSeq: number): CSSProperties {
  return { '--tone-h': patientHue(clientSeq).toFixed(3) } as CSSProperties;
}
