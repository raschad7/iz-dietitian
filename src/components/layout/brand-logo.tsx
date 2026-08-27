import {
  LOCKUP_LEAF_PATH,
  LOCKUP_SEED_CX,
  LOCKUP_VIEWBOX,
  LOCKUP_WORDMARK_PATH,
  MARK_LEAF_PATH,
  MARK_SEED_CX,
  MARK_VIEWBOX,
  SEED_CY,
  SEED_ROTATION,
  SEED_RX,
  SEED_RY,
} from '@/features/brand/logo';
import { cn } from '@/lib/utils';

/**
 * The product's logo — the leaf mark and the wordmark beside it.
 *
 * ## Inline, not an `<img>`
 *
 * The rail is server-rendered chrome on every staff page, and a logo fetched as
 * a file is a network round trip before the first thing a reader looks at has a
 * shape. Inlined it costs one path in the HTML that is already being sent, and —
 * the reason that matters here — its fills can read CSS variables, which a file
 * behind `<img src>` cannot. See `--brand-wordmark`.
 *
 * The geometry itself comes from `@/features/brand/logo`, which is also what
 * the icon route, the Open Graph card and `public/brand/*.svg` draw from. Those
 * three cannot use this component — they render outside React, or outside any
 * stylesheet — so the shapes live in a module both sides can import rather than
 * being copied into each.
 *
 * ## Which parts are allowed to change colour
 *
 * - The **leaf** keeps `--brand-leaf` on every ground. It is the mark.
 * - The **two seeds** keep `--brand-seed`. They sit *on the leaf*, so the surface
 *   behind the logo never reaches them and they must not track it.
 * - The **wordmark** takes `--brand-wordmark`, because it is the one part
 *   printed directly onto the rail — brand green in light, the rail's own label
 *   colour on the dark rail, where the brand green would be a dark green word on a
 *   dark green field.
 *
 * ## Accessibility
 *
 * `aria-hidden` by default and no `<title>`: at every call site so far the logo
 * sits beside text naming the same thing, and a mark that announces the product
 * next to a heading that already does says it twice. A caller that uses it as
 * the only identification should pass `aria-hidden={false}` and a `role="img"`
 * with its own label.
 *
 * The `clipPath` from the exported file is dropped on purpose — it was a rect
 * the full size of the viewBox, so it clipped nothing, and an `id` in a
 * component that might render twice on a page is a collision waiting to happen.
 */
export function BrandLogo({ className, ...props }: React.ComponentProps<'svg'>) {
  return (
    <svg
      viewBox={LOCKUP_VIEWBOX}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      // `w-auto` with the height set by the caller: the mark is 2.6:1 and the
      // rail head is a fixed-height row, so height is the dimension that has to
      // be controlled and width has to follow it.
      className={cn('w-auto', className)}
      {...props}
    >
      <path d={LOCKUP_LEAF_PATH} fill="var(--brand-leaf)" />
      <Seeds centres={LOCKUP_SEED_CX} />
      <path d={LOCKUP_WORDMARK_PATH} fill="var(--brand-wordmark)" />
    </svg>
  );
}

/**
 * The leaf alone, with no wordmark beside it.
 *
 * For the places that are *already* saying the product's name in words — the
 * auth screens, whose `h1` names the form and the clinic in the same breath.
 * The full lockup there put "Enzyme" in the corner, again in the heading, and a
 * third time in the tagline underneath, all within the top third of the page.
 * The mark keeps the brand present without spending the reader's attention on
 * the same word three times.
 *
 * Square, so a caller controls it with a single dimension — unlike `BrandLogo`,
 * where 2.6:1 forces height to be the controlled axis. The seeds take
 * `--brand-seed` here exactly as they do in the lockup: they sit *on* the leaf,
 * so the surface behind the mark never reaches them.
 */
export function BrandMark({ className, ...props }: React.ComponentProps<'svg'>) {
  return (
    <svg
      viewBox={MARK_VIEWBOX}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={className}
      {...props}
    >
      <path d={MARK_LEAF_PATH} fill="var(--brand-leaf)" />
      <Seeds centres={MARK_SEED_CX} />
    </svg>
  );
}

/**
 * The two seeds. Identical ellipses at two horizontal positions, so the pair is
 * written once and the only thing either lockup supplies is where they sit.
 *
 * ## The group around them
 *
 * A `<g>` with no attributes but its slot name draws exactly what the two bare
 * ellipses drew, so every existing caller is unaffected. It exists because the
 * pair reads as a pair of eyes and one screen moves them as one: the plan
 * generation wait screen slides them inside the leaf to follow the pointer (see
 * `.q-plan-mark` in `globals.css`). Transforming a group keeps that a single
 * write against the shape the designer drew, rather than two ellipses a caller
 * has to keep in step — and keeps the geometry itself here, where it is stated
 * once for the whole app.
 */
function Seeds({ centres }: { centres: readonly number[] }) {
  return (
    <g data-slot="brand-seeds">
      {centres.map((cx) => (
        <ellipse
          key={cx}
          cx={cx}
          cy={SEED_CY}
          rx={SEED_RX}
          ry={SEED_RY}
          transform={`rotate(${SEED_ROTATION} ${cx} ${SEED_CY})`}
          fill="var(--brand-seed)"
        />
      ))}
    </g>
  );
}
