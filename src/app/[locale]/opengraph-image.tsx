import { ImageResponse } from 'next/og';

import { BRAND_LEAF, BRAND_ON_COLOR, renderBrandLockupSvg, svgDataUri } from '@/features/brand/logo';

/**
 * The social card — what a link to the app looks like when it is pasted into
 * WhatsApp, which is where this product's links actually travel.
 *
 * Sits beside the root layout — which in this app is `[locale]/layout.tsx`, not
 * `src/app/layout.tsx`. Next's file-convention metadata cascades into nested
 * segments but is only emitted from the segment it sits in, so one card here
 * covers the marketing page, the sign-in screens and any shared portal link
 * without each declaring its own; a copy at `src/app/` served a valid image at
 * a URL no page ever pointed at.

 * One card for both locales. It carries no text, so there is nothing on it that
 * would differ between them (see below).
 *
 * **No text on it, deliberately.** `next/og` sets type by shipping a font file
 * to satori, and an Arabic string needs an Arabic face — the app's are fetched
 * and self-hosted by `next/font/google` at build time, which puts them
 * somewhere a route handler cannot reliably read at request time. Drawing the
 * lockup alone sidesteps that: the wordmark is already outlines, so it renders
 * identically with no font loaded at all, and the card says the brand in the
 * brand's own letterforms rather than in a substitute face. If a headline is
 * ever wanted here, it needs a font file committed to the repo first.
 *
 * The card is the reversed lockup on the brand green — the same treatment as
 * the app icons, so a WhatsApp preview and the home-screen icon beside it are
 * recognisably one thing.
 */

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Enzyme';

export default function OpenGraphImage() {
  // 260px tall inside a 630px card: the lockup is 2.6:1, so this is ~676px
  // wide — a little over half the card's width, which keeps the mark large
  // enough to read in WhatsApp's small preview thumbnail without the wordmark
  // running to the edges.
  const lockupHeight = 260;
  const lockupWidth = Math.round((1930 / 743) * lockupHeight);

  const lockup = svgDataUri(
    renderBrandLockupSvg({
      height: lockupHeight,
      leaf: BRAND_ON_COLOR,
      seed: BRAND_LEAF,
      wordmark: BRAND_ON_COLOR,
    }),
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: size.width,
          height: size.height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: BRAND_LEAF,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- `next/image` has
            no meaning inside an `ImageResponse`; satori rasterises this element
            itself and never emits HTML. */}
        <img src={lockup} width={lockupWidth} height={lockupHeight} alt="" />
      </div>
    ),
    size,
  );
}
