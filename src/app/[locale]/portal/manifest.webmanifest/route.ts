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

  const manifest = {
    name: t('name'),
    short_name: t('shortName'),
    description: t('description'),
    lang: locale,
    dir: getLocaleDirection(locale),
    start_url: scope,
    scope,
    display: 'standalone',
    orientation: 'portrait',
    background_color: PORTAL_BACKGROUND_COLOR,
    theme_color: PORTAL_THEME_COLOR,
    icons: [
      { src: '/api/pwa-icons/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/api/pwa-icons/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/api/pwa-icons/maskable-512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
