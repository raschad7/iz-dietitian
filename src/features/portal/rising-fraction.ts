'use client';

import { useEffect, useRef, useState } from 'react';

import { easeSweep } from './ease';

/**
 * The count-up behind the portal's completion ring.
 *
 * Ticking a meal moves `TodayRing`'s fraction in one step, which the disc used
 * to print as an instant jump — 40% to 60% with nothing in between. The figure
 * is the one thing on the home screen a client changes themselves, so it is
 * worth the half-second it takes to show it moving.
 *
 * **Both halves ride the same number.** The hook returns the in-flight
 * fraction and the ring draws its arc from it, so the dashes grow with the
 * digits rather than snapping ahead of them. Nothing about the ring's design
 * changes — this only replaces the step with a ramp.
 */

/**
 * Not a named `--duration-*` token, and deliberately so — the same call
 * `today-flame-celebration.tsx` makes for its own two timings.
 *
 * Every token in the scale times a mark *arriving*: a focus line lands, a panel
 * reveals, and the reader only has to see the end state. A count-up is the
 * other thing — the intermediate values are the point, so it has to last long
 * enough for a few of them to be read rather than just long enough to look
 * smooth. `--duration-arc` (220ms) was the closest token and shipped first; at
 * that length the figure had visually landed inside ~130ms and read as a flicker
 * rather than as counting.
 *
 * It is not `--duration-travel` (420ms) either: that is for a whole surface
 * crossing the screen, and the tokens' own note rules it out for anything moving
 * *inside* one.
 *
 * ⚠ **Most of this is spent settling, not counting.** `easeSweep` is
 * front-loaded — it covers 91% of the distance in the first half — so the part
 * a reader actually perceives is roughly the first 60% of whatever this says.
 * Raising it is the right knob; the curve is the app's only one and stays.
 */
const COUNT_MS = 520;

/**
 * The same ramp, for a ring arriving on screen with `countOnMount` — the
 * progress tab, where the figure is the thing the client opened the page to
 * read, so it draws itself from zero rather than appearing already finished.
 *
 * Much longer than `COUNT_MS` because it travels much further. A tick moves the
 * figure by one meal's worth; an entrance covers the whole distance from
 * nothing.
 *
 * ⚠ **This number is large to compensate for the curve, and that is a knowing
 * trade.** `easeSweep` decelerates hard — it covers half of any distance in the
 * first 16% of whatever duration it is given, and that ratio is a property of
 * the curve, not of this constant. So the climb reads as a quick opening burst
 * followed by a long settle, and the only lever on the burst is to stretch the
 * whole thing until the burst itself is slow enough. 520ms, 900ms, 1300ms and
 * 2000ms were each tried and each still opened too fast.
 *
 * The alternative was a linear ramp, which gives every value equal time and is
 * what a counting number actually wants. It was declined deliberately: the
 * design system allows the app exactly one easing curve and forbids inventing a
 * second, and a count-up in one corner of the portal is not the place to break
 * that. If this is ever revisited, the curve is the fix and this constant comes
 * back down with it — do not just raise it again.
 *
 * **Nothing is timed off this.** The streak card below it on the progress tab
 * once was, and the coupling is gone: a decelerating curve has no crisp end to
 * key another animation to, and every threshold standing in for one read as a
 * pause. Both now start together at first paint, so this number is free to
 * change without moving anything else.
 */
const ENTRANCE_MS = 3000;

/** How hard the phone taps back. One short pulse — a confirmation, not an
 * alert. Long enough to register through a case, short enough that a client
 * ticking four meals in a row is not being buzzed at. */
const HAPTIC_MS = 12;

