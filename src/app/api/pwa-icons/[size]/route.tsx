import { ImageResponse } from 'next/og';
import { NextResponse } from 'next/server';

import { PORTAL_THEME_COLOR } from '@/features/portal/pwa/brand';

/**
 * Generated PWA icon artwork for the client portal manifest, apple-touch-icon
 * and browser tab favicon — there is no existing brand mark asset anywhere in
 * the repo (`public/` did not exist before this feature), so this draws a
 * simple placeholder mark from the portal's own brand token (`--primary`,
 * `#72AE34`) rather than shipping a raster file that could drift from it.
 *
 * `next/og`'s `ImageResponse` ships with Next.js itself, so this needs no new
 * dependency. Route handlers are not wrapped by any parent `layout.tsx`, so
 * this sits outside the portal's `requirePortalClient` auth guard on purpose
 * — a manifest icon has to be fetchable by the browser/OS without a session.
 *
 * **Lives under `/api/`, not `/pwa-icons/` directly.** `src/proxy.ts`
 * (Next 16's renamed `middleware.ts`) runs `next-intl`'s locale-detection
 * redirect on every path except `api`, `_next`, `_vercel`, and anything with
 * a dot in it — `/pwa-icons/192` has no extension, so it was being redirected
 * to a locale-prefixed URL (`/ar/pwa-icons/192`) that does not exist and
 * 404ing. `/api/*` is one of the proxy's own exclusions, so this sidesteps
 * that without touching `proxy.ts`'s matcher, which is shared with the rest
 * of the app.
 */

const SIZES = {
  '192': { px: 192, radius: 0 },
  '512': { px: 512, radius: 0 },
  'maskable-512': { px: 512, radius: 0 },
  'apple-180': { px: 180, radius: 0 },
} as const;

type SizeKey = keyof typeof SIZES;

function isSizeKey(value: string): value is SizeKey {
  return value in SIZES;
}

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: rawSize } = await params;

  if (!isSizeKey(rawSize)) {
    return NextResponse.json({ error: 'Unknown icon size' }, { status: 404 });
  }

  const { px } = SIZES[rawSize];
  // The maskable variant is rendered by the OS inside a shape that can crop
  // up to the outer ~20% of the canvas (Android's "safe zone"), so its mark
  // is drawn smaller than the regular icons' to stay clear of that crop.
  const markSize = rawSize === 'maskable-512' ? px * 0.5 : px * 0.62;

  const response = new ImageResponse(
    (
      <div
        style={{
          width: px,
          height: px,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: PORTAL_THEME_COLOR,
        }}
      >
        <div
          style={{
            width: markSize,
            height: markSize,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: markSize * 0.72,
          }}
        >
          🥗
        </div>
      </div>
    ),
    { width: px, height: px },
  );

  response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');

  return response;
}
