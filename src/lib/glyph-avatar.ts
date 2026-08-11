import { Avatar, Style } from '@dicebear/core';
import definition from '@dicebear/styles/glyphs.json';

/**
 * The abstract mark that stands for a person, from DiceBear's **Glyphs** style.
 *
 * It replaced two initials in a coloured disc. Initials are a poor identifier in
 * this register: Arabic names share opening letters far more often than Latin
 * ones, so أحمد خليل and أحمد خالد both came out as "أخ", and the disc that was
 * supposed to tell two clients apart told the reader nothing the name beside it
 * had not already said. A glyph is arbitrary, which is exactly what makes it
 * memorable — it is a shape you learn, not a word you re-read.
 *
 * ## Attribution
 *
 * Glyphs is **CC BY 4.0** — a remix of *Abstract Avatars for All Creative
 * Profile Use* by Matt Houser — so it is the one asset in this app that carries
 * a condition. Every generated SVG embeds the creator and licence as RDF
 * metadata, which travels with the mark wherever it is copied, but a licence
 * that requires attribution wants a credit a person can read: see
 * `GLYPH_AVATAR_CREDIT` and put it somewhere in the product's own about or
 * licences screen. Swapping to Identicon (CC0) is a one-line change here if the
 * condition is ever unwelcome.
 *
 * ## The colour is the caller's, not the style's
 *
 * Glyphs takes **no options at all** — no `backgroundColor`, nothing. It picks
 * an accent from its own palette by hashing the seed and paints three things
 * with it: a white ground, a 20%-opacity wash of the accent over it, and the
 * glyph stroke. That palette knows nothing about this clinic's patient tones, so
 * left alone every avatar would disagree with the card it sits on.
 *
 * Rewriting that one hex to `currentColor` hands all three to CSS. The wash
 * becomes a pale version of the client's hue and the stroke the full one, which
 * is the same two-step relationship `--tone-fill` and `--tone-mark` already have
 * — so the mark and the appointment card are the same colour by construction
 * rather than by two palettes happening to agree.
 *
 * The accent is found rather than assumed: it is whatever the style put in the
 * glyph's `stroke`, and every occurrence of that exact value is replaced. A
 * style that changed its internals would fail the regex and fall through
 * unmodified — a mark in DiceBear's own colours, which is wrong but not broken.
 */

/** The credit CC BY 4.0 asks for. Render it somewhere a person can find it. */
export const GLYPH_AVATAR_CREDIT =
  'Avatars: “Glyphs” by DiceBear, a remix of “Abstract Avatars for All Creative Profile Use” by Matt Houser, licensed under CC BY 4.0.';

const style = new Style(definition as never);

/**
 * Generated marks, kept.
 *
 * A week of the calendar draws the same handful of clients over and over — one
 * block per appointment, plus the agenda, plus the picker — and each of those is
 * an SVG built from scratch otherwise. The key is the seed, so the work is done
 * once per person rather than once per booking.
 *
 * Unbounded on purpose: it is bounded in practice by the clinic's own register,
 * which is thousands at the very most, and each entry is under two kilobytes of
 * string. A cache that evicted would be re-doing work for the client someone is
 * scrolling past for the second time.
 */
const marks = new Map<string, string>();

/** Matches the accent the style painted the glyph's stroke with. */
const ACCENT = /stroke="(#[0-9a-fA-F]{3,8})"/;

/** The full-bleed square the style lays down before anything else. */
const GROUND = /<path fill="white"[^>]*\/>/;

/**
 * Drops the opaque white square the style paints under the glyph.
 *
 * It is what kept the mark from ever agreeing with the appointment card: the
 * card is a tint of the client's hue and the disc was white with a 20% wash of
 * it, so the two shared a hue and nothing else. With the ground gone the
 * element's own background shows through, and `Avatar` sets that to
 * `--tone-fill` — the card's exact colour — so the disc reads as a small piece
 * of the same card.
 *
 * **Only the one after the mask.** The style paints an identical white square
 * *inside* `<mask>`, where white means "show everything"; removing that one
 * would mask the glyph out entirely and leave an empty disc. Slicing at
 * `</mask>` is what keeps the two apart, and is why this is not a plain
 * `replace` on the whole string.
 */
function dropOpaqueGround(svg: string): string {
  const maskEnd = svg.indexOf('</mask>');
  if (maskEnd === -1) return svg;

  return svg.slice(0, maskEnd) + svg.slice(maskEnd).replace(GROUND, '');
}

/**
 * The mark for a seed, as an SVG string, with its accent handed to `currentColor`.
 *
 * **The seed never reaches the output.** Glyphs renders no text — the seed is
 * hashed to choose a shape and a colour, and nothing else — so a client's name
 * cannot appear in, or escape from, the markup this returns. That is what makes
 * it safe to write with `dangerouslySetInnerHTML`, and it is worth re-checking
 * before this is ever pointed at a style that draws letters.
 */
export function glyphAvatarSvg(seed: string): string {
  const cached = marks.get(seed);
  if (cached !== undefined) return cached;

  const raw = new Avatar(style, { seed }).toString();
  const accent = ACCENT.exec(raw)?.[1];
  const tinted = accent === undefined ? raw : raw.split(accent).join('currentColor');
  const svg = dropOpaqueGround(tinted);

  marks.set(seed, svg);
  return svg;
}
