/**
 * The Enzyme logo, as data rather than as markup.
 *
 * The same three shapes — the leaf, its two seeds, and the Arabic wordmark —
 * have to be drawn in four places that cannot share a React component:
 *
 * - `BrandLogo` / `BrandMark` (`src/components/layout/brand-logo.tsx`), where
 *   the fills are CSS custom properties so the wordmark can flip on the dark
 *   rail;
 * - the PWA / apple-touch icon route, which renders through `next/og` and so
 *   needs literal colours and a serialisable string, not a component;
 * - the Open Graph card, same constraint;
 * - `public/brand/*.svg`, the files an email template or a printed plan links
 *   to, where there is no React and no stylesheet at all.
 *
 * Keeping the path data in one `.ts` module means a corrected curve is
 * corrected everywhere. The literal hexes are allowed here for the same reason
 * they are allowed in `src/features/portal/pwa/brand.ts`: `qiwam/no-raw-hex`
 * covers `.tsx`/`.jsx`, where a hex is a token that skipped the system — an
 * image generated for the OS has no stylesheet to read a token from, so the
 * literal has to live somewhere, and it lives here rather than at each call
 * site.
 *
 * The CSS side of the same values is `--brand-leaf` / `--brand-seed` /
 * `--brand-wordmark` in `src/app/globals.css`. **If one changes, change both.**
 */

/**
 * The mark's body. Fixed on every ground — it is the logo.
 *
 * Also `--primary`: the action colour was moved onto this exact green so the
 * logo and every button in the app are one colour. Change it here and change
 * `--primary` in `globals.css` in the same commit, or the two drift apart
 * again.
 */
export const BRAND_LEAF = '#75CF48';
/** The two shapes inside the leaf. They sit *on* the leaf, so they never track the surface. */
export const BRAND_SEED = '#266805';
/** The lettering, on a light ground. */
export const BRAND_WORDMARK = '#266805';
/** The reversed mark, for a green tile or a dark ground. */
export const BRAND_ON_COLOR = '#FFFFFF';

/** The character alone — a square canvas, so it crops to a circle cleanly. */
export const MARK_VIEWBOX = '0 0 743 743';
/** Leaf plus wordmark. 2.6:1, so height is the dimension a caller controls. */
export const LOCKUP_VIEWBOX = '0 0 1930 743';

/** The bitten circle, drawn at the origin of `MARK_VIEWBOX`. */
export const MARK_LEAF_PATH =
  'M371.5 0C421.797 0 469.759 9.99605 513.508 28.1089C520.466 30.9895 522.551 39.7041 518.553 46.0856C504.918 67.848 497.035 93.5815 497.035 121.156C497.035 199.356 560.429 262.749 638.629 262.749C662.921 262.749 685.784 256.63 705.762 245.851C712.393 242.273 720.958 244.92 723.379 252.054C736.1 289.54 743 329.714 743 371.5C743 576.674 576.674 743 371.5 743C166.326 743 0 576.674 0 371.5C0 166.326 166.326 0 371.5 0Z';

/**
 * The same leaf, shifted to the far end of `LOCKUP_VIEWBOX`.
 *
 * That end is the *reading start* — the wordmark is Arabic, so the lockup runs
 * right to left and the mark leads from the right. This is why the lockup is
 * never mirrored for the English locale: mirroring it would put the mark
 * before letterforms that still read the other way.
 */
export const LOCKUP_LEAF_PATH =
  'M1558.5 0C1608.8 0 1656.76 9.99605 1700.51 28.1089C1707.47 30.9895 1709.55 39.7041 1705.55 46.0856C1691.92 67.848 1684.04 93.5815 1684.04 121.156C1684.04 199.356 1747.43 262.749 1825.63 262.749C1849.92 262.749 1872.78 256.63 1892.76 245.851C1899.39 242.273 1907.96 244.92 1910.38 252.054C1923.1 289.54 1930 329.714 1930 371.5C1930 576.674 1763.67 743 1558.5 743C1353.33 743 1187 576.674 1187 371.5C1187 166.326 1353.33 0 1558.5 0Z';

