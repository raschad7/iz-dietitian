import type { SVGProps } from 'react';

/**
 * Brand icons drawn for Qiwam rather than taken from lucide.
 *
 * They exist here because the design supplies them as artwork: the menu's bars
 * are deliberately unequal and offset, and the calendar is a solid glyph — two
 * things a stroked icon set cannot express. Everything else in the app should
 * still come from lucide; this file is not a general icon dumping ground.
 *
 * Both take `fill="currentColor"`, so colour comes from the surrounding text
 * token. The source SVGs hardcoded `#383838`, which would have been both a
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

/**
 * The solid calendar glyph.
 *
 * Not mirrored in RTL: a calendar carries no direction, and §"RTL requirements"
 * lists it alongside the clock and the checkmark as an icon that stays put.
 */
export function CalendarGlyphIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M0 17C0 18.7 1.3 20 3 20H17C18.7 20 20 18.7 20 17V9H0V17ZM17 2H15V1C15 0.4 14.6 0 14 0C13.4 0 13 0.4 13 1V2H7V1C7 0.4 6.6 0 6 0C5.4 0 5 0.4 5 1V2H3C1.3 2 0 3.3 0 5V7H20V5C20 3.3 18.7 2 17 2Z" />
    </svg>
  );
}
