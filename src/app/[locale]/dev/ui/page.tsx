import { notFound } from 'next/navigation';

import { resolveLocale } from '@/i18n/params';

import { UiGallery } from './gallery';

type DevUiPageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * Every shared control on one page, so the shadcn migration has somewhere to be
 * reviewed.
 *
 * The `shadcn-revamp` branch replaces most of `components/ui` a few components
 * at a time. Checking each swap against the four axes the UI workflow asks for —
 * Arabic and English, light and dark, mobile and desktop — means finding a
 * screen that happens to use the control, in the right locale, in the right
 * state. Half of them are behind a dialog inside a form. This is that, once,
 * with every variant visible at the same time.
 *
 * Direction comes from the route (`/ar/dev/ui` against `/en/dev/ui`) rather than
 * a toggle on the page, because `dir` is set on `<html>` by the locale layout
 * and `DirectionProvider` reads the same locale. A switch here would move one
 * and not the other, which is the exact bug class this page exists to catch.
 *
 * Dev-only: it renders nothing but a 404 in production. It ships no data access
 * and no session guard, and it should never acquire either — the moment it
 * needs a clinic it has stopped being a component gallery.
 */
export default async function DevUiPage({ params }: DevUiPageProps) {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  const locale = await resolveLocale(params);

  return <UiGallery locale={locale} />;
}
