import { cn } from '@/lib/utils';

/**
 * The chevron for stepping through a sequence: back a month, forward a week.
 *
 * **Why this is not `Icon name="chevronStart"`.** The icon set's chevron is the
 * one drawn for *disclosure* — the mark on a link, an accordion, a row that
 * opens something — and it is drawn at that weight. A control whose entire
 * content is the arrow needs a heavier, rounder caret with a longer stroke, or
 * a 28px button reads as an empty box with a tick in it. This is the caret the
 * clinic's own date controls use.
 *
 * **Logical, not physical.** `start` points back along the reading direction
 * and `end` points forward, and `rtl:rotate-180` on the path is what mirrors
 * them in Arabic — so in an RTL page the *right* arrow is "previous" and the
 * *left* one is "next", which is what a reader of Arabic expects and the exact
 * opposite of what a hardcoded left/right pair would do. Callers name the
 * direction they mean and never the side of the screen.
 *
 * `aria-hidden` and no title: every button that carries one of these has its
 * own accessible name, and a second one here would announce the control twice.
 */
export function Caret({
  direction,
  className,
}: {
  /**
   * `start` is back along the reading direction, `end` is forward, and `down`
   * is the disclosure mark on a control that opens something under itself.
   */
  direction: 'start' | 'end' | 'down';
  className?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      fill="currentColor"
      viewBox="0 0 256 256"
      aria-hidden
      focusable="false"
      className={cn(
        'shrink-0 size-4',
        // `down` points at the panel it opens in both languages; only the
        // horizontal pair mirrors.
        direction !== 'down' && 'rtl:rotate-180',
        className,
      )}
    >
      {direction === 'start' ? (
        <path d="M165.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L91.31,128Z" />
      ) : direction === 'end' ? (
        <path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z" />
      ) : (
        <path d="M216.49,104.49l-80,80a12,12,0,0,1-17,0l-80-80a12,12,0,0,1,17-17L128,159l71.51-71.52a12,12,0,0,1,17,17Z" />
      )}
    </svg>
  );
}
