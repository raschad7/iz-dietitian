import { notFound } from 'next/navigation';

import { resolveLocale } from '@/i18n/params';

import { DialogMotionHarness } from './harness';

type DialogMotionPageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * Candidate dialog entrances, side by side, before one of them becomes the
 * app's.
 *
 * Dev-only like the gallery and the shell harness beside it: 404 in production,
 * no data access and no session guard. Everything it defines lives in this
 * directory — the animations are a CSS Module, so nothing here can reach a real
 * screen even by accident.
 *
 * Delete the directory once a variant is chosen and moved into `globals.css`.
 */
export default async function DialogMotionPage({ params }: DialogMotionPageProps) {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  await resolveLocale(params);

  return <DialogMotionHarness />;
}
