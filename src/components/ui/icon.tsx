import type { ComponentProps } from 'react';

import { QIWAM_ICONS, type IconName } from '@/lib/icons.generated';
import { cn } from '@/lib/utils';

/**
 * The app's only icon component.
 *
 * One set (Solar Bold — rounded, filled, single weight) rendered from a
 * generated registry, so every icon on every screen reads as the same family
 * and none of them cost a network request. Add new icons in
 * `scripts/generate-icons.ts`, not here.
 *
 * `name` is a union of the generated keys, so a misspelling is a build error
 * instead of a blank square.
 */

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
       */
      dangerouslySetInnerHTML={{ __html: icon.body }}
      {...props}
    />
  );
}

export type { IconName };