/**
 * One short pulse, on the one API the web has for it.
 *
 * ⚠ **iOS Safari does not implement `navigator.vibrate` and never has**, so
 * this is silently a no-op on every iPhone. It is not a bug to chase and not
 * something a polyfill can reach — the web platform gives a page no other way
 * to drive the taptic engine. Android Chrome is where this is felt.
 *
 * Deliberately **not** gated on `prefers-reduced-motion`. That setting is about
 * visual and vestibular motion; a haptic tick answering the client's own tap is
 * the same class of thing as a physical button's click, and muting it there
 * would take away a confirmation from the readers most likely to be relying on
 * a non-visual one. The count-up above *is* gated — see `useRisingFraction`.
 */
function pulse(): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;

  try {
    navigator.vibrate(HAPTIC_MS);
  } catch {
    // A browser that exposes the method but refuses the call (no user
    // activation yet, or the setting is off) reports it by returning false or
    // throwing. Either way there is nothing to recover and nothing to tell the
    // client — the number they are watching already said it.
  }
}

/**
 * Tracks `target`, returning the value to print this frame.
 *
 * **By default a fresh mount does not count up.** `displayed` starts *at* the
 * target, so the ring paints its real figure on first paint and animates only
 * when the number later moves. That is what keeps the day picker honest: the
 * home page mounts `PlanDayCompletionProvider` with `key={selectedDay}`, so
 * stepping to another day remounts this whole subtree and must arrive at that
 * day's figure directly, rather than counting up to it as if the client had
 * just earned it.
 *
 * **`countOnMount` opts into the opposite**, for a screen whose figure is what
 * the client came to read rather than something they are changing — the
 * progress tab. There the ring starts at zero and draws itself up to the day's
 * fraction once, on arrival. It stays opt-in precisely because of the day
 * picker above: the two screens want opposite things from the same component.
 *
 * **A tween starts from where the pixels are, not from the last target.**
 * `fromRef` follows every painted frame, so a second tick landing mid-flight
 * picks up the ramp in progress instead of jumping back.
 *
 * **An entrance never buzzes.** The haptic fires on a rise in the *target*, and
 * `previousTargetRef` starts at the real target no matter where the *drawing*
 * starts — so a page that opens counting to 80% is silent, while a meal ticked
 * afterwards still taps. Opening a screen is not an achievement.
 */
export function useRisingFraction(
  target: number | null,
  { countOnMount = false }: { countOnMount?: boolean } = {},
): number | null {
  /** Where the drawing begins — zero for an entrance, the figure itself otherwise. */
  const origin = countOnMount && target !== null ? 0 : target;

  const [displayed, setDisplayed] = useState(origin);

  /** The last painted value — the start of the next tween. */
  const fromRef = useRef(origin);
  /** The previous *target*, for spotting a real increase. Never the origin. */
  const previousTargetRef = useRef(target);
  /** Whether the next tween is the entrance, which is given longer to run. */
  const entrancePendingRef = useRef(countOnMount);

  useEffect(() => {
    const previousTarget = previousTargetRef.current;
    previousTargetRef.current = target;

    if (previousTarget !== null && target !== null && target > previousTarget) pulse();
  }, [target]);

  useEffect(() => {
    const from = fromRef.current;
    const isEntrance = entrancePendingRef.current;
    entrancePendingRef.current = false;

    // Nothing to ramp between: no figure at either end, the value did not
    // move, or the reader has asked for no motion. `globals.css` collapses CSS
    // transitions under that query but cannot reach a JS tween, so this is the
    // one place the preference has to be read rather than inherited — and it is
    // what makes an entrance land on its figure instantly rather than not at
    // all, which is the difference between honouring the preference and
    // withholding the number.
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (target === null || from === null || from === target || reduced) {
      fromRef.current = target;
      setDisplayed(target);
      return;
    }

    let frame = 0;
    const started = performance.now();
    const distance = target - from;
    const duration = isEntrance ? ENTRANCE_MS : COUNT_MS;

    const step = (now: number) => {
      const progress = Math.min((now - started) / duration, 1);
      const value = progress >= 1 ? target : from + distance * easeSweep(progress);

      fromRef.current = value;
      setDisplayed(value);

      if (progress < 1) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return displayed;
}
