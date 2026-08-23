'use client';

import { useSyncExternalStore, type ComponentProps } from 'react';

import { Callout } from '@/components/ui/callout';
import { cn } from '@/lib/utils';

/**
 * A `Callout` the reader can close, and that stays closed.
 *
 * ## What `noticeId` has to encode
 *
 * ⚠ **The id is the thing being dismissed, not the place it appears.** A
 * warning that says "the manual target is 1,500 kcal against a computed 2,868"
 * is a different warning from one that says 1,200 against 2,868, and dismissing
 * the first must not silence the second — so the id carries the figures, not
 * just the client. Change what the callout *says* and it comes back.
 *
 * Get this wrong and the feature is worse than no dismiss button at all: a
 * contradiction the dietitian has never seen, hidden by a click they made about
 * a different one months ago.
 *
 * ## `useSyncExternalStore`, not an effect
 *
 * `localStorage` is an external store, and this is the hook for reading one
 * during render. The alternative — render, then check storage in an effect and
 * `setState` — is a cascading render that the repo's `react-hooks` rule rejects
 * outright, and it would also flash a warning the reader has already closed.
 *
 * The server snapshot is **`true`, meaning dismissed**, so a server render emits
 * nothing at all. React then reads the client snapshot after hydration and the
 * callout arrives if it has not been closed. That direction matters: a notice
 * that appears a frame late is a notice arriving, while one that is painted and
 * then yanked away reads as a bug.
 *
 * Subscribing also picks up the `storage` event, so closing a warning in one tab
 * closes it in every other tab showing the same record.
 *
 * ## Storage
 *
 * One key holding a list of ids, capped, oldest dropped first. Per-notice keys
 * would be simpler to write and would accumulate one entry per client per
 * distinct warning with nothing ever clearing them; a capped list is bounded by
 * construction. Every read and write is wrapped: `localStorage` throws outright
 * in a Safari private window and on a browser set to block site data, and a
 * warning callout is not worth taking the record down for.
 */

const STORAGE_KEY = 'qiwam.dismissed-notices';

/**
 * How many dismissals are remembered. Past this the oldest fall off and their
 * notices reappear — which is the safe direction for this to fail in: a warning
 * shown again is a nuisance, a warning silenced forever is a missed reading.
 */
const MAX_REMEMBERED = 200;

/**
 * Listeners registered by `useSyncExternalStore`. A dismissal in this tab
 * changes `localStorage`, and `localStorage` does **not** fire `storage` in the
 * tab that wrote it — so without this the callout would keep rendering until
 * something else re-rendered it.
 */
const listeners = new Set<() => void>();

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  // The cross-tab half. Same record open twice, closed once.
  window.addEventListener('storage', onStoreChange);

  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener('storage', onStoreChange);
  };
}

function readDismissed(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    // A foreign or corrupted value is the same as no value — never a throw.
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function remember(noticeId: string) {
  try {
    // Re-read rather than trusting a captured copy: another tab on another
    // client's record may have written since this mounted, and the last write
    // would otherwise drop what that one added.
    const next = [...readDismissed().filter((id) => id !== noticeId), noticeId];
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(next.slice(Math.max(0, next.length - MAX_REMEMBERED))),
    );
  } catch {
    // Storage unavailable. Notifying anyway still closes the callout for this
    // view; it will be back on the next load, which is the honest outcome
    // rather than a lie about having remembered.
  }

  for (const listener of listeners) listener();
}

export function DismissibleCallout({
  noticeId,
  dismissLabel,
  className,
  ...props
}: Omit<ComponentProps<typeof Callout>, 'onDismiss'> & {
  /** Identifies *this exact warning*, figures included. See the note above. */
  noticeId: string;
  dismissLabel: string;
}) {
  const dismissed = useSyncExternalStore(
    subscribe,
    () => readDismissed().includes(noticeId),
    // Server: render nothing. See "useSyncExternalStore, not an effect" above.
    () => true,
  );

  if (dismissed) return null;

  return (
    <Callout
      {...props}
      dismissLabel={dismissLabel}
      onDismiss={() => remember(noticeId)}
      /*
        Fades in on the frame after hydration rather than appearing outright, so
        the gap reads as the callout arriving instead of as the page flickering.
        `motion-safe`, because a notice that must be noticed is not something to
        animate for a reader who has asked for stillness — it simply appears.
      */
      className={cn(
        'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-(--duration-label)',
        className,
      )}
    />
  );
}
