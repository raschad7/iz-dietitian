import { ImageResponse } from 'next/og';
import { NextResponse } from 'next/server';

import { APP_BACKGROUND_COLOR, APP_ICON_COLOR } from '@/features/app-pwa/brand';
import { PORTAL_BACKGROUND_COLOR, PORTAL_THEME_COLOR } from '@/features/portal/pwa/brand';

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
 * **The mark is a hand-drawn `<svg>` (lucide's `salad`), never an emoji
 * character.** `ImageResponse` renders emoji by fetching a Twemoji SVG from a
 * public CDN (`cdnjs.cloudflare.com`) at request time — an outbound call this
 * route has no control over. That is invisible on a dev machine with open
 * internet, and exactly the kind of dependency that silently fails or times
 * out from a production host with locked-down egress: the icon fetch then
 * comes back broken (or just slow enough to fail Chrome's own timeout), which
 * fails the manifest's own installability check and is why
 * `beforeinstallprompt` never fires — the settings row's "unavailable" state
 * is doing its job, but the underlying cause is this route, not the row. A
 * vector path has no font to resolve and nothing to fetch, so the icon is
 * identical everywhere this route runs.
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
  /*
    The staff app's own set. Two installable apps on one origin must not share
    an icon: a dietitian who installs both ends up with two tiles on the same
    home screen, and if they carry the same artwork the only way to tell the
    clinic's workspace from a client's portal is to open one. Same sizes, same
    generator, different mark and inverted colours — see `MARKS` below.
  */
  'staff-192': { px: 192, radius: 0 },
  'staff-512': { px: 512, radius: 0 },
  'staff-maskable-512': { px: 512, radius: 0 },
  'staff-apple-180': { px: 180, radius: 0 },
} as const;

type SizeKey = keyof typeof SIZES;

function isSizeKey(value: string): value is SizeKey {
  return value in SIZES;
}

/**
 * The two marks, as inlined lucide path data.
 *
 * `salad` is the portal's — the client's own food. `clipboard-list` is the
 * staff app's — the practitioner's working document. Both are hand-drawn
 * `<svg>` and never emoji characters, for the reason spelled out at length
 * above: an emoji sends `ImageResponse` to a public CDN at request time.
 *
 * ⚠ **Each entry renders the whole `<svg>`, not a fragment of paths.** Satori
 * (the renderer behind `ImageResponse`) walks a React tree of elements it
 * recognises; a `<>…</>` handed to it as an `<svg>`'s child is not one, and it
 * fails the render rather than skipping it — the route then dies with
 * "failed to pipe response" and every icon 500s, taking installability with
 * it. Keep these returning a complete element.
 */
const MARKS = {
  salad: (size: number, stroke: string) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 21h10" />
      <path d="M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9Z" />
      <path d="M11.38 12a2.4 2.4 0 0 1-.4-4.77 2.4 2.4 0 0 1 3.2-2.77 2.4 2.4 0 0 1 3.47-.63 2.4 2.4 0 0 1 3.37 3.37 2.4 2.4 0 0 1-1.1 3.7 2.51 2.51 0 0 1 .03 1.1" />
      <path d="m13 12 4-4" />
      <path d="M10.9 7.25A3.99 3.99 0 0 0 4 10c0 .73.2 1.41.54 2" />
    </svg>
  ),
  clipboard: (size: number, stroke: string) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M12 11h4" />
      <path d="M12 16h4" />
      <path d="M8 11h.01" />
      <path d="M8 16h.01" />
    </svg>
  ),
} as const;

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: rawSize } = await params;

  if (!isSizeKey(rawSize)) {
    return NextResponse.json({ error: 'Unknown icon size' }, { status: 404 });
  }

  const { px } = SIZES[rawSize];

  const staff = rawSize.startsWith('staff-');

  // The maskable variant is rendered by the OS inside a shape that can crop
  // up to the outer ~20% of the canvas (Android's "safe zone"), so its mark
  // is drawn smaller than the regular icons' to stay clear of that crop.
  const maskable = rawSize.endsWith('maskable-512');
  const markSize = maskable ? px * 0.5 : px * 0.62;

  /*
    The two apps are inverses of each other: the portal is a white mark on
    olive, the staff app an olive mark on white. That reads as one family at a
    glance and still tells the two tiles apart on a home screen holding both —
    which a colour-only difference would not, at 48px behind a rounded mask.
  */
  const background = staff ? APP_BACKGROUND_COLOR : PORTAL_THEME_COLOR;
  const stroke = staff ? APP_ICON_COLOR : PORTAL_BACKGROUND_COLOR;

  const response = new ImageResponse(
    (
      <div
        style={{
          width: px,
          height: px,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background,
        }}
      >
        {/* Inlined lucide path data — see `MARKS` and the note above on why
            this is a vector and not an emoji character. */}
        {staff ? MARKS.clipboard(markSize, stroke) : MARKS.salad(markSize, stroke)}
      </div>
    ),
    { width: px, height: px },
  );

  response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');

  return response;
}
