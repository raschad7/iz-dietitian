import { getTranslations } from 'next-intl/server';
import { NextResponse } from 'next/server';

import { PORTAL_BACKGROUND_COLOR, PORTAL_THEME_COLOR } from '@/features/portal/pwa/brand';
import { resolveLocale } from '@/i18n/params';
import { getLocaleDirection } from '@/i18n/routing';

/**
 * The client portal's web app manifest — one per locale, so the install
 * prompt's own name and text direction match whichever locale the client is
 * on rather than a single hardcoded one.
 *
 * This is a plain Route Handler, not Next's `manifest.ts` file convention:
 * that convention is only recognised at the app root, and scoping
 * installability to `/portal` (via `start_url`/`scope` below) needs a URL
 * this feature owns. Being a Route Handler, it also sits outside
 * `portal/layout.tsx`'s `requirePortalClient` guard — a manifest has to be
 * fetchable without a session, the same way a favicon is.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'portal.pwa' });

  const scope = `/${locale}/portal`;

  const tabs = await getTranslations({ locale, namespace: 'portal.tabs' });

  const manifest = {
    /**
     * The app's identity, and deliberately **not** the per-locale `start_url`
     * it would otherwise default to.
     *
     * `id` is what the browser uses to decide whether an install it already
     * has and the one being offered are the same app. Left unset it falls back
     * to `start_url`, which here carries the locale — so Arabic and English
     * were two separate installable apps, and a client who installed the
     * portal in Arabic and later switched to English in Settings had a
     * home-screen icon whose every launch was redirected out of its own scope
     * by `portalLocaleRedirect` in `proxy.ts`. One stable, locale-independent
     * string means the language is a property of the session, the way the rest
     * of the portal already treats it, rather than a property of the install.
     */
    id: '/portal',
    name: t('name'),
    short_name: t('shortName'),
    description: t('description'),
    lang: locale,
    dir: getLocaleDirection(locale),
    start_url: scope,
    scope,
    display: 'standalone',
    /**
     * No `orientation` lock.
     *
     * It used to say `'portrait'`, which Android honours literally: the
     * installed window refused to rotate, on a tablet held in landscape as
     * much as on a phone. The portal's layout is responsive in both
     * orientations — the tab bar goes to a rail at `lg`, and the safe-area
     * insets are read on all four edges — so there was never anything for the
     * lock to protect, and it cost every tablet client the orientation they
     * were already holding the device in. Leaving the field out entirely means
     * `any`, which is to say: follow the device.
     */
    background_color: PORTAL_BACKGROUND_COLOR,
    theme_color: PORTAL_THEME_COLOR,
    icons: [
      { src: '/api/pwa-icons/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/api/pwa-icons/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/api/pwa-icons/maskable-512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    /**
     * Long-press the installed icon and these are the three places worth
     * jumping straight to. Home is deliberately absent — it is what a plain
     * tap already does, and a shortcut that repeats the default spends a slot
     * saying nothing. Labels come from `portal.tabs`, the same namespace the
     * tab bar and rail read, so a shortcut can never name a destination
     * differently from the tab it lands on.
     */
    shortcuts: [
      { name: tabs('myAppointments'), url: `${scope}/appointments` },
      { name: tabs('progress'), url: `${scope}/progress` },
      { name: tabs('profile'), url: `${scope}/profile` },
    ],
  };

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