/** The Arabic wordmark, set as outlines so no font has to resolve. */
export const LOCKUP_WORDMARK_PATH =
  'M76.2923 612.417C43.3757 611.583 14.209 597.417 14.209 568.667V526.167H15.8757C27.1257 529.5 40.0423 533.667 71.2923 531.167C116.709 527.833 153.376 504.5 153.376 442.833V392.417C153.376 340.333 179.209 277.833 261.709 277.833C345.042 277.833 370.876 340.333 370.876 392.417V424.917H406.709C412.959 424.917 425.459 441.167 425.459 466.167C425.459 490.75 412.959 507 406.709 507H270.459C246.292 507 227.959 497 217.542 481.167C199.626 593.667 117.959 612.833 76.2923 612.417ZM220.876 416.583C229.626 422 239.626 424.917 255.876 424.917H303.376V392.417C303.376 369.917 294.626 341.167 261.709 341.167C229.209 341.167 220.876 370.333 220.876 392.417V416.583ZM406.709 424.917C462.959 424.917 479.209 398.25 477.959 354.917C477.126 332.833 471.709 307.417 464.626 280.75V277.833C490.042 271.583 512.959 271.167 526.709 284.5C540.042 298.25 544.626 324.083 545.876 369.5C547.542 470.75 482.126 507 406.709 507V424.917ZM519.209 612C500.459 612 485.459 597.417 485.459 578.25C485.459 559.083 500.459 544.5 519.209 544.5C537.959 544.5 552.959 559.5 552.959 578.25C552.959 597.417 537.959 612 519.209 612ZM437.959 612C419.209 612 404.209 597.417 404.209 578.25C404.209 559.083 419.209 544.5 437.959 544.5C456.709 544.5 471.709 559.5 471.709 578.25C471.709 597.417 456.709 612 437.959 612ZM592.406 647.417C561.989 647.833 539.906 636.167 525.739 624.083V620.75C580.322 611.583 636.572 582.833 636.989 470.333V300.333H657.406C687.822 300.333 704.072 317 704.072 347V419.917C721.156 424.5 738.239 424.917 746.572 424.917H746.989C753.239 424.917 765.739 441.167 765.739 466.167C765.739 491.167 753.239 507 746.989 507H746.572C737.822 507 719.906 506.583 703.239 502.417C696.989 588.667 656.572 646.167 592.406 647.417ZM666.989 254.917C647.406 254.917 631.572 239.5 631.572 219.5C631.572 199.917 647.822 184.5 666.989 184.5C686.572 184.5 701.989 199.917 701.989 219.5C701.989 239.5 686.572 254.917 666.989 254.917ZM747.041 424.917C803.291 424.917 819.541 398.25 818.291 354.917C817.458 332.833 812.041 307.417 804.958 280.75V277.833C830.374 271.583 853.291 271.167 867.041 284.5C880.374 298.25 884.958 324.083 886.208 369.5C887.874 470.75 822.458 507 747.041 507V424.917ZM838.708 227.833C819.124 227.833 803.291 212.417 803.291 192.417C803.291 172.833 819.541 157.417 838.708 157.417C858.291 157.417 873.708 172.833 873.708 192.417C873.708 212.417 858.291 227.833 838.708 227.833ZM998.187 507C968.187 507 951.52 490.333 951.52 459.917L951.937 111.167H971.937C1002.35 111.167 1019.02 127.833 1019.02 157.833V507H998.187ZM924.02 625.333C924.02 612.833 930.687 604.917 942.354 603.25C937.77 596.583 935.687 589.5 936.104 580.75C936.52 547.417 964.02 531.167 989.854 531.167C1012.77 531.167 1031.52 538.667 1037.35 557.833C1040.69 569.917 1031.52 587.417 1009.02 583.667L1008.19 582.417C1008.19 572 1001.1 564.5 989.854 564.5C976.52 564.5 969.854 572 969.437 583.667C969.02 594.917 976.52 602.833 988.187 602.833H1046.94V607.833C1046.94 625.333 1036.52 634.917 1019.85 634.917H924.02V625.333Z';

