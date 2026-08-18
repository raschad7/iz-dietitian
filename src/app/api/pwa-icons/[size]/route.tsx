import { ImageResponse } from 'next/og';
import { NextResponse } from 'next/server';

import { BRAND_LEAF, BRAND_ON_COLOR, renderBrandMarkSvg, svgDataUri } from '@/features/brand/logo';

/**
 * The PNG app icons: the client portal's manifest icons and the apple-touch
 * icon, plus the staff app's home-screen icon.
 *
 * These draw the real brand mark — the leaf, reversed out of a brand-green
 * tile — from the shared geometry in `@/features/brand/logo`. They used to
 * draw lucide's `salad` glyph as a placeholder, from before the repo had a
 * brand asset at all.
 *
 * **Reversed on a green tile, not the mark on white.** A home-screen icon is
 * rendered edge to edge against whatever wallpaper the phone has, so it needs
 * to supply its own ground; the leaf on transparent would sit on an arbitrary
 * photo. The seeds are filled with the tile's own green rather than the brand's
 * dark green, so they read as holes punched through the leaf — this is the
 * reversed lockup from the brand sheet, not an inversion invented here. The
 * browser-tab favicon is the opposite case and is `src/app/icon.svg`: a tab
 * strip is a flat surface in both themes, so there the mark goes on transparent.
 *
 * **PNG, and why the route exists at all.** `next/og`'s `ImageResponse` ships
 * with Next.js, so this needs no image dependency, and a manifest wants raster
 * sizes. Route handlers are not wrapped by any parent `layout.tsx`, so this
 * sits outside the portal's `requirePortalClient` auth guard on purpose — a
 * manifest icon has to be fetchable by the browser/OS without a session.
 *
 * **Nothing here is fetched at render time.** The mark is inlined as a base64
 * data URI, so there is no font to resolve and no network call. That matters
 * more than it sounds: `ImageResponse` renders an *emoji* by fetching a Twemoji
 * SVG from a public CDN at request time, which is invisible on a dev machine
 * with open internet and silently fails from a host with locked-down egress —
 * a broken or slow icon fetch fails Chrome's own installability check, and
 * that is why `beforeinstallprompt` would never fire.
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
  '192': { px: 192 },
  '512': { px: 512 },
  'maskable-512': { px: 512 },
  'apple-180': { px: 180 },
} as const;

type SizeKey = keyof typeof SIZES;

function isSizeKey(value: string): value is SizeKey {
  return value in SIZES;
}

/**
 * How much of the tile the leaf takes.
 *
 * The maskable variant is rendered by the OS inside a shape that can crop up to
 * the outer ~20% of the canvas (Android's "safe zone"), so its mark is drawn
 * smaller to stay clear of that crop. The tile's green fills the canvas either
 * way, so the crop only ever eats ground, never the mark.
 */
function markScale(size: SizeKey): number {
  return size === 'maskable-512' ? 0.5 : 0.66;
}

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: rawSize } = await params;

  if (!isSizeKey(rawSize)) {
    return NextResponse.json({ error: 'Unknown icon size' }, { status: 404 });
  }

  const { px } = SIZES[rawSize];

  const tile = svgDataUri(
    renderBrandMarkSvg({
      size: px,
      // Reversed: white leaf, seeds punched back to the ground colour.
      leaf: BRAND_ON_COLOR,
      seed: BRAND_LEAF,
      background: BRAND_LEAF,
      scale: markScale(rawSize),
    }),
  );

  const response = new ImageResponse(
    (
      <div style={{ width: px, height: px, display: 'flex' }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- `next/image` has
            no meaning inside an `ImageResponse`; satori rasterises this element
            itself and never emits HTML. */}
        <img src={tile} width={px} height={px} alt="" />
      </div>
    ),
    { width: px, height: px },
  );

  response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');

  return response;
}
