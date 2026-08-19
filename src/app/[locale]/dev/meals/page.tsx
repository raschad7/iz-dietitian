import { notFound } from 'next/navigation';

import { resolveLocale } from '@/i18n/params';

import { MealsHarness } from './harness';

type DevMealsPageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * A dev-only harness for the meal-quantity interface.
 *
 * `/app/plans/**` is behind the staff session guard and the portal behind a client
 * one, and browser automation cannot pass either. This page renders the same
 * components — the staff meal panel, editable and read-only, and the client
 * portal's meal card — over fixtures covering mixed units, a grams-only meal and a
 * long ingredient list, so the display can be driven and screenshotted in both
 * languages without an account.
 *
 * Dev-only: 404 in production. It ships no data access and no session guard, and
 * must never acquire either — the same contract as `/dev/dishes` and `/dev/ui`.
 */
export default async function DevMealsPage({ params }: DevMealsPageProps) {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  const locale = await resolveLocale(params);

  return <MealsHarness locale={locale} />;
}
