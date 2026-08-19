'use client';

import * as React from 'react';

/** Surface exit finishes before native close, which finishes before unmount. */
export const DIALOG_EXIT_DURATION_MS = 130;
export const DIALOG_NATIVE_CLOSE_DELAY_MS = 140;
export const DIALOG_PRESENCE_DELAY_MS = 150;

export function dialogPresenceDelayMs(reduceMotion: boolean): number {
  return reduceMotion ? 0 : DIALOG_PRESENCE_DELAY_MS;
}

/** Keeps a conditionally rendered dialog alive long enough to play its exit. */
export function useDialogPresence(open: boolean): boolean {
  const [retained, setRetained] = React.useState(open);

  React.useEffect(() => {
    if (open) {
      const timeout = window.setTimeout(() => setRetained(true), 0);
      return () => window.clearTimeout(timeout);
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timeout = window.setTimeout(
      () => setRetained(false),
      dialogPresenceDelayMs(reduceMotion),
    );

    return () => window.clearTimeout(timeout);
  }, [open]);

  return open || retained;
}

/** Retains the payload a closing dialog needs to render its final frame. */
export function useDialogPresenceValue<T>(value: T | null | undefined): T | null {
  const present = useDialogPresence(value != null);
  const [retained, setRetained] = React.useState<T | null>(value ?? null);

  React.useEffect(() => {
    if (value != null) {
      const timeout = window.setTimeout(() => setRetained(value), 0);
      return () => window.clearTimeout(timeout);
    } else if (!present) {
      const timeout = window.setTimeout(() => setRetained(null), 0);
      return () => window.clearTimeout(timeout);
    }
  }, [present, value]);

  return value ?? (present ? retained : null);
}
