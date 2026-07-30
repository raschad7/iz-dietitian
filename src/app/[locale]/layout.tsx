import { NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Sans_Arabic, Readex_Pro } from 'next/font/google';
import type { ReactNode } from 'react';

import { DevLocaleSwitcher } from '@/components/layout/locale-switcher';
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

/** font.display — headings only, both scripts (§04, §15). */
const readexPro = Readex_Pro({
  subsets: ['arabic', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-readex-pro',
  display: 'swap',
});

/** Token/ID display only — never client-facing copy (design-system.md). */
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
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

  return (
    // `lang` and `dir` are both derived from the route's locale — never hardcoded.
    <html lang={locale} dir={getLocaleDirection(locale)} suppressHydrationWarning>
      {/*
        `suppressHydrationWarning` is needed on <body> as well as <html>: it only
        applies one level deep, and browser extensions (ColorZilla, Grammarly and
        friends) inject attributes like `cz-shortcut-listen` onto the body before
        React hydrates, which otherwise reports as a hydration mismatch.
      */}
      <body
        suppressHydrationWarning
        className={`${ibmPlexSans.variable} ${ibmPlexSansArabic.variable} ${readexPro.variable} ${ibmPlexMono.variable} min-h-dvh antialiased`}
      >
        <NextIntlClientProvider>
          {children}
          <DevLocaleSwitcher />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