/** The two seeds, per viewBox. Same ellipse, two horizontal positions. */
export const SEED_RX = 56.5461;
export const SEED_RY = 96.3418;
export const SEED_CY = 253.436;
/** Degrees. The pair is tilted, which is what stops the mark reading as a face at rest. */
export const SEED_ROTATION = 15.995;
export const MARK_SEED_CX = [148.052, 299.13] as const;
export const LOCKUP_SEED_CX = [1335.05, 1486.13] as const;

function seedEllipses(centres: readonly number[], fill: string): string {
  return centres
    .map(
      (cx) =>
        `<ellipse cx="${cx}" cy="${SEED_CY}" rx="${SEED_RX}" ry="${SEED_RY}" transform="rotate(${SEED_ROTATION} ${cx} ${SEED_CY})" fill="${fill}"/>`,
    )
    .join('');
}

type MarkSvgOptions = {
  /** Canvas edge in px. The mark is square. */
  size: number;
  /** The leaf's fill. */
  leaf?: string;
  /** The seeds' fill. On a coloured tile this matches `background`, so they read as holes. */
  seed?: string;
  /** A full-bleed ground behind the mark, or `undefined` for a transparent one. */
  background?: string;
  /**
   * How much of the canvas the mark occupies, 0–1. Below 1 the mark is centred
   * in the space that is left — which is how an Android maskable icon keeps
   * clear of a crop that can take the outer ~20% of the tile.
   */
  scale?: number;
};

/**
 * The mark as a standalone SVG document string.
 *
 * `next/og` (satori) rasterises a nested `<svg>` through its own serialiser,
 * and its handling of `transform` on child elements is the part of that
 * serialiser most likely to move between versions — the seeds are rotated, so
 * that is not a risk worth taking for an icon the OS caches for a year.
 * Handing it one `<img src="data:image/svg+xml;base64,…">` goes through the
 * ordinary image path instead and cannot regress on a satori upgrade.
 */
export function renderBrandMarkSvg({
  size,
  leaf = BRAND_LEAF,
  seed = BRAND_SEED,
  background,
  scale = 1,
}: MarkSvgOptions): string {
  const inset = (743 * (1 - scale)) / 2;
  const ground = background === undefined ? '' : `<rect width="743" height="743" fill="${background}"/>`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${MARK_VIEWBOX}" fill="none">`,
    ground,
    `<g transform="translate(${inset} ${inset}) scale(${scale})">`,
    `<path d="${MARK_LEAF_PATH}" fill="${leaf}"/>`,
    seedEllipses(MARK_SEED_CX, seed),
    '</g>',
    '</svg>',
  ].join('');
}

type LockupSvgOptions = {
  /** Height in px; width follows the 2.6:1 ratio. */
  height: number;
  leaf?: string;
  seed?: string;
  wordmark?: string;
};

/** The full lockup — leaf plus wordmark — as a standalone SVG document string. */
export function renderBrandLockupSvg({
  height,
  leaf = BRAND_LEAF,
  seed = BRAND_SEED,
  wordmark = BRAND_WORDMARK,
}: LockupSvgOptions): string {
  const width = Math.round((1930 / 743) * height);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${LOCKUP_VIEWBOX}" fill="none">`,
    `<path d="${LOCKUP_LEAF_PATH}" fill="${leaf}"/>`,
    seedEllipses(LOCKUP_SEED_CX, seed),
    `<path d="${LOCKUP_WORDMARK_PATH}" fill="${wordmark}"/>`,
    '</svg>',
  ].join('');
}

/** Either drawing, wrapped as a data URI an `<img src>` — or `next/og` — can take. */
export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}
