import { ImageResponse } from 'next/og';
import { NextResponse } from 'next/server';

import { APP_BACKGROUND_COLOR } from '@/features/app-pwa/brand';
import {
  BRAND_LEAF,
  BRAND_ON_COLOR,
  BRAND_SEED,
  renderBrandMarkSvg,
  svgDataUri,
} from '@/features/brand/logo';

/**
 * The PNG app icons: the client portal's manifest icons and the apple-touch
 * icon, plus the staff app's own home-screen set.
 *
 * These draw the real brand mark — the leaf — from the shared geometry in
 * `@/features/brand/logo`. They used to draw lucide's `salad` and
 * `clipboard-list` glyphs as placeholders, from before the repo had a brand
 * asset at all.
 *
 * **Two apps, two tiles.** Two installable apps on one origin must not share an
 * icon: a dietitian who installs both ends up with two tiles on the same home
 * screen, and if they carry the same artwork the only way to tell the clinic's
 * workspace from a client's portal is to open one. Same geometry, same
 * generator, inverted ground — see `TILES` below.
 *
 * **The portal is reversed on a green tile, not the mark on white.** A
 * home-screen icon is rendered edge to edge against whatever wallpaper the
 * phone has, so it needs to supply its own ground; the leaf on transparent
 * would sit on an arbitrary photo. The seeds are filled with the tile's own
 * green rather than the brand's dark green, so they read as holes punched
 * through the leaf — this is the reversed lockup from the brand sheet, not an
 * inversion invented here. The staff app takes the other half of that sheet:
 * the mark in its own colours on the app's white ground, which is the same
 * `background_color` its manifest paints the splash screen with. That reads as
 * one family at a glance and still tells the two tiles apart at 48px behind a
 * rounded mask — which a colour-only difference would not.
 *
 * The browser-tab favicon is a third case again and is `src/app/icon.svg`: a
 * tab strip is a flat surface in both themes, so there the mark goes on
 * transparent.
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
  /* The staff app's own set — same sizes, different tile. See `TILES`. */
  'staff-192': { px: 192 },
  'staff-512': { px: 512 },
  'staff-maskable-512': { px: 512 },
  'staff-apple-180': { px: 180 },
} as const;

type SizeKey = keyof typeof SIZES;

function isSizeKey(value: string): value is SizeKey {
  return value in SIZES;
}

/**
 * The two treatments of the one mark.
 *
 * `portal` is the reversed lockup: a white leaf on brand green, seeds punched
 * back to the ground. `staff` is the mark on the app's own white ground, in its
 * own colours. Neither invents a colour — both come from `@/features/brand/logo`
 * and, for the staff ground, the staff manifest's `background_color`.
 */
const TILES = {
  portal: { leaf: BRAND_ON_COLOR, seed: BRAND_LEAF, background: BRAND_LEAF },
  staff: { leaf: BRAND_LEAF, seed: BRAND_SEED, background: APP_BACKGROUND_COLOR },
} as const;

/**
 * How much of the tile the leaf takes.
 *
 * The maskable variant is rendered by the OS inside a shape that can crop up to
 * the outer ~20% of the canvas (Android's "safe zone"), so its mark is drawn
 * smaller to stay clear of that crop. Matched on the suffix so both apps'
 * maskable keys are covered. The tile's ground fills the canvas either way, so
 * the crop only ever eats ground, never the mark.
 */
function markScale(size: SizeKey): number {
  return size.endsWith('maskable-512') ? 0.5 : 0.66;
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
      ...(rawSize.startsWith('staff-') ? TILES.staff : TILES.portal),
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
