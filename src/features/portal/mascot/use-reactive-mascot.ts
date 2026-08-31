'use client';

import { useEffect, useRef, useState } from 'react';

import {
  MASCOT_HOLD_MS,
  resolveMascotEmotion,
  type MascotEmotion,
  type MascotSignals,
  type MealSignal,
} from './emotion';
import {
  mascotCelebrationFor,
  type MascotCelebration,
  type MascotMilestone,
  type MascotProgression,
  type MascotState,
} from './states';

/**
 * The half of the mascot that has memory — every signal in `emotion.ts` is
 * pure and stateless, and this is what turns "the client's streak just hit
 * zero" or "this is the first paint of the session" into a fact rather than
 * something re-derived (and re-celebrated) on every render.
 *
 * Three kinds of memory, at three different lifetimes:
 * - **Cross-session** (`localStorage`): the progression celebration and the
 *   streak events, exactly the pattern `use-mascot-progression.ts` already
 *   uses — scoped so a new week or a new day can be celebrated again without
 *   ever replaying what a past one already earned.
 * - **This session** (`sessionStorage`): the welcome, once per tab.
 * - **This mount** (a `ref`): which meal signal was last seen, so a tick
 *   that clears "due" and a new meal becoming due later the same day can
 *   each still pulse once, without a browser-storage record to clean up for
 *   something this narrow.
 */

function readStorage<T>(storage: Storage, key: string): T | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeStorage(storage: Storage, key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // A full or disabled store costs a repeated pulse, nothing more — same
    // judgement `use-mascot-progression.ts` makes.
  }
}

/**
 * The `qiwam.` prefix is the product's former name. It stays: this key names a
 * record already sitting in real browsers, and renaming it would not migrate
 * that record, it would abandon it. A rebrand is not a reason to silently
 * discard state a user already has.
 */
function progressionStorageKey(scope: string): string {
  return `qiwam.portal.mascot.progression.${scope}`;
}

function streakStorageKey(dateScope: string): string {
  return `qiwam.portal.mascot.streak.${dateScope}`;
}

const WELCOME_KEY = 'qiwam.portal.mascot.welcomed';
const LAST_VISIT_KEY = 'qiwam.portal.mascot.lastVisit';

/** Away this long or more reads as "returning", not merely "the next visit". */
const RETURNING_AFTER_MS = 6 * 60 * 60 * 1000;

/** No pointer/key/touch/scroll activity for this long, while mounted, reads as sleepy. */
const IDLE_AFTER_MS = 6 * 60 * 1000;

/** Streak lengths worth a quiet nod — see §"consistency" in the brief. */
const STREAK_CONSISTENCY_STEPS = [3, 7, 14, 30] as const;

type StreakRecord = { streak: number; celebratedMilestone: number };

export type ReactiveMascotInput = {
  /** The single adherence reading — see `states.ts`. */
  progression: MascotProgression;
  /** The progression celebration's scope — normally the week's start date. */
  scope: string;
  /** The streak record's scope — normally today's date. */
  dateScope: string;
  /** `null` when there is no streak concept for this surface. */
  streak: number | null;
  streakAtRisk: boolean;
  meal: MealSignal;
  isLoading?: boolean;
  isEmpty?: boolean;
  /** `false` freezes on the tier baseline — no welcome, no pulses, no timers. */
  animated?: boolean;
};

export type ReactiveMascotView = {
  emotion: MascotEmotion;
};

