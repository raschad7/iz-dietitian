/**
 * Writes the brand's static SVG files from the single source of truth in
 * `src/features/brand/logo.ts`.
 *
 * Run it with `bun run brand:build` after changing any path data or brand
 * colour there. The output is committed, not generated at build time, because
 * two of the consumers cannot run a build step: `src/app/icon.svg` is a Next
 * *file convention* — Next reads the file off disk to emit the favicon link —
 * and `public/brand/*.svg` are linked to by outgoing email and by printed
 * plans, which need a URL that resolves without the app having rendered
 * anything.
 *
 * Every file here is a *static* drawing: no CSS custom properties, because none
 * of these grounds has a stylesheet. The in-app logo is the other half of the
 * pair and lives in `src/components/layout/brand-logo.tsx`, where the fills do
 * read tokens.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { ImageResponse } from 'next/og';

import {
  BRAND_LEAF,
  BRAND_ON_COLOR,
  renderBrandLockupSvg,
  renderBrandMarkSvg,
  svgDataUri,
} from '../src/features/brand/logo';

const ROOT = path.join(import.meta.dir, '..');

const FILES: { to: string; svg: string; note: string }[] = [
  {
    to: 'public/brand/mark.svg',
    /*
     * The leaf alone on a transparent ground — and, via `icons.icon` in
     * `src/app/[locale]/layout.tsx`, the browser-tab favicon.
     *
     * Transparent rather than a green tile: a tab strip is light in one theme
     * and near-black in the other, and the mark is a solid shape in a green
     * that holds against both. A tile would instead put a hard green square
     * beside every other site's round mark. The home-screen icon is the
     * opposite case and *is* a tile — see the icon route.
     *
     * **`public/`, not Next's `icon` file convention.** That convention only
     * emits its `<link>` from the segment it sits in, and this app's root
     * layout is `[locale]/layout.tsx` — a file at `src/app/icon.svg` served
     * fine at `/icon.svg` but produced no link tag on any actual page. A
     * static file named in `metadata.icons` works from one place for both
     * locales. The `.svg` also keeps it clear of `src/proxy.ts`, which excludes
     * paths containing a dot from next-intl's locale redirect — the same trap
     * that put the PWA icons under `/api/`.
     */
    svg: renderBrandMarkSvg({ size: 512 }),
    note: 'leaf alone, brand colours — also the browser-tab favicon',
  },
  {
    to: 'public/brand/mark-on-color.svg',
    // The reversed mark: white leaf, seeds punched back to the green ground so
    // they read as holes rather than as two dark shapes floating on white.
    svg: renderBrandMarkSvg({ size: 512, leaf: BRAND_ON_COLOR, seed: BRAND_LEAF, background: BRAND_LEAF }),
    note: 'leaf reversed out of a green tile',
  },
  {
    to: 'public/brand/logo.svg',
    svg: renderBrandLockupSvg({ height: 743 }),
    note: 'full lockup, brand colours',
  },
  {
    to: 'public/brand/logo-on-color.svg',
    svg: renderBrandLockupSvg({
      height: 743,
      leaf: BRAND_ON_COLOR,
      seed: BRAND_LEAF,
      wordmark: BRAND_ON_COLOR,
    }),
    note: 'full lockup reversed, for a green or dark ground',
  },
];

for (const file of FILES) {
  const target = path.join(ROOT, file.to);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${file.svg}\n`, 'utf8');
  console.log(`wrote ${file.to} — ${file.note}`);
}

/*
 * ── public/favicon.ico ──
 *
 * The SVG favicon covers every current browser, and this covers what it does
 * not: older browsers with no SVG-favicon support, and — the reason it is worth
 * having in 2026 — the long tail of link-preview and crawler bots that request
 * `/favicon.ico` by path and never read a `<link rel="icon">` at all. WhatsApp
 * is in that tail, and WhatsApp is where this product's links travel.
 *
 * `public/` rather than Next's `src/app/favicon.ico` convention, for the same
 * reason `mark.svg` is: a file convention only emits its tag from the segment
 * it sits in, and this app's root layout is `[locale]/layout.tsx`. Nothing has
 * to emit a tag for this one anyway — the browsers and bots that want it ask
 * for `/favicon.ico` directly, which `public/` answers.
 */
const ICO_SIZES = [16, 32, 48];

const pngs = await Promise.all(
  ICO_SIZES.map(async (px) => {
    /*
     * Rasterised through `next/og`, the same renderer the PWA tiles use — so
     * the .ico and the home-screen icon cannot drift apart, and this script
     * still needs no image dependency of its own. It runs fully offline: the
     * mark goes in as a data URI, so there is no font to resolve and no network
     * call. (`next/og` resolves only from inside the project, which is why this
     * script has to live in the repo rather than anywhere else.)
     */
    const response = new ImageResponse(
      (
        <div style={{ width: px, height: px, display: 'flex' }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- satori
              rasterises this itself and never emits HTML. */}
          <img src={svgDataUri(renderBrandMarkSvg({ size: px }))} width={px} height={px} alt="" />
        </div>
      ),
      { width: px, height: px },
    );

    return { px, data: Buffer.from(await response.arrayBuffer()) };
  }),
);

/**
 * Packs PNGs into an `.ico` container.
 *
 * PNG-in-ICO rather than the format's original BMP: it is a fraction of the
 * size, it keeps the transparent ground without ICO's separate 1-bit mask, and
 * every browser that still asks for a `.ico` has supported it since IE11.
 *
 * The layout is a 6-byte header, then one 16-byte directory entry per image,
 * then the image data — so every entry's offset depends on how many entries
 * there are, which is why the offset is accumulated rather than fixed.
 */
function packIco(images: { px: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon, 2 = cursor
  header.writeUInt16LE(images.length, 4);

  let offset = header.length + images.length * 16;

  const entries = images.map(({ px, data }) => {
    const entry = Buffer.alloc(16);
    // 0 means 256 in this field — it is one byte, so 256 does not fit. None of
    // the sizes here reach it, but the encoding is why the field is a byte.
    entry.writeUInt8(px >= 256 ? 0 : px, 0);
    entry.writeUInt8(px >= 256 ? 0 : px, 1);
    entry.writeUInt8(0, 2); // palette size — 0 for truecolour
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images.map((image) => image.data)]);
}

const icoPath = path.join(ROOT, 'public/favicon.ico');
await writeFile(icoPath, packIco(pngs));
console.log(`wrote public/favicon.ico — ${ICO_SIZES.join('/')}px, for older browsers and link bots`);
