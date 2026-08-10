import { NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import {
  Almarai,
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  IBM_Plex_Sans_Arabic,
  Readex_Pro,
  Tajawal,
} from 'next/font/google';
import type { ReactNode } from 'react';

import { DirectionProvider } from '@/components/ui/direction';
import { Toaster } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import { resolveLocale } from '@/i18n/params';
import { getLocaleDirection, routing } from '@/i18n/routing';

import '../globals.css';

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-plex-sans',
  display: 'swap',
});

const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-plex-sans-arabic',
  display: 'swap',
});

/**
 * The Arabic UI face — Almarai, an OFL-licensed Google font, so (like
 * Alexandria before it, and unlike the original Neo Sans Arabic) it needs no
 * local files or licence gymnastics: `next/font/google` fetches and
 * self-hosts it at build time. It is attached to <html> **only on the Arabic
 * locale** (see the `className` below) and consumed only by the `:lang(ar)`
 * block in globals.css, so an English page neither downloads it nor
 * references it.
 *
 * **Two real weights, and they cover four.** Almarai ships static 400/700/800
 * files and no variable axis; 500 and 600 have no file of their own, but the
 * CSS font-matching algorithm doesn't fake them — it picks the nearest
 * *already-loaded* face instead. Desired weights at or below 500 search
 * downward first, so `font-medium` (500) resolves to the real 400 outlines;
 * desired weights above 500 search upward first, so `font-semibold` (600)
 * resolves to the real 700 outlines. `font-normal` and `font-bold` are exact
 * matches. Nothing is synthesised — see "Synthesised bold" below for why that
 * distinction matters. 800 is not loaded: nothing in the type scale asks for
 * it, so shipping it would be dead weight.
 */
const almarai = Almarai({
  subsets: ['arabic', 'latin'],
  weight: ['400', '700'],
  variable: '--font-almarai',
  display: 'swap',
  // The Arabic fallback already in the stack, so the swap-in is not a reflow.
  adjustFontFallback: false,
  /*
   * `preload: false` is load-bearing, not a tuning knob. Next emits its
   * `<link rel="preload">` from the module graph, not from what a render
   * actually used — so with preload on, the English build shipped a preload for
   * this font and every English visitor downloaded Arabic glyphs they never
   * render. Gating the CSS variable on the locale does not prevent that; only
   * this does. Verified by grepping the prerendered `en.html`.
   *
   * The cost is that Arabic discovers the font after CSS parses instead of in
   * the initial scan. `display: 'swap'` covers that gap with IBM Plex Sans
   * Arabic, which is the same face the stack falls back to anyway.
   */
  preload: false,
});

/** font.display — headings only, both scripts (§04, §15). */
const readexPro = Readex_Pro({
  subsets: ['arabic', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-readex-pro',
  display: 'swap',
});

/**
 * The weekly planner's face, and only the planner's.
 *
 * Scoped by `.planner-theme` in globals.css rather than by locale: the board is
 * a dense working surface in both languages, and Tajawal's rounder, more open
 * shapes hold up better at 12–14px in a grid of thirty-five cards than either
 * of the app's two body faces do. Nothing else in the app uses it.
 *
 * **400 / 500 / 700, and that covers four weights.** Tajawal ships no 600 —
 * the family jumps 500 → 700 — but CSS weight matching resolves a desired
 * weight above 500 by walking *upwards* first, so `font-semibold` lands on the
 * real 700 outlines rather than being synthesised from 400. That is the same
 * mechanism `almarai` above relies on, and it is why the 600 baked into
 * the `heading-*` and `label` steps of the scale needs no special handling
 * here. 200/300/800/900 are deliberately not loaded: nothing asks for them and
 * each is another file on a page that already ships a board.
 *
 * `preload: false` for the same reason it is set on the Arabic face — Next
 * emits its preload link from the module graph rather than from what a render
 * actually used, so preloading here would make every page in the app fetch a
 * font only the planner draws with. The variable is attached to <html> in both
 * locales, but a browser only downloads a face something on the page renders
 * in, so the cost lands on the planner and nowhere else.
 */
const tajawal = Tajawal({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '700'],
  variable: '--font-tajawal',
  display: 'swap',
  preload: false,
});

/** Token/ID display only — never client-facing copy (design-system.md). */
/**
 * Numeric / code display only — never client-facing prose.
 *
 * 600 is loaded because the dashboard stat tiles use `font-semibold` on it.
 * Without the real weight the browser synthesizes bold by smearing the 400
 * outlines, which at any size reads as a blurry, badly-rendered glyph — the
 * single most common cause of "the font looks pixelated". Every weight used
 * with a family must actually be loaded for that family.
 */
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
});

type LocaleLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Omit<LocaleLayoutProps, 'children'>): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'app' });

  return {
    title: { default: t('name'), template: `%s · ${t('shortName')}` },
    description: t('tagline'),
  };
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const locale = await resolveLocale(params);

  /*
    Almarai is attached to the Arabic locale only. Gating it on the locale
    rather than shipping it everywhere and letting `:lang(ar)` pick it up is
    what keeps English clean: with the variable absent, an English document
    has no declaration referring to the family, so the browser has no reason to
    fetch it and the English stack is byte-for-byte what it was.

    `:lang(ar)` in globals.css still resolves `--font-almarai` with a
    fallback, so an Arabic name or note inside an *English* page — where this
    class is deliberately missing — degrades to IBM Plex Sans Arabic instead of
    invalidating the whole `font-family` declaration.
  */
  const fontVariables = [
    ibmPlexSans.variable,
    ibmPlexSansArabic.variable,
    readexPro.variable,
    ibmPlexMono.variable,
    // Scoped to the weekly planner board, so it is attached in both locales.
    tajawal.variable,
    locale === 'ar' ? almarai.variable : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    /*
      `lang` and `dir` are both derived from the route's locale — never hardcoded.

      The next/font variables belong on <html>, not <body>: globals.css sets
      `font-family` on the html element, and a custom property is only visible
      to the element that declares it and its descendants. With the variables
      on <body>, html resolved `var(--font-ibm-plex-sans-arabic)` to nothing,
      fell through to the `ui-sans-serif, system-ui` fallback, and <body>
      inherited that already-computed value — so every piece of body text
      silently rendered in the system font. Headings looked correct only
      because `font-heading` re-declares the family further down the tree,
      where the variables do exist.
    */
    <html
      lang={locale}
      dir={getLocaleDirection(locale)}
      suppressHydrationWarning
      className={fontVariables}
    >
      {/*
        `suppressHydrationWarning` is needed on <body> as well as <html>: it only
        applies one level deep, and browser extensions (ColorZilla, Grammarly and
        friends) inject attributes like `cz-shortcut-listen` onto the body before
        React hydrates, which otherwise reports as a hydration mismatch.
      */}
      {/*
        No `antialiased`. It maps to `-webkit-font-smoothing: antialiased`,
        which forces grayscale antialiasing in place of the subpixel rendering
        the OS would otherwise use — that thins every stroke, and thin strokes
        are exactly what falls apart at 12–13px. It is a no-op on Windows
        (DirectWrite ignores it) but actively costs legibility on macOS, so
        there is nothing to trade off.
      */}
      <body suppressHydrationWarning className="min-h-dvh">
        {/*
          No floating locale switcher here. The switcher lives in the app bar
          (`Header`) and on the login screens, which is the only place it should
          be — a second copy pinned to the corner shadowed the real one in dev
          and sat on top of page content.
        */}
        {/*
          `dir` on <html> styles the page, but it does not reach Base UI.

          Base UI reads direction from `DirectionProvider` context alone, which
          defaults to `ltr` — its docs are explicit that the provider "does not
          affect HTML and CSS" and that the `dir` attribute "must be set
          additionally by your own application code". The two are separate
          channels and this app was only feeding one of them, so every Base UI
          popup has been computing its anchor, its flip and its arrow-key
          direction as if the page were English, on Arabic too.

          That is why the provider wraps everything rather than sitting beside
          the components that need it today: the value is a property of the
          locale, and every popup added from here on reads it.
        */}
        <DirectionProvider direction={getLocaleDirection(locale)}>
          <NextIntlClientProvider>
            {/*
              One provider for the app: Base UI shares hover timing across
              tooltips through it, so moving between two icon buttons opens the
              second immediately instead of waiting out the delay again.
            */}
            <TooltipProvider>{children}</TooltipProvider>

            {/*
              One viewport for the whole app, mounted once here rather than per
              screen: `toast()` is called from anywhere and has to land
              somewhere, and a second viewport would give two of them.

              **It takes `dir` explicitly, unlike every other popup here.**
              This is sonner, not Base UI, so `DirectionProvider` above means
              nothing to it — that context is Base UI's own channel. The
              toaster is outside the page's layout flow, so it cannot inherit
              the `dir` on <html> the way in-flow content does either.
            */}
            <Toaster dir={getLocaleDirection(locale)} />
          </NextIntlClientProvider>
        </DirectionProvider>
      </body>
    </html>
  );
}
