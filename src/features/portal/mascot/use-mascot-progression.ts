'use client';

import { useEffect, useRef, useState } from 'react';

import {
  mascotCelebrationFor,
  type MascotCelebration,
  type MascotMilestone,
  type MascotProgression,
  type MascotState,
} from './states';

/**
 * The half of the mascot that has memory: what the client was last shown, so
 * the same achievement is never celebrated twice.
 *
 * ⚠ **This is the hook §15 of the brief is about.** A celebration keyed off
 * nothing but the current numbers replays on every mount — every navigation
 * between tabs, every `router.refresh()` after a meal is ticked, every
 * re-render. That turns the one moment worth marking into wallpaper. So the
 * last state and the highest celebrated milestone are persisted, read back
 * before anything is played, and compared against — `mascotCelebrationFor` in
 * `states.ts` does the comparing and stays pure; this file owns only the
 * remembering.
 *
 * The same store is what keeps the home tab and the progress tab from each
 * playing their own copy of a celebration: whichever paints first records it,
 * and the second reads the record.
 */

/**
 * How long each celebration runs before the mascot settles back into its idle
 * float, in ms. These are the JS side of the `q-mascot-*` keyframes in
 * `globals.css` and have to stay in step with them — the class is removed when
 * the timer fires, so a timer shorter than its animation cuts it off mid-way.
 *
 * Not `--duration-*` tokens, the same call `rising-fraction.ts` and
 * `today-flame-celebration.tsx` both make and for the same reason: every token
 * in that scale times a mark *arriving*, and these time a small performance
 * whose middle is the part worth watching. Multiples of `--duration-arc`
 * (220ms) all the same, so they sit on the system's own grid.
 */
export const MASCOT_CELEBRATION_MS: Record<Exclude<MascotCelebration, 'none'>, number> = {
  /** Anticipation, swap, settle. Two arcs. */
  evolve: 880,
  /** The same swap plus a hop and a particle burst. */
  milestone: 1320,
  /** The full-week celebration: hop, burst, glow, and the banner reading. */
  goal: 1980,
};

/** What gets written down between visits. */
type SeenProgression = {
  state: MascotState;
  /** Highest milestone ever *celebrated*. Never lowered — see below. */
  milestone: MascotMilestone | null;
};

/**
 * One store key per scope, where the scope is the week the reading belongs to.
 *
 * Scoping to the week is what lets next week's climb be celebrated again
 * without ever replaying this week's. A single unscoped key would congratulate
 * a client exactly once in their life; a key per render would congratulate them
 * constantly.
 */
/**
 * The `qiwam.` prefix is the product's former name. It stays: this key names a
 * record already sitting in real browsers, and renaming it would not migrate
 * that record, it would abandon it. A rebrand is not a reason to silently
 * discard state a user already has.
 */
function storageKeyFor(scope: string): string {
  return `qiwam.portal.mascot.${scope}`;
}

/**
 * Read, tolerating everything.
 *
 * `localStorage` throws outright in a Safari private window and can hold
 * whatever a previous version of this file wrote, so every failure — disabled
 * storage, malformed JSON, a shape that no longer parses — resolves to "nothing
 * remembered". That is the safe direction: a forgotten celebration is a
 * celebration not played, and never a broken screen.
 */
function readSeen(scope: string): SeenProgression | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(storageKeyFor(scope));
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;

    const { state, milestone } = parsed as Partial<SeenProgression>;
    if (typeof state !== 'number') return null;

    return {
      state: state as MascotState,
      milestone: typeof milestone === 'number' ? (milestone as MascotMilestone) : null,
    };
  } catch {
    return null;
  }
}

function writeSeen(scope: string, seen: SeenProgression): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(storageKeyFor(scope), JSON.stringify(seen));
  } catch {
    // A full or disabled store costs a repeated celebration, nothing more.
    // There is no fallback worth building and nothing to tell the client.
  }
}

