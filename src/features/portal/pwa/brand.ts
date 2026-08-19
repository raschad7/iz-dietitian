/**
 * The portal's PWA brand colours, defined once as plain TS constants rather
 * than a CSS custom property.
 *
 * `src/app/globals.css` is the single source of truth for the token values
 * themselves (`--primary: #75CF48`, `--background: var(--n-0)` / `#FFFFFF`
 * in light mode — the portal is fixed to light appearance, see
 * `portal-theme.tsx`), but a web app manifest and a `<meta name="theme-color">`
 * tag are read by the OS/browser chrome before any stylesheet loads, so they
 * need a literal value, not `var(--primary)`. This file is the one place that
 * literal is allowed to live — every other `.tsx`/`.jsx` file in the app is
 * linted against raw hex (`eslint-rules/no-raw-hex.mjs`), which is exactly
 * why these constants are exported from here instead of inlined at each call
 * site.
 */
export const PORTAL_THEME_COLOR = '#75CF48';
export const PORTAL_BACKGROUND_COLOR = '#FFFFFF';
