/**
 * How much of each food a planned meal actually contains — in the unit the
 * dietitian wrote it in.
 *
 * A meal used to be `dish_id + servings`, where `servings` was a multiplier over
 * the whole recipe: 2.25 meant "two and a quarter of this dish". That number was
 * correct, it was what every total was scaled by, and it was meaningless to the
 * person holding the plan. `×2.25 portion` tells a client nothing they can put on
 * a plate; `1½ رغيف` and `150 غ` do.
 *
 * So this module formats an amount the way each language writes it. Working out
 * *what* that amount is belongs to `meal-ingredients.ts`, which resolves a meal's
 * lines from its own stored rows or from the scaled recipe; everything arriving
 * here is already the amount in this meal.
 *
 * ## It is not a second nutrition path
 *
 * Nothing here feeds `dishTotals`. `quantity_grams` remains the authoritative
 * amount and the only input to the per-100 g arithmetic; a portion count is a
 * *display* of the same quantity in the unit it was entered in. When a line has no
 * usable portion — entered in grams, or its portion has since been retired — this
 * falls back to the authoritative scaled grams, which is always available and
 * always right.
 */

import { isArabicLocale, localizedPortionLabel } from './food-display';
import { roundGrams } from './nutrition';

/** The fields a line must carry to be quantified. A subset of `DishIngredientDetail`. */
export type QuantifiableIngredient = {
  /** The authoritative amount in this meal. */
  quantityGrams: number;
  portion?: { labelAr: string; labelEn: string; grams: number } | null;
  /** How many of that portion this amount is, in this meal. */
  portionQuantity?: number | null;
};

/**
 * A line's amount, ready to render.
 *
 * Two shapes rather than one string because grams carry a translated unit the
 * caller already has (`t('gramsShort')`), while a portion's unit is stored data
 * this module has in hand.
 */
export type IngredientAmount =
  | { kind: 'portion'; text: string }
  | { kind: 'grams'; grams: number };

/**
 * The fractions worth writing as fractions, with how each language writes a bare
 * one.
 *
 * Serving multipliers move in quarters (`SERVING_STEP`) and portion counts are
 * typed by hand, so halves, thirds and quarters are what actually occurs. Anything
 * else falls through to a decimal rather than being forced onto the nearest glyph:
 * "0.7 loaf" is honest, "¾ loaf" would be a rounding a reader cannot see.
 */
const FRACTIONS: readonly { value: number; glyph: string; arabicWord: string }[] = [
  { value: 1 / 4, glyph: '¼', arabicWord: 'ربع' },
  { value: 1 / 3, glyph: '⅓', arabicWord: 'ثلث' },
  { value: 1 / 2, glyph: '½', arabicWord: 'نصف' },
  { value: 2 / 3, glyph: '⅔', arabicWord: 'ثلثا' },
  { value: 3 / 4, glyph: '¾', arabicWord: 'ثلاثة أرباع' },
];

/** Quarters and thirds land within this of their exact value after float arithmetic. */
const FRACTION_TOLERANCE = 0.005;

/**
 * A count, written the way each language writes it.
 *
 * Arabic names a bare fraction (`نصف`, `ربع`); both languages use the glyph once
 * there is a whole number in front of it (`1½`), because `واحد ونصف` beside a
 * tabular column of digits reads as prose rather than as a quantity.
 */
export function formatQuantity(value: number, locale: string): string {
  if (!Number.isFinite(value) || value <= 0) return '0';

  const whole = Math.floor(value + FRACTION_TOLERANCE);
  const remainder = value - whole;

  const fraction = FRACTIONS.find((candidate) => Math.abs(remainder - candidate.value) < FRACTION_TOLERANCE);

  if (!fraction) {
    // No recognisable fraction: two decimals, with trailing zeroes dropped so a
    // whole number never prints as "2.00".
    return String(Math.round(value * 100) / 100);
  }

  if (whole === 0) {
    return isArabicLocale(locale) ? fraction.arabicWord : fraction.glyph;
  }

  return `${whole}${fraction.glyph}`;
}

