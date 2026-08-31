import type { ReactNode } from 'react';

/**
 * The box the working canvas is drawn in — the shell around it persists.
 *
 * It carried `.q-route-stage` and its 190ms entrance until that was removed;
 * see the note in `globals.css` for why, and for the layout bug the animation's
 * `transform` was causing. What is left is three layout utilities, which is all
 * the shell ever needed from it: a definite height for pages that claim one,
 * and two `min-*: 0` so a flex child can shrink below its content.
 */
export default function AppTemplate({ children }: { children: ReactNode }) {
  return <div className="h-full min-h-0 min-w-0">{children}</div>;
}
