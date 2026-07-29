import { foldArabic } from './search';

/**
 * Arabic → Latin, for suggesting portal usernames.
 *
 * APPROXIMATE BY NATURE, and that is why the dietitian can edit the result.
 * Arabic script does not write short vowels, so `أحمد` maps to `ahmd` and not
 * `ahmad`. No mapping recovers them; a human reading the suggestion fixes it in
 * seconds. Do not add heuristics that guess vowels — they are wrong more often
 * than they are right, and a wrong guess is worse than an obviously terse one.
 */
const LETTERS: Record<string, string> = {
  ا: 'a', ب: 'b', ت: 't', ث: 'th', ج: 'j', ح: 'h', خ: 'kh',
  د: 'd', ذ: 'dh', ر: 'r', ز: 'z', س: 's', ش: 'sh', ص: 's',
  ض: 'd', ط: 't', ظ: 'z', ع: 'a', غ: 'gh', ف: 'f', ق: 'q',
  ك: 'k', ل: 'l', م: 'm', ن: 'n', ه: 'h', و: 'w', ي: 'y',
};

export function transliterateArabic(value: string): string {
  // Reuse the folding already used for search, so the two never disagree about
  // what counts as the "same" letter: alef variants, taa marbuta, tashkeel.
  // Only the folding half, not the lowercasing — Latin input keeps its case.
  const folded = foldArabic(value);

  let out = '';
  for (const char of folded) {
    if (char === 'ء') continue; // hamza carries no Latin letter of its own
    out += LETTERS[char] ?? char;
  }
  return out;
}

const USERNAME_FALLBACK = 'client';

/** Four digits, so a suggestion is unique often enough to rarely need a redraw. */
function randomSuffix(): string {
  return String(Math.floor(Math.random() * 10_000)).padStart(4, '0');
}

/**
 * Suggests a portal username from a client's name. The dietitian edits it before
 * the account is created, so this optimises for "recognisable", not "correct".
 */
export function suggestUsername(fullName: string): string {
  const base = transliterateArabic(fullName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return `${base || USERNAME_FALLBACK}-${randomSuffix()}`;
}
