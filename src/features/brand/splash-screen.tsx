'use client';

import { useEffect, useRef, useState } from 'react';

import {
  LOCKUP_WORDMARK_PATH,
  MARK_LEAF_PATH,
  MARK_SEED_CX,
  MARK_VIEWBOX,
  SEED_CY,
  SEED_ROTATION,
  SEED_RX,
  SEED_RY,
  WORDMARK_VIEWBOX,
} from '@/features/brand/logo';

import { createSplashSound, LANDING_COUNT, type PendingLanding } from './splash-sound';

/**
 * The launch screen: a green tile, the mark hopping up it, and the name landing
 * underneath.
 *
 * Mounted by both shells — `[locale]/app/layout.tsx` and
 * `[locale]/portal/layout.tsx` — and by neither of the public screens. A splash
 * belongs to an app being opened; on a login form or the marketing page it is a
 * two-second wall in front of a page somebody navigated to on purpose.
 *
 * ## The motion is CSS, and that is a safety property
 *
 * Every keyframe lives in the `§ The splash screen` block of `globals.css`.
 * This component draws two SVGs, schedules some sound and takes the element out
 * of the DOM when the fade has finished — and that ordering matters more than
 * it looks. The overlay's own exit is a CSS animation with a forwards fill, so
 * **the splash clears itself with no JavaScript at all**: a hydration that
 * fails, a chunk that 404s, a browser that has decided to run nothing today,
 * and the reader still gets their app. A splash driven from a `setTimeout` is a
 * full-screen panel one broken bundle away from being permanent.
 *
 * The timings below are the same numbers, written twice. They have to be: a
 * stylesheet cannot import a module, and script cannot read a keyframe. **If
 * one side changes, change the other** — the same contract `logo.ts` has with
 * `--brand-leaf`.
 *
 * ## It never blocks anything
 *
 * `pointer-events: none` on the overlay from the first frame, so a reader who
 * knows where they are going taps straight through it to the app underneath.
 * That same tap also cuts the splash short — see `skip` below. Nothing here is
 * in the accessibility tree either (`aria-hidden`): the mark and the wordmark
 * are the product's name in picture form, in front of a document whose title
 * already says it, and a screen reader that announced "Enzyme" here would be
 * saying it twice before anyone had asked for it once.
 */

/** ms. One hop; three of them carry the mark from below the fold to the middle. */
const HOP_MS = 300;

/**
 * ms from first paint, one per landing — the frames the mark hits the ground.
 *
 * These are `33.33%`, `66.67%` and `100%` of `q-splash-hop`'s 900ms, and they
 * are what the sound is hung on. Read them off the keyframes, never guess them.
 */
const LANDING_MS = Array.from({ length: LANDING_COUNT }, (_, index) => (index + 1) * HOP_MS);

/** ms from first paint. `q-splash-out`'s delay, then its duration. */
const OUT_DELAY_MS = 1620;
const OUT_MS = 300;

/**
 * ms the picture will wait for the browser to answer about audio.
 *
 * The whole point of the hold — see the effect. It is short because a browser
 * that is *going* to allow audio says so in a frame or two: a permitted context
 * opens `running` and never reaches the wait at all, and a `resume()` that can
 * succeed succeeds immediately. This budget is only ever spent in full by a
 * browser that was never going to answer, where it buys nothing and costs a
 * fifth of a second of a tile that is already fully painted.
 */
const AUDIO_GRACE_MS = 200;

/**
 * ms of elapsed animation past which the hold is not worth taking.
 *
 * Pausing is invisible while the character is still off screen and obvious the
 * moment it is not — a frozen figure mid-arc reads as the page having hung. The
 * first hop clears the edge at around 150ms, so this stops short of that. Past
 * it the splash runs on time and the sound takes whichever landings are left.
 */
const HOLD_LIMIT_MS = 120;

/**
 * ms of slack on the fallback below.
 *
 * The overlay is normally removed by its own `animationend`. This is the other
 * path: a browser with animations disabled outright never fires one, and
 * without a floor under it the splash would be permanent for exactly the
 * readers least able to do anything about it.
 */
const FALLBACK_SLACK_MS = 400;