/**
 * The English plural of a unit label, applied only above one.
 *
 * `½ loaf`, `1 loaf`, `1½ loaves`. Arabic does not take this treatment — رغيف is
 * رغيف at every count in the way a dietitian writes it — so it is asked for
 * explicitly by {@link portionText} rather than applied to every label.
 */
export function pluralizeEnglishUnit(label: string, value: number): string {
  const lower = label.toLowerCase();
  if (value <= 1) return lower;

  const words = lower.split(' ');
  const last = words[words.length - 1] ?? '';

  // loaf → loaves, leaf → leaves. The catalog ships both, and "loafs" is wrong.
  const plural = last.endsWith('f')
    ? `${last.slice(0, -1)}ves`
    : /(s|x|z|ch|sh)$/.test(last)
      ? `${last}es`
      : `${last}s`;

  words[words.length - 1] = plural;
  return words.join(' ');
}

/**
 * Portions whose own label already names a fraction — `نصف كوب`, `ربع كوب`,
 * `نصف رغيف`.
 *
 * The catalog derives these from a measured cup or loaf (see
 * `portion-derivation.ts`), and they are perfectly good units to *enter* an amount
 * in. They are a poor unit to state a fractional count in: three quarters of a
 * half cup is arithmetically exact and reads as a riddle. Matched on the English
 * label because that is the derivation's own vocabulary and a closed set of five
 * words; the Arabic label is a translation of it, not a second source.
 */
const FRACTIONAL_LABEL = /^(half|quarter|third) /i;

/**
 * The point at which counting stops being how anyone states an amount.
 *
 * `فراولة 24 حبة` is not a portion a person counts out; `فراولة 288 غ` is a
 * portion they weigh. Ten is where the two cross for the foods this applies to —
 * small countable produce, which is the only family whose recipes reach these
 * numbers.
 *
 * Deliberately not applied to spoons, cups or loaves: `12 ملعقة أرز` is exactly
 * how a dietitian writes rice, and rewriting it into grams would be replacing
 * her unit with ours.
 */
const MAX_WRITTEN_COUNT = 10;
const COUNTED_LABELS = new Set(['Piece', 'Slice']);

/** `1½ رغيف` / `1½ loaves` — a count and its unit, in the reader's language. */
export function portionText(
  portion: { labelAr: string; labelEn: string },
  value: number,
  locale: string,
): string {
  const label = localizedPortionLabel(portion, locale);
  const written = isArabicLocale(locale) ? label : pluralizeEnglishUnit(label, value);

  return `${formatQuantity(value, locale)} ${written}`;
}

/**
 * One line's amount, written for the reader.
 *
 * The line arriving here is already the amount **in this meal** — scaled by
 * `mealIngredientLines`, or stored that way because the dietitian set it. Nothing
 * is multiplied here. The multiplier used to be a second argument every caller had
 * to remember to pass, which is exactly the kind of obligation that gets forgotten
 * on the one surface nobody re-reads.
 *
 * Falls back to the authoritative grams whenever the portion cannot be trusted to
 * describe the amount: no portion saved, a portion since retired (`portion_id` is
 * `on delete set null`, so the join simply finds nothing), a missing count, or a
 * non-positive weight. The grams are always there and are what the nutrition was
 * built from, so the fallback is never an approximation.
 */
export function ingredientAmount(
  ingredient: QuantifiableIngredient,
  locale: string,
): IngredientAmount {
  const { portion, portionQuantity } = ingredient;

  if (
    portion &&
    typeof portionQuantity === 'number' &&
    Number.isFinite(portionQuantity) &&
    portionQuantity > 0 &&
    portion.grams > 0
  ) {
    const tooManyToCount =
      COUNTED_LABELS.has(portion.labelEn) && portionQuantity > MAX_WRITTEN_COUNT;

    // "ثلاثة أرباع نصف كوب" is not a quantity anyone acts on. A whole number of
    // half-cups still is, so only the fractional case falls back.
    if (
      !tooManyToCount &&
      (Number.isInteger(portionQuantity) || !FRACTIONAL_LABEL.test(portion.labelEn))
    ) {
      return { kind: 'portion', text: portionText(portion, portionQuantity, locale) };
    }
  }

  return { kind: 'grams', grams: roundGrams(ingredient.quantityGrams, 1) };
}