export function useReactiveMascot({
  progression,
  scope,
  dateScope,
  streak,
  streakAtRisk,
  meal,
  isLoading = false,
  isEmpty = false,
  animated = true,
}: ReactiveMascotInput): ReactiveMascotView {
  const { state, milestone, complete } = progression;

  /* ── Progression celebration: evolve / milestone / goal ──
     Identical in shape to `useMascotProgression` — kept as its own copy
     rather than a shared import because that hook's return type is the
     `MascotCelebration` this one needs to feed straight into the resolver,
     and duplicating four short effects here is cheaper to read than a
     generic hook trying to serve both call sites. */
  const [celebration, setCelebration] = useState<MascotCelebration>('none');
  const seenProgressionRef = useRef<{ state: MascotState; milestone: MascotMilestone | null } | null>(null);
  const progressionScopeRef = useRef<string | null>(null);

  useEffect(() => {
    if (!animated || typeof window === 'undefined') return;

    if (progressionScopeRef.current !== scope) {
      progressionScopeRef.current = scope;
      seenProgressionRef.current = readStorage(window.localStorage, progressionStorageKey(scope));
    }

    const seen = seenProgressionRef.current;

    if (seen === null) {
      seenProgressionRef.current = { state, milestone };
      writeStorage(window.localStorage, progressionStorageKey(scope), { state, milestone });
      return;
    }

    const next = mascotCelebrationFor({
      previousState: seen.state,
      previousMilestone: seen.milestone,
      current: { state, milestone, complete },
    });

    const recorded = {
      state,
      milestone:
        milestone === null
          ? seen.milestone
          : seen.milestone === null
            ? milestone
            : (Math.max(seen.milestone, milestone) as MascotMilestone),
    };
    seenProgressionRef.current = recorded;
    writeStorage(window.localStorage, progressionStorageKey(scope), recorded);

    if (next !== 'none') setCelebration(next);
  }, [animated, complete, milestone, scope, state]);

  /* ── Streak events: lost, recovered, or a consistency run reached ── */
  const [streakEvent, setStreakEvent] = useState<'none' | 'lost' | 'recovered' | 'consistency'>('none');
  const seenStreakRef = useRef<StreakRecord | null>(null);
  const streakScopeRef = useRef<string | null>(null);

  useEffect(() => {
    if (!animated || typeof window === 'undefined' || streak === null) return;

    if (streakScopeRef.current !== dateScope) {
      streakScopeRef.current = dateScope;
      seenStreakRef.current = readStorage(window.localStorage, streakStorageKey(dateScope));
    }

    const seen = seenStreakRef.current;

    if (seen === null) {
      seenStreakRef.current = { streak, celebratedMilestone: 0 };
      writeStorage(window.localStorage, streakStorageKey(dateScope), { streak, celebratedMilestone: 0 });
      return;
    }

    let event: 'none' | 'lost' | 'recovered' | 'consistency' = 'none';
    if (seen.streak > 0 && streak === 0) event = 'lost';
    else if (seen.streak === 0 && streak > 0) event = 'recovered';

    const highestReached = [...STREAK_CONSISTENCY_STEPS].reverse().find((step) => streak >= step) ?? 0;
    let celebratedMilestone = seen.celebratedMilestone;

    if (event === 'none' && highestReached > seen.celebratedMilestone) {
      event = 'consistency';
      celebratedMilestone = highestReached;
    } else if (streak === 0) {
      // A broken streak can earn the same run length's nod again once rebuilt.
      celebratedMilestone = 0;
    }

    seenStreakRef.current = { streak, celebratedMilestone };
    writeStorage(window.localStorage, streakStorageKey(dateScope), { streak, celebratedMilestone });

    if (event !== 'none') setStreakEvent(event);
  }, [animated, dateScope, streak]);

  /*
    ── Meal signal, edge-triggered so a tick or a new meal becoming due can
    each still pulse once — a `meal` prop that simply stays `'due'` must not
    replay the reminder on every re-render. Set during render rather than in
    an effect, the same "adjust state when a prop changes" pattern used
    above in `MascotFace` for its own frame reset: `seenMeal` only exists to
    notice the transition, `mealPulse` is what actually latches it.
  */
  const [mealPulse, setMealPulse] = useState<'none' | 'due' | 'missed'>('none');
  const [seenMeal, setSeenMeal] = useState<MealSignal>(null);

  if (animated && meal !== seenMeal) {
    setSeenMeal(meal);
    if (meal === 'due' || meal === 'missed') setMealPulse(meal);
  }

  /* ── Welcome: once per browser tab session, §5 ── */
  const [welcomePending, setWelcomePending] = useState(false);

  useEffect(() => {
    if (!animated || typeof window === 'undefined') return;
    try {
      if (!window.sessionStorage.getItem(WELCOME_KEY)) {
        window.sessionStorage.setItem(WELCOME_KEY, '1');
        // `react-hooks/set-state-in-effect` wants this expressed as a
        // `useSyncExternalStore` read instead — the pattern
        // `AppointmentRequestFab` uses for its own client-only fact. That
        // works for a value a *read* can answer; this one cannot be a pure
        // snapshot, because reading it also has to consume it (the second
        // read must see it already claimed), and a `getSnapshot` called more
        // than once in the same commit — which React does, to check for
        // tearing — would then disagree with itself. A one-time,
        // side-effecting read genuinely belongs in an effect; see the
        // "fetching data" case React's own docs carve out from this rule.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setWelcomePending(true);
      }
    } catch {
      // No session record kept — the welcome simply never plays this visit.
    }
  }, [animated]);

  /* ── Inactivity: a real gap since the last visit, and a session idle ── */
  const [inactivity, setInactivity] = useState<'active' | 'returning' | 'sleepy'>('active');

  useEffect(() => {
    if (!animated || typeof window === 'undefined') return;

    let returning = false;
    try {
      const last = Number(window.localStorage.getItem(LAST_VISIT_KEY) ?? '0');
      if (last > 0 && Date.now() - last > RETURNING_AFTER_MS) returning = true;
      window.localStorage.setItem(LAST_VISIT_KEY, String(Date.now()));
    } catch {
      // No record kept — no "returning" pulse this visit, nothing else affected.
    }
    // Same exception as the welcome record above: the read has to consume
    // the gap it measures (the timestamp is rewritten in the same breath),
    // so it cannot be expressed as a tear-safe `useSyncExternalStore` snapshot.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (returning) setInactivity('returning');

    let idleTimer: number | null = null;

    function armIdleTimer() {
      if (idleTimer !== null) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => setInactivity('sleepy'), IDLE_AFTER_MS);
    }

    function onActivity() {
      setInactivity((current) => (current === 'sleepy' ? 'active' : current));
      armIdleTimer();
    }

    armIdleTimer();

    const events = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const;
    events.forEach((event) => window.addEventListener(event, onActivity, { passive: true }));

    return () => {
      if (idleTimer !== null) window.clearTimeout(idleTimer);
      events.forEach((event) => window.removeEventListener(event, onActivity));
    };
  }, [animated]);

  /* ── Composition: one resolution, held for its full duration ──
     §3 of the brief: a high-priority state may only interrupt briefly, and
     must not be cut short by whatever caused it to resolve becoming stale a
     moment later (suppressing a meal pulse the instant it starts, for
     instance, changes the resolver's own top pick mid-hold). `lockedRef` is
     what protects a running pulse from that — while it is true, new signal
     values are read on the *next* pass rather than interrupting this one. */
  const [activeEmotion, setActiveEmotion] = useState<MascotEmotion | null>(null);
  const lockedRef = useRef(false);
  const revertTimerRef = useRef<number | null>(null);

  const streakSignal: MascotSignals['streak'] =
    streak === null
      ? null
      : {
          current: streak,
          atRisk: streakAtRisk,
          justLost: streakEvent === 'lost',
          justRecovered: streakEvent === 'recovered',
          milestoneReached: streakEvent === 'consistency',
        };

  const signals: MascotSignals = {
    progression,
    celebration,
    meal: mealPulse === 'none' ? null : mealPulse,
    streak: streakSignal,
    inactivity,
    isLoading,
    isEmpty,
    welcomePending,
  };

  /*
    The unlocked reading — pure, computed fresh every render, and what the
    hook falls back to whenever no pulse is currently locked in. This is also
    what removes the need for an effect to ever write a *non-temporary*
    resolution into state: a persistent emotion (`resting`, `thinking`,
    `sleepy`, the completed week's own resting reading) is simply this value,
    read straight off the current signals, with nothing to time out.
  */
  const liveResolution = resolveMascotEmotion(signals);

  useEffect(() => {
    // Nothing to resolve while frozen — the hook's own return statement
    // below already falls back to `liveResolution` whenever `animated` is
    // false, regardless of whatever `activeEmotion` was left holding.
    if (!animated) return;
    if (lockedRef.current) return;
    // A persistent reading needs no lock or timer — see the comment above.
    if (!liveResolution.temporary) return;

    const resolution = liveResolution;

    lockedRef.current = true;

    /*
      The timer is armed first, deliberately — it is the actual external
      system this effect exists to synchronise with (the resolution has to
      hold for `resolution.holdMs` real milliseconds, which nothing inside
      React can time on its own), and everything below is React catching up
      to what the timer now owns. `settle` is declared as a function
      statement so it is hoisted and callable from the timer below despite
      being defined after it textually.
    */
    function settle() {
      lockedRef.current = false;
      setCelebration('none');
      setActiveEmotion(null);
      revertTimerRef.current = null;
    }

    revertTimerRef.current = window.setTimeout(() => {
      // §10: a lost streak settles into encouragement, not straight back to
      // idle — the two-stage revert is what plays that second beat before
      // letting go entirely.
      const settleInto = resolution.settleInto;
      if (settleInto !== 'resting' && MASCOT_HOLD_MS[settleInto] > 0) {
        setActiveEmotion(settleInto);
        revertTimerRef.current = window.setTimeout(settle, MASCOT_HOLD_MS[settleInto]);
      } else {
        settle();
      }
    }, resolution.holdMs);

    // This is the one setState in the file `react-hooks/set-state-in-effect`
    // cannot be routed around: the timer above is the actual external system
    // being synchronised with, but React itself has no way to know a pulse
    // is "in progress" other than being told — `lockedRef` alone is not
    // reactive, so nothing would re-render to show `resolution.emotion` (or,
    // later, to fall back once `settle` clears it) without this call. The
    // celebration and streak-event effects above reach the same shape and are
    // not flagged, only because their own `setState` calls happen to read a
    // freshly-written `localStorage` value first — the same underlying
    // pattern, caught by this rule's heuristic and not by intent.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveEmotion(resolution.emotion);

    // Consume whichever one-shot trigger produced this pulse, so it cannot
    // fire again while this one is still holding.
    if (resolution.emotion === 'welcome') setWelcomePending(false);
    if (resolution.emotion === 'mealReminder' || resolution.emotion === 'missedMeal') setMealPulse('none');
    if (['sad', 'backOnTrack', 'consistency'].includes(resolution.emotion)) setStreakEvent('none');
    if (resolution.emotion === 'surprised') setInactivity('active');

    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately keyed on the raw signal values below, not on `signals` or `resolution` (both rebuilt every render); `lockedRef` is what keeps a running pulse from being interrupted by a signal change mid-hold, and this effect has to re-run once it releases.
  }, [
    animated,
    celebration,
    mealPulse,
    streakSignal?.atRisk,
    streakSignal?.justLost,
    streakSignal?.justRecovered,
    streakSignal?.milestoneReached,
    inactivity,
    isLoading,
    isEmpty,
    welcomePending,
    progression.state,
    progression.milestone,
    progression.complete,
  ]);

  useEffect(
    () => () => {
      if (revertTimerRef.current !== null) window.clearTimeout(revertTimerRef.current);
    },
    [],
  );

  return { emotion: animated ? (activeEmotion ?? liveResolution.emotion) : liveResolution.emotion };
}
