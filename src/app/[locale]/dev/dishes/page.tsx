import { notFound } from 'next/navigation';

import { resolveLocale } from '@/i18n/params';

import { DishesHarness } from './harness';

type DevDishesPageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * A dev-only harness for the rebuilt dish editor and ingredient search.
 *
 * The real `/app/dishes` screen is behind the staff session guard, which browser
 * automation cannot pass. This page renders the same components against an
 * injected mock search (built on the real `refineIngredientResults`, so the
 * Arabic-first / dedup / ranking behaviour is genuine) so the interaction can be
 * driven and screenshotted without a clinic.
 *
 * Dev-only: 404 in production. It ships no data access and no session guard, and
 * must never acquire either — the same contract as `/dev/ui`.
 */
export default async function DevDishesPage({ params }: DevDishesPageProps) {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  const locale = await resolveLocale(params);

  return <DishesHarness locale={locale} />;
}
