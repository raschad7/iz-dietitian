import type { ComponentProps } from 'react';

import { APP_ICONS, type IconName } from '@/lib/icons';
import { cn } from '@/lib/utils';

/**
 * The app's only icon component.
 *
 * One set — lucide, rounded open strokes at a single weight — reached through a
 * registry of app names rather than glyph names, so a screen asks for
 * `addClient` and the picture that means it can change in one place. See
 * `src/lib/icons.ts`.
 *
 * `name` is a union of the registry's keys, so a misspelling is a build error
 * instead of a blank square.
 *
 * The set used to be Solar, inlined as SVG markup by a generator. lucide ships
 * its glyphs as components, so there is no registry to regenerate, no
 * `dangerouslySetInnerHTML`, and no scale transform correcting one set's
 * padding against another's — a lucide glyph is drawn to fill its 24-unit
 * canvas already.
 */

/**
 * Icons that encode a direction and must mirror in Arabic. Everything else —
 * clock, chart, checkmark, the status glyphs — points at no side and must NOT
 * be flipped, which is why this is an allowlist rather than a blanket
 * `rtl:-scale-x-100` on the component.
 *
 * `signOut` is here because the glyph is an arrow leaving a door; in RTL
 * "leaving" runs the other way. `back` is the portal's own exit arrow, and
 * "back" points right in Arabic.
 *
 * Being on this list is what makes the mirroring automatic, so a call site must
 * **not** add its own `rtl:-scale-x-100` — the two cancel out and the glyph
 * ends up pointing the wrong way in Arabic.
 */
const DIRECTIONAL = new Set<IconName>(['chevronStart', 'chevronEnd', 'signOut', 'back']);

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
  const Glyph = APP_ICONS[name];

  return (
    <Glyph
      // `currentColor` throughout: an icon never carries its own colour, it
      // inherits from the control it sits in. That is what keeps a single
      // registry usable on a dark rail and a light card alike. lucide strokes
      // in `currentColor` by default; the fill is stated so a glyph that closes
      // a shape cannot pick up a black default from the page.
      fill="none"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
      className={cn('size-4 shrink-0', DIRECTIONAL.has(name) && 'rtl:-scale-x-100', className)}
      {...props}
    />
  );
}

export type { IconName };
