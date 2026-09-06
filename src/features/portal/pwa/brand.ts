/**
 * The portal's PWA brand colours, defined once as plain TS constants rather
 * than a CSS custom property.
 *
 * `src/app/globals.css` is the single source of truth for the token values
 * themselves (`--primary: var(--green-400)` / `#75CF48`, `--background:
 * var(--n-0)` / `#FFFFFF`
 * in light mode — the portal is fixed to light appearance, see
 * `portal-theme.tsx`), but a web app manifest and a `<meta name="theme-color">`
 * tag are read by the OS/browser chrome before any stylesheet loads, so they
 * need a literal value, not `var(--primary)`. This file is the one place that
 * literal is allowed to live — every other `.tsx`/`.jsx` file in the app is
 * linted against raw hex (`eslint-rules/no-raw-hex.mjs`), which is exactly
 * why these constants are exported from here instead of inlined at each call
 * site.
 */
/**
 * `--primary` in light mode: `--green-400` / `#75CF48`.
 *
 * ⚠ **It was `#72AE34` — the olive from before the rebrand.** This file is a
 * transcription of a token, and a transcription only stays true if somebody
 * copies the value across when the token moves; nobody did when the olive ramp
 * became the leaf-green one, so an installed portal painted its status bar and
 * its manifest in a green the application itself had stopped drawing anywhere.
 * The one place it showed was the one place hardest to notice: the OS chrome
 * above the app, before any stylesheet has loaded.
 *
 * If `--primary` moves again, move this in the same commit.
 */
export const PORTAL_THEME_COLOR = '#75CF48';
export const PORTAL_BACKGROUND_COLOR = '#FFFFFF';
