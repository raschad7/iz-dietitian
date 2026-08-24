import { notFound } from 'next/navigation';

import { resolveLocale } from '@/i18n/params';

import { BoardHarness } from './harness';

type DevBoardPageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * A dev-only harness for the weekly-plan board.
 *
 * `/app/weekly-plans/**` is behind the staff session guard, and browser
 * automation may not enter a password — so the one screen in this product with
 * seven columns, thirty-five cards, a sticky rail and three breakpoints was
 * also the one screen that could never be looked at while it was being changed.
 * This renders the real `PlanBoard` over a fixture week, so the header, the day
 * columns, the meal cards, the drag preview, the notes popover and the toasts
 * can all be driven and screenshotted at any width, in either language.
 *
 * Dev-only: 404 in production. It ships no data access and no session guard,
 * and must never acquire either — the same contract as `/dev/meals`,
 * `/dev/dishes` and `/dev/ui`.
 */
export default async function DevBoardPage({ params }: DevBoardPageProps) {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  const locale = await resolveLocale(params);

  return <BoardHarness locale={locale} />;
}
