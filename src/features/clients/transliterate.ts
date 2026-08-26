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

/**
 * The bounds a username is accepted between, mirrored in three other places:
 * the Better Auth `username` plugin (`src/lib/auth.ts`), `portalSignInSchema`
 * (`src/features/auth/schema.ts`), and `usernameSchema` in `./actions.ts`.
 * Nothing here may suggest a value one of them would then refuse.
 */
const MAX_USERNAME_LENGTH = 60;

/**
 * Room left for `-` and a code, so a long name cannot push a candidate past the
 * cap even after the code has grown a few times.
 */
const MAX_BASE_LENGTH = MAX_USERNAME_LENGTH - 9;

function slugify(value: string): string {
  return transliterateArabic(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * The name half of a suggested username: **the first name, and nothing else.**
 *
 * It used to be the whole name, which is how `علي حسن سلوكة` became
 * `aly-hsn-slwkh`. Three vowel-less parts is not a thing a person can read back
 * over a phone, and the two extra ones were carrying almost nothing: the code
 * in {@link pickUsername} separates two clients called علي far better than
 * their fathers' names did, in four characters instead of eleven.
 *
 * **The first *usable* word, not literally the first.** A roster holds names
 * typed with stray punctuation, and `splitName` splits on whitespace alone — so
 * `-- Sara --` would hand back `--`, slug to nothing, and land every such client
 * on the `client` fallback while the name sat right there in the second word.
 */
export function usernameBase(fullName: string): string {
  for (const word of fullName.trim().split(/\s+/)) {
    const slug = slugify(word);
    if (slug) return slug.slice(0, MAX_BASE_LENGTH).replace(/-$/, '');
  }
  return USERNAME_FALLBACK;
}

/**
 * The alphabet a username's code is drawn from: **no `i`, `l`, `o`, `0` or
 * `1`.**
 *
 * The same reasoning as `SAFE_ALPHABET` in `src/features/auth/password-policy.ts`,
 * and it matters more here, not less. A temporary password is copied once and
 * replaced; a username is read down a phone line, written on a card and typed
 * back for years. A code that can be heard or written as two different strings
 * is a support call every time.
 */
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** Four characters — 923,521 codes per name, which is what makes a repeat rare. */
const CODE_LENGTH = 4;

/**
 * How many codes of one length are tried before reaching for a longer one. Only
 * relevant once a single name has hundreds of thousands of clients on it.
 */
const ATTEMPTS_PER_LENGTH = 20;

/**
 * `crypto.getRandomValues`, matching `generateTemporaryPassword`. `Math.random`
 * would be adequate for uniqueness alone, but a guessable username is half of a
 * guessable sign-in and there is no reason to take the weaker source.
 *
 * The modulo is very slightly biased toward the start of a 31-character
 * alphabet. Irrelevant here: this value distinguishes clients, it does not
 * protect them.
 */
export function randomUsernameCode(length: number = CODE_LENGTH): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  let out = '';
  for (const byte of bytes) {
    out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return out;
}

/**
 * An unused username built on `base`: the name, then a distinct four-character
 * code — `rmdan-h7kp`.
 *
 * **Every username has a code, including the first one on a name.** A bare
 * `rmdan` beside a later `rmdan-h7kp` is the confusable pair this scheme exists
 * to prevent, and one shape for every client also means a dietitian reading one
 * out always knows how many parts to expect.
 *
 * **A code rather than a counter, and the difference is confusability.** The
 * counter this replaces was unique — `aly-2` and `aly-3` are different rows and
 * the unique index guaranteed it — but two clients an index apart got usernames
 * that differ by one character in the last position, which is exactly the pair a
 * person mishears, mistypes, and signs in as the wrong patient with. Two codes
 * differ in several positions and none of them mean anything, so there is
 * nothing to reconstruct wrongly from memory.
 *
 * ⚠ `taken` must hold every username already using this base — see
 * `suggestPortalUsername`, which is what fills it. A partial set produces a
 * candidate that looks free and is not. This is the *suggestion's* guarantee;
 * the unique index on `users.username` remains the one that cannot be raced.
 *
 * `code` is injected so the tests can drive a known sequence. Nothing in the
 * application passes it.
 */
export function pickUsername(
  base: string,
  taken: ReadonlySet<string>,
  code: (length: number) => string = randomUsernameCode,
): string {
  /*
    Terminates: `taken` is finite, and each longer code multiplies the available
    space by 31 — so a length is always reached at which some candidate is free.
    In practice the first draw returns.
  */
  for (let length = CODE_LENGTH; ; length += 1) {
    for (let attempt = 0; attempt < ATTEMPTS_PER_LENGTH; attempt += 1) {
      const candidate = `${base}-${code(length)}`;
      if (!taken.has(candidate)) return candidate;
    }
  }
}
