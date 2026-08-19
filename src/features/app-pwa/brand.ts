/**
 * The staff app's PWA brand colours, the counterpart to
 * `src/features/portal/pwa/brand.ts`.
 *
 * Same reason that file exists: a web app manifest and a `<meta
 * name="theme-color">` are read by the OS before any stylesheet loads, so they
 * need literal values rather than `var(--background)`. `globals.css` remains
 * the source of truth for the tokens themselves; these are transcriptions of
 * it, and `eslint-rules/no-raw-hex.mjs` is why they are exported from a `.ts`
 * here instead of being inlined at the call site.
 *
 * **Two colours, unlike the portal's one.** The portal is pinned to light
 * appearance (`portal-theme.tsx`), so it has a single theme colour. The staff
 * app follows the system — `globals.css` defines a `.dark` block and a
 * `prefers-color-scheme` block — so its browser chrome has to follow too, or a
 * dietitian working in dark mode gets a white status bar above a near-black
 * app. `generateViewport` in `[locale]/app/layout.tsx` emits both with the
 * matching `media` queries.
 *
 * These are `--background`, not `--primary`. The staff app's top edge is its
 * app bar, which is the page background rather than a brand fill — a green
 * status bar would be a band of colour the app itself never shows. The portal
 * uses `--primary` because its own header genuinely is olive.
 */

/** `--background` in light mode: `--n-0`. */
export const APP_THEME_COLOR_LIGHT = '#FFFFFF';

/** `--background` in dark mode: `--olive-950`. */
export const APP_THEME_COLOR_DARK = '#16220D';

/**
 * The manifest's `background_color` — the splash screen the OS paints before
 * the first frame renders. One value, not a pair: a manifest has no media
 * queries, and light is the appearance the app opens in unless the device says
 * otherwise.
 */
export const APP_BACKGROUND_COLOR = '#FFFFFF';

/** The mark's fill on the generated staff icons — the brand olive, `--primary`. */
export const APP_ICON_COLOR = '#72AE34';
