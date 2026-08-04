import { NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Sans_Arabic, Readex_Pro } from 'next/font/google';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';

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
 * The Arabic UI face — licensed, so it is self-hosted rather than fetched from
 * Google. It is attached to <html> **only on the Arabic locale** (see the
 * `className` below) and consumed only by the `:lang(ar)` block in globals.css,
 * so an English page neither downloads it nor references it.
 *
 * Served as woff2 (~53-57KB each); the licensed `.ttf`s sit beside them as the
 * sources these bytes were compressed from and are not read by the build.
 *
 * **Three real weights, and that covers four.** 400/500/700 are the
 * `usWeightClass` values in the files themselves, not guesses. `font-semibold`
 * (600) has no file of its own, but CSS weight matching resolves a desired
 * weight above 500 by walking *upwards* first — so 600 lands on the real 700
 * outlines rather than being synthesised from 400. That matters because faked
 * bold smears the outlines, which is the defect the note on `ibmPlexMono` below
 * describes; every weight this app actually uses now has real glyphs behind it.
 */
const neoSansArabic = localFont({
  src: [
    { path: '../fonts/NeoSansArabic-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/NeoSansArabic-Medium.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/NeoSansArabic-Bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-neo-sans-arabic',
  display: 'swap',
  // The Arabic fallback already in the stack, so the swap-in is not a reflow.
  adjustFontFallback: false,
  /*
   * `preload: false` is load-bearing, not a tuning knob. Next emits its
   * `<link rel="preload">` from the module graph, not from what a render
   * actually used — so with preload on, the English build shipped a preload for
   * this font and every English visitor downloaded 57KB of Arabic they never
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
    Neo Sans Arabic is attached to the Arabic locale only. Gating it on the
    locale rather than shipping it everywhere and letting `:lang(ar)` pick it up
    is what keeps English clean: with the variable absent, an English document
    has no declaration referring to the family, so the browser has no reason to
    fetch it and the English stack is byte-for-byte what it was.

    `:lang(ar)` in globals.css still resolves `--font-neo-sans-arabic` with a
    fallback, so an Arabic name or note inside an *English* page — where this
    class is deliberately missing — degrades to IBM Plex Sans Arabic instead of
    invalidating the whole `font-family` declaration.
  */
  const fontVariables = [
    ibmPlexSans.variable,
    ibmPlexSansArabic.variable,
    readexPro.variable,
    ibmPlexMono.variable,
    locale === 'ar' ? neoSansArabic.variable : null,
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
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