export type MascotProgressionView = {
  /**
   * Which animation is running right now. `'none'` is the resting state, in
   * which the mascot floats and nothing else happens.
   *
   * **Always `'none'` on the server and on the first client render**, because
   * that is where it starts and only the effect below ever moves it. No
   * separate "has the store been read yet" flag is needed to keep hydration
   * honest — the resting state already is the server's answer, and a
   * celebration can only appear once the client has read what it owes.
   */
  celebration: MascotCelebration;
};

/**
 * Watch a reading and report what should be played for it.
 *
 * **Nothing plays on a first visit.** When the scope has no record yet, the
 * current reading is written down silently and the mascot simply appears at its
 * earned drawing. Arriving at a screen is not an achievement — the same
 * judgement `useRisingFraction` makes when it refuses to buzz on an entrance.
 *
 * **The remembered state follows the reading down; the milestone never does.**
 * A week's average falls when a day is missed, and the mascot has to be able to
 * congratulate the client for climbing back — so `state` is rewritten on every
 * change, and a genuine step back up animates. `milestone` only ever rises, so
 * crossing 50% twice in one week is marked once. The asymmetry is the
 * difference between "you moved forward again" and "we already said this".
 */
export function useMascotProgression({
  progression,
  scope,
  animated = true,
}: {
  progression: MascotProgression;
  /** Usually the ISO date the reading's week starts on. See `storageKeyFor`. */
  scope: string;
  animated?: boolean;
}): MascotProgressionView {
  const [celebration, setCelebration] = useState<MascotCelebration>('none');

  /**
   * What is currently written down, mirrored so the effect below does not have
   * to re-read the store on every reading. A ref rather than state because
   * nothing renders from it — it only decides what to play.
   */
  const seenRef = useRef<SeenProgression | null>(null);
  /** Which scope `seenRef` belongs to, so a week rollover reloads it. */
  const scopeRef = useRef<string | null>(null);

  /**
   * Destructured to primitives, and the effect below depends on these rather
   * than on `progression` itself. The object is rebuilt by
   * `getMascotProgression` on every render of the caller, so depending on it
   * would re-run the effect — and rewrite the store — on every render, which
   * is a milder form of the exact fault this hook exists to prevent.
   */
  const { state, milestone, complete } = progression;

  useEffect(() => {
    if (!animated) return;

    // A new scope — a new week — starts from whatever that week has recorded,
    // which is normally nothing.
    if (scopeRef.current !== scope) {
      scopeRef.current = scope;
      seenRef.current = readSeen(scope);
    }

    const seen = seenRef.current;

    if (seen === null) {
      // First sight of this week. Record where the client already is and play
      // nothing — see the note on this function.
      seenRef.current = { state, milestone };
      writeSeen(scope, { state, milestone });
      return;
    }

    const next = mascotCelebrationFor({
      previousState: seen.state,
      previousMilestone: seen.milestone,
      current: { state, milestone, complete },
    });

    // The reading is recorded whether or not it earned an animation: a drop
    // has to be remembered too, or the climb back out of it would be compared
    // against a high-water mark and stay silent.
    const recorded: SeenProgression = {
      state,
      // Only ever upward. `Math.max` cannot be used directly because `null` is
      // a valid "no milestone yet".
      milestone:
        milestone === null
          ? seen.milestone
          : seen.milestone === null
            ? milestone
            : (Math.max(seen.milestone, milestone) as MascotMilestone),
    };

    seenRef.current = recorded;
    writeSeen(scope, recorded);

    if (next !== 'none') setCelebration(next);
  }, [animated, complete, milestone, scope, state]);

  // Back to the idle float once the animation has had its full run. Keyed on
  // `celebration` so a milestone arriving mid-evolve restarts the clock at the
  // longer duration rather than being cut short by the shorter one's timer.
  useEffect(() => {
    if (celebration === 'none') return;

    const timer = window.setTimeout(
      () => setCelebration('none'),
      MASCOT_CELEBRATION_MS[celebration],
    );

    return () => window.clearTimeout(timer);
  }, [celebration]);

  return { celebration };
}
