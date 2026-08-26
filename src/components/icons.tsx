import type { SVGProps } from 'react';

/**
 * Brand icons drawn for Enzyme rather than taken from lucide.
 *
 * They exist here because the design supplies them as artwork: the menu's bars
 * are deliberately unequal and offset — a stroked icon set cannot express that.
 * Everything else in the app should still come from lucide; this file is not a
 * general icon dumping ground.
 *
 * Takes `fill="currentColor"`, so colour comes from the surrounding text
 * token. The source SVG hardcoded `#383838`, which would have been both a
 * lint error and a colour that ignores the theme.
 */

/** The staggered three-bar menu glyph. */
export function MenuIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M0 2C0 0.89375 0.89375 0 2 0H26C27.1063 0 28 0.89375 28 2C28 3.10625 27.1063 4 26 4H2C0.89375 4 0 3.10625 0 2ZM4 12C4 10.8937 4.89375 10 6 10H30C31.1063 10 32 10.8937 32 12C32 13.1063 31.1063 14 30 14H6C4.89375 14 4 13.1063 4 12ZM28 22C28 23.1063 27.1063 24 26 24H2C0.89375 24 0 23.1063 0 22C0 20.8937 0.89375 20 2 20H26C27.1063 20 28 20.8937 28 22Z" />
    </svg>
  );
}
