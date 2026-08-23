import { notFound } from 'next/navigation';

import { resolveLocale } from '@/i18n/params';

import { MascotHarness } from './harness';

type MascotPageProps = {
  params: Promise<{ locale: string }>;
};

/** Temporary diagnostic harness — not for keeping. */
export default async function MascotPage({ params }: MascotPageProps) {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  await resolveLocale(params);

  return <MascotHarness />;
}
