import { notFound } from 'next/navigation';

import { resolveLocale } from '@/i18n/params';

import { SplashHarness } from './harness';

type SplashPageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * The launch screen, replayable.
 *
 * Dev-only like the gallery and the two harnesses beside it: 404 in production,
 * no data access and no session guard. Unlike them it is not scaffolding for a
 * decision that is about to be made and thrown away — the real screen is behind
 * a login on both shells and plays once per cold start, so this is the only
 * practical way to look at a change to it. Keep it.
 *
 * Both locales are worth a look even though nothing here is translated: the
 * wordmark is Arabic outlines either way, but the page around it flips, and the
 * tile is `position: fixed` full-bleed in a document that is `dir="rtl"` half
 * the time.
 */
export default async function SplashPage({ params }: SplashPageProps) {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  await resolveLocale(params);

  return <SplashHarness />;
}
