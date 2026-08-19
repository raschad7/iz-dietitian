'use client';

import { createContext, useContext } from 'react';

import type { GuideStep } from './steps';

export type GuideValue = {
  /** Whether the tour is running. */
  active: boolean;
  /** Zero-based position in `GUIDE_STEPS`. */
  index: number;
  /** The current step, or `null` while the tour is closed. */
  step: GuideStep | null;
  total: number;
  start: () => void;
  stop: () => void;
  next: () => void;
  previous: () => void;
};

/**
 * The context lives in its own module so that the provider and the overlay can
 * both reach it without importing each other.
 *
 * They otherwise would: the provider renders the overlay, and the overlay reads
 * the provider's value. A cycle between two client modules is the kind of thing
 * that works until a bundler decides the evaluation order differently and one
 * side sees `undefined` where a component should be.
 *
 * `null` rather than a thrown error when there is no provider above. The shell
 * this hangs off is shared with the client portal, which has no tour and no
 * business gaining one — so `GuideLauncher` has to be able to ask "is there a
 * guide here" and render nothing when the answer is no. A context that threw
 * would make that question unaskable.
 */
export const GuideContext = createContext<GuideValue | null>(null);

export function useGuide(): GuideValue | null {
  return useContext(GuideContext);
}