export function SplashScreen() {
  const [present, setPresent] = useState(true);
  const overlayRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    /*
      How far into the splash we already are.

      The animation starts when the browser paints the element; this effect runs
      when React hydrates, and on a cold load with a route still streaming those
      two can be several hundred milliseconds apart. Anything scheduled from
      "now" would be that much late — the blips would land after the hops that
      caused them, which is worse than silence.

      `getAnimations()` on the hopping element returns the one CSS animation it
      carries, and its `currentTime` is the browser's own answer to "how far in
      are we". Reduced motion removes the animation, so the list is empty and
      this reads 0 — which is correct there too: nothing is moving, so nothing
      is behind.
    */
    const readElapsed = () => {
      const [hop] = markRef.current?.getAnimations() ?? [];
      return typeof hop?.currentTime === 'number' ? hop.currentTime : 0;
    };

    const elapsedMs = readElapsed();

    const landingsAfter = (from: number): PendingLanding[] =>
      LANDING_MS.map((at, index) => ({ index, delayMs: at - from }));

    /*
      Every jump gets its landing, which is the whole reason this is not simply
      "schedule and hope".

      A browser will not start audio without a user gesture, and a cold load has
      not had one — so on the loads where the answer is no, there is nothing any
      of this can do and the splash is silent. What it *can* do is make sure
      that whenever the answer is yes, it is yes in time for the **first** hop
      rather than the second. Asking takes a moment; the character waits off
      screen for that moment rather than setting off without us, so the three
      blips land on three impacts instead of on however many were left over.

      The wait is taken on the animations themselves rather than on a delay in
      the stylesheet, because the stylesheet cannot know the answer and because
      pausing preserves each one's position — including the tile's own exit, so
      the hold shifts the entire timeline rather than eating into the end of it.

      It is skipped when the splash is already under way (`HOLD_LIMIT_MS`) and
      when there is no sound to wait for at all — reduced motion, or a browser
      with no `AudioContext` — in which case `createSplashSound` returns null
      and the picture is never touched.
    */
    const sound = createSplashSound();
    const held = sound !== null && elapsedMs < HOLD_LIMIT_MS ? overlay.getAnimations({ subtree: true }) : [];

    for (const animation of held) animation.pause();

    let released = false;

    void sound?.whenAudible(AUDIO_GRACE_MS).then((audible) => {
      if (released) return;
      released = true;

      // The picture goes on either way. Only the sound depended on the answer.
      for (const animation of held) animation.play();
      if (audible) sound.schedule(landingsAfter(readElapsed()));
    });

    const dismiss = () => setPresent(false);

    /*
      `animationName` and not just "an animation ended": this listener is on the
      overlay, and animation events bubble, so the hop, the squash, the landing
      and the wordmark all arrive here first. Only the overlay's own exit means
      the splash is over.
    */
    const onAnimationEnd = (event: AnimationEvent) => {
      if (event.animationName === 'q-splash-out') dismiss();
    };

    /*
      Cut it short the moment the reader does anything at all.

      Not a courtesy — an interface that cannot be interrupted is the thing this
      screen is most at risk of being. The overlay does not take pointer events,
      so this fires on the reader's *real* first tap on the app behind it: the
      tap does what they meant it to do, and the splash gets out of the way of
      its own accord rather than eating the gesture.

      `data-skip` restarts `q-splash-out` with no delay — see the rule beside
      the keyframe. The sound goes with it: a blip left ringing over a screen
      that has already gone is a sound with nothing to explain it.
    */
    const skip = () => {
      overlay.dataset.skip = '';
      sound?.stop();
    };

    overlay.addEventListener('animationend', onAnimationEnd);
    window.addEventListener('pointerdown', skip, { once: true, passive: true });
    window.addEventListener('keydown', skip, { once: true });

    /*
      `AUDIO_GRACE_MS` is in here because the hold above pushes the tile's own
      exit back by up to that much, and this fallback exists precisely for the
      case where that exit never fires an event to say it happened.
    */
    const fallback = window.setTimeout(
      dismiss,
      Math.max(0, OUT_DELAY_MS + OUT_MS - elapsedMs) + AUDIO_GRACE_MS + FALLBACK_SLACK_MS,
    );

    return () => {
      overlay.removeEventListener('animationend', onAnimationEnd);
      window.removeEventListener('pointerdown', skip);
      window.removeEventListener('keydown', skip);
      window.clearTimeout(fallback);
      /*
        An unmount while the picture is still held would leave it paused, and
        React reuses nothing here — but StrictMode's double mount runs this
        cleanup against animations the second effect is about to adopt, so they
        have to be handed back running.
      */
      if (!released) {
        released = true;
        for (const animation of held) animation.play();
      }
      sound?.stop();
    };
  }, []);

  if (!present) return null;

  return (
    <div ref={overlayRef} className="q-splash" aria-hidden="true">
      <div className="q-splash-figure">
        {/*
          Three nested divs, and not a `<g>` inside the SVG either.

          One animated property each, because that is the only way they compose:
          `translate` for the arc across the tile, `scale` for the approach from
          0.42 to full size, then `scale` again for the squash — which is why
          the last two cannot share an element, since the second would win
          outright where nesting makes them multiply. The lean rides with the
          squash on `rotate`, a third individual transform property, so it needs
          no element of its own.

          They are HTML elements because all three want a `transform-origin` at
          the mark's feet, and `transform-origin` on a child *inside* an SVG does
          not resolve against the viewBox: the 404 page's ghost was measured
          pivoting on x = 0 and throwing itself a frame-width sideways for
          exactly that reason.
        */}
        <div ref={markRef} className="q-splash-mark">
          <div className="q-splash-grow">
            <div className="q-splash-body">
              <svg viewBox={MARK_VIEWBOX} fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d={MARK_LEAF_PATH} fill="var(--q-splash-figure)" />
                {/*
                  The seeds are painted in the tile's own green rather than the
                  brand's dark seed colour — they are holes in a white mark on a
                  green ground, which is the reversed lockup `mark-on-color.svg`
                  draws for a coloured tile. The two greens have to be the same
                  green, so this reads the ground's variable rather than naming
                  one: change the tile and the eyes follow it.
                */}
                {MARK_SEED_CX.map((cx) => (
                  <ellipse
                    key={cx}
                    cx={cx}
                    cy={SEED_CY}
                    rx={SEED_RX}
                    ry={SEED_RY}
                    transform={`rotate(${SEED_ROTATION} ${cx} ${SEED_CY})`}
                    fill="var(--q-splash-ground)"
                  />
                ))}
              </svg>
            </div>
          </div>
        </div>

        {/*
          The name, under the mark rather than beside it.

          `WORDMARK_VIEWBOX` is the lettering framed on its own ink — the lockup
          path, cropped rather than redrawn, so there is still one copy of these
          curves in the repository. The lockup itself is not used here: it sets
          the name *beside* the mark and reads right to left, which is a
          horizontal composition, and this screen is a vertical one.

          It holds its width from the first frame even while it is still
          invisible, so the column below the mark is already the right height
          and the mark's landing spot does not move underneath it when the name
          arrives.
        */}
        <svg
          className="q-splash-word"
          viewBox={WORDMARK_VIEWBOX}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d={LOCKUP_WORDMARK_PATH} fill="var(--q-splash-figure)" />
        </svg>
      </div>
    </div>
  );
}
