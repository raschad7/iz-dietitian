import type { ComponentProps } from 'react';

import { QIWAM_ICONS, type IconName } from '@/lib/icons.generated';
import { cn } from '@/lib/utils';

/**
 * The app's only icon component.
 *
 * One set (Solar Linear — rounded, open strokes, single weight) rendered from a
 * generated registry, so every icon on every screen reads as the same family
 * and none of them cost a network request. Add new icons in
 * `scripts/generate-icons.ts`, not here.
 *
 * `name` is a union of the generated keys, so a misspelling is a build error
 * instead of a blank square.
 */

/**
 * How much larger than its box the artwork is drawn.
 *
 * **The box does not change; the glyph inside it does.** Solar's 24-unit canvas
 * leaves roughly two units of padding on every side, which a filled glyph fills
 * out visually and an open stroke does not — swapping the set for Linear made
 * every icon in the app read a size smaller than it had the day before, at
 * identical dimensions. Growing the artwork inside the existing box fixes that
 * in one place, for all ~150 call sites at once, without moving a single pixel
 * of layout: no button reflows, no row height changes, no `size-*` class needs
 * revisiting.
 *
 * 1.12 spends most of Solar's own padding and stops short of the edge, so
 * glyphs that already run wide — the arrows, `hamburger-menu`, `widget-4` —
 * stay inside their canvas rather than clipping against it.
 *
 * The transform scales stroke widths along with the paths, which is what keeps
 * the set at one optical weight; scaling geometry alone would leave larger
 * icons drawn in relatively finer lines.
 */
const GLYPH_SCALE = 1.12;

/**
 * `scale` about the canvas centre, expressed as the translate/scale pair SVG
 * wants. Precomputed per viewBox rather than per render — there are five
 * distinct viewBoxes in the registry and a few hundred icons on a busy screen.
 */
const transformCache = new Map<string, string>();

function centeredScale(viewBox: string): string {
  const cached = transformCache.get(viewBox);
  if (cached) return cached;

  const [minX = 0, minY = 0, width = 24, height = 24] = viewBox.split(/\s+/).map(Number);
  const centerX = minX + width / 2;
  const centerY = minY + height / 2;
  const offset = 1 - GLYPH_SCALE;

  const transform = `translate(${(centerX * offset).toFixed(3)} ${(centerY * offset).toFixed(3)}) scale(${GLYPH_SCALE})`;
  transformCache.set(viewBox, transform);
  return transform;
}

/**
 * Icons that encode a direction and must mirror in Arabic. Everything else —
 * clock, chart, checkmark, logo, the status glyphs — points at no side and
 * must NOT be flipped, which is why this is an allowlist rather than a
 * blanket `rtl:-scale-x-100` on the component.
 *
 * `signOut` is here because the Solar glyph is an arrow leaving a door; in RTL
 * "leaving" runs the other way.
 */
const DIRECTIONAL = new Set<IconName>(['chevronStart', 'chevronEnd', 'signOut']);

type IconProps = Omit<ComponentProps<'svg'>, 'children' | 'dangerouslySetInnerHTML'> & {
  name: IconName;
  /**
   * Icons are decorative by default — the label next to them carries the
   * meaning, and announcing both makes a screen reader say everything twice.
   * Pass a label only when the icon is the control's *only* content.
   */
  label?: string;
};

export function Icon({ name, label, className, ...props }: IconProps) {
  const icon = QIWAM_ICONS[name];

  return (
    <svg
      viewBox={icon.viewBox}
      // `currentColor` throughout: an icon never carries its own colour, it
      // inherits from the control it sits in. That is what keeps a single
      // registry usable on a dark rail and a light card alike.
      fill="currentColor"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
      className={cn('size-4 shrink-0', DIRECTIONAL.has(name) && 'rtl:-scale-x-100', className)}
      /*
       * The body is SVG markup copied at build time from a pinned devDependency
       * — never user input, never a runtime fetch. There is no other way to
       * inline a sprite-free icon without shipping a parser.
       *
       * Wrapped in a `<g>` that scales it about the canvas centre; see
       * `GLYPH_SCALE`. The wrapper goes here rather than around the `<svg>`
       * because a CSS transform on the element would scale the box too, which
       * is exactly what this is avoiding.
       */
      dangerouslySetInnerHTML={{
        __html: `<g transform="${centeredScale(icon.viewBox)}">${icon.body}</g>`,
      }}
      {...props}
    />
  );
}

export type { IconName };
