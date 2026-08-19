import { getTranslations } from 'next-intl/server';
import { NextResponse } from 'next/server';

import { APP_BACKGROUND_COLOR, APP_THEME_COLOR_LIGHT } from '@/features/app-pwa/brand';
import { resolveLocale } from '@/i18n/params';
import { getLocaleDirection } from '@/i18n/routing';

/**
 * The staff app's web app manifest — the practitioner-side counterpart to
 * `portal/manifest.webmanifest/route.ts`, and deliberately a second app rather
 * than a second entry point into the first.
 *
 * ## Why two apps and not one
 *
 * They are used by different people, on different devices, with different
 * sessions. A dietitian installs this on the clinic's tablet; a client installs
 * the portal on their phone. `id`, `scope` and `start_url` are all distinct, so
 * the two can be installed side by side on one device — a clinic tablet that
 * also demonstrates the client experience — without either replacing the other.
 * Their icons are inverses of each other for the same reason; see `MARKS` in
 * `api/pwa-icons/[size]/route.tsx`.
 *
 * ## The same structural decisions as the portal's
 *
 * A Route Handler rather than Next's root-only `manifest.ts` convention,
 * because `scope` has to carry the locale prefix every URL in this app already
 * has. Being a Route Handler it also sits outside `app/layout.tsx`'s
 * `requireStaffClinic` guard, which is required — a manifest has to be
 * fetchable before anyone has signed in, the same way a favicon is.
 *
 * ⚠ `scope` and `start_url` are written **without** a trailing slash, and
 * `service-worker-register.tsx` registers the worker with exactly the same
 * string. Service worker scope is a literal prefix match, so `/ar/app` is not
 * inside `/ar/app/` — that mismatch is what kept the portal from ever becoming
 * installable, and it is not worth rediscovering here.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'app' });
  const nav = await getTranslations({ locale, namespace: 'nav' });

  const scope = `/${locale}/app`;

  const manifest = {
    /*
      Locale-independent, so switching the interface language does not orphan
      an installed tile — see the longer note on the portal's own `id`.
    */
    id: '/app',
    name: t('name'),
    short_name: t('shortName'),
    description: t('tagline'),
    lang: locale,
    dir: getLocaleDirection(locale),
    start_url: scope,
    scope,
    display: 'standalone',
    /*
      No `orientation`. This one is a clinic tablet's app above all — the
      device it is used on is held in landscape as often as portrait, and the
      staff shell is responsive in both.
    */
    background_color: APP_BACKGROUND_COLOR,
    /*
      One value, because a manifest has no media queries. The light/dark pair
      that actually follows the dietitian's system appearance is emitted as
      `<meta name="theme-color">` from `generateViewport` in the staff layout;
      this is only the colour the OS paints behind the icon while the app
      launches.
    */
    theme_color: APP_THEME_COLOR_LIGHT,
    icons: [
      { src: '/api/pwa-icons/staff-192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/api/pwa-icons/staff-512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/api/pwa-icons/staff-maskable-512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    /*
      The three screens a working day actually starts on. The dashboard is
      absent because a plain tap already lands there. Labels come from `nav`,
      the same namespace the rail reads, so a shortcut can never name a
      destination differently from the row it corresponds to.
    */
    shortcuts: [
      { name: nav('clients'), url: `${scope}/clients` },
      { name: nav('calendar'), url: `${scope}/calendar` },
      { name: nav('weeklyPlans'), url: `${scope}/weekly-plans` },
    ],
  };

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
