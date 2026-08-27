import path from 'node:path';

import { Font } from '@react-pdf/renderer';

/**
 * The two faces a bill is set in, embedded into every PDF this feature makes.
 *
 * ## Why font files are committed rather than fetched
 *
 * The app's own faces come from `next/font/google`, which downloads them at
 * build time and hands the browser a CSS `@font-face`. A PDF has no browser:
 * `@react-pdf/renderer` embeds the actual outlines into the file, so it needs
 * the binary, and it needs it on the server at request time. Fetching from
 * fonts.gstatic.com on each render would put a third-party network call in the
 * path of printing a receipt — one that fails silently into a blank page the
 * first time the clinic's connection blinks. These are the same two typefaces
 * the interface uses (Almarai and IBM Plex Sans), both OFL, checked in beside
 * the code that reads them.
 *
 * ## Why Almarai is not optional
 *
 * `@react-pdf/renderer`'s built-in Helvetica has no Arabic glyphs at all — an
 * Arabic bill set in it comes out as a page of empty boxes, and this clinic
 * works in Arabic. Almarai carries Latin as well, which is what makes it safe
 * for the Arabic bill's mixed content: a subscriber's name may be in either
 * script, and an amount is always Latin digits.
 *
 * Registration is global to the process and must happen once. `registerFonts`
 * is idempotent, and every render path calls it rather than relying on import
 * order — a module-level side effect would work until the day something
 * tree-shakes it.
 */

export const ARABIC_FAMILY = 'Almarai';
export const LATIN_FAMILY = 'IBM Plex Sans';

/**
 * Where the four files sit, resolved from the project root.
 *
 * `Font.register` takes a path and reads it itself — it has no overload for
 * bytes — so this has to be a location the server process can find at request
 * time. `process.cwd()` is the project root under `next dev`, `next start` and
 * `bun test` alike; these files are checked in, so they are on disk in all
 * three.
 */
const FONT_DIR = path.join(process.cwd(), 'src', 'features', 'billing', 'pdf', 'fonts');

function file(name: string): string {
  return path.join(FONT_DIR, name);
}

let registered = false;

export function registerFonts(): void {
  if (registered) return;
  registered = true;

  Font.register({
    family: ARABIC_FAMILY,
    fonts: [
      { src: file('Almarai-Regular.ttf'), fontWeight: 400 },
      { src: file('Almarai-Bold.ttf'), fontWeight: 700 },
    ],
  });

  Font.register({
    family: LATIN_FAMILY,
    fonts: [
      { src: file('IBMPlexSans-Regular.ttf'), fontWeight: 400 },
      { src: file('IBMPlexSans-SemiBold.ttf'), fontWeight: 600 },
    ],
  });

  /*
    Nothing here is hyphenated. The renderer's default hyphenation callback
    breaks words at its own guesses, which is wrong for Arabic (it does not
    hyphenate) and wrong for a subscriber's name in either script. Returning the
    word whole lets it wrap at spaces like the rest of the app does.
  */
  Font.registerHyphenationCallback((word) => [word]);
}
