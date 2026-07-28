import { NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Sans_Arabic } from 'next/font/google';
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
      <body className={`${ibmPlexSans.variable} ${ibmPlexSansArabic.variable} min-h-dvh antialiased`}>
        <NextIntlClientProvider>
          {children}
          <DevLocaleSwitcher />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
