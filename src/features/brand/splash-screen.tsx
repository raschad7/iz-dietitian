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
 * **Mounted once, from `[locale]/layout.tsx`, and nowhere else.** Not from the
 * two shells and not from the landing page, which is where it used to live: a
 * document is loaded on whatever route the reader was last on, so a tile that
 * only exists under `/app` and `/portal` is a tile that does not appear when a
 * deep route is reloaded. One mount at the root covers every route in both
 * apps, nested ones included, without any route knowing about it.
 *
 * ## When it plays is not decided here
 *
 * **This component draws the tile; `SplashLaunchGate` decides whether it exists
 * at all.** A hard reload plays it and a quick reload does not, and the only
 * place those two can be told apart is the request — so the gate is a Server
 * Component reading the navigation's cache headers, and a load that should stay
 * quiet is sent no tile at all. Nothing can flash if nothing was sent, which is
 * why there is no inline script here and no `display: none` rule in
 * `globals.css` any more. See that file for the whole of it.
 *
 * Two things below still matter to the rule, both about *this* document:
 *
 *  1. The mount is in the root layout, which survives every client-side
 *     navigation in a locale, so the component is not remounted and cannot
 *     replay. That is what keeps signing in, signing up and signing out quiet:
 *     all three are `redirect()` out of a Server Action, which the App Router
 *     runs as a client navigation, never a load.
 *  2. `playedInThisDocument`, for the remounts that happen anyway — a locale
 *     switch rebuilds this subtree, and React may remount a component for its
 *     own reasons.
 *
 * Nothing here reads session or auth state, and nothing about the design, the
 * timings or the sound changed to arrange any of it.
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
 * The splash plays out in full either way — a tap reaches the app without
 * cutting the introduction short, so the two seconds are the same two seconds
 * every time. Nothing here is in the accessibility tree either (`aria-hidden`):
 * the mark and the wordmark are the product's name in picture form, in front of
 * a document whose title already says it, and a screen reader that announced
 * "Enzyme" here would be saying it twice before anyone had asked for it once.
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
 * ms the sound will wait for the browser to answer about audio.
 *
 * The picture never waits on this — the character sets off on the first frame
 * regardless. A permitted context opens `running` and answers immediately; a
 * `resume()` that arrives later still gets whichever landings are left, so the
 * budget runs to the last landing rather than stopping at the first. Past it
 * there is nothing left to play and the context is released.
 */
const AUDIO_GRACE_MS = LANDING_MS[LANDING_MS.length - 1] ?? 900;

/**
 * ms of slack on the fallback below.
 *
 * The overlay is normally removed by its own `animationend`. This is the other
 * path: a browser with animations disabled outright never fires one, and
 * without a floor under it the splash would be permanent for exactly the
 * readers least able to do anything about it.
 */
const FALLBACK_SLACK_MS = 400;

/**
 * Whether this document has already played the tile.
 *
 * A module variable rather than React state, a ref or a context, because the
 * lifetime wanted is precisely the module's: a fresh document evaluates the
 * chunk again and starts at `false`, while nothing the app does inside one
 * document can reset it. It is also read during render, before any provider
 * could have supplied it.
 */
let playedInThisDocument = false;

/**
 * The product's name in Latin letters, for every locale that is not Arabic.
 *
 * A literal rather than a lookup through `t('app.name')`, and deliberately: this
 * component is mounted above `NextIntlClientProvider` in the root layout — it
 * has to be, because it is a `position: fixed` tile that must outrank the whole
 * tree — so there is no translator in scope, and giving it one would mean moving
 * the tile down into the app for a string that is a *logo*. Wordmarks are not
 * translated copy; the Arabic side of this is a drawn path for the same reason.
 *
 * It matches `app.name` in `en.json`, and the two are expected to stay equal.
 */
const LATIN_WORDMARK = 'Enzyme';

/** The one locale whose name is drawn rather than typeset. */
const ARABIC_LOCALE = 'ar';

type SplashScreenProps = {
  /**
   * Which language's name goes under the mark.
   *
   * Passed in rather than read from context, for the reason `LATIN_WORDMARK`
   * gives. It changes the wordmark and nothing else — the hop, the travel, the
   * scale and the landing are identical in every locale.
   */
  locale: string;

  /**
   * Play even though this document has already played it.
   *
   * For `dev/splash` and nothing else: a harness whose whole purpose is to watch
   * the tile ten times cannot be subject to `playedInThisDocument`. It has no
   * bearing on `SplashLaunchGate`, which the harness does not go through — it
   * mounts this component directly.
   */
  replay?: boolean;
};

export function SplashScreen({ locale, replay = false }: SplashScreenProps) {
  const isArabic = locale === ARABIC_LOCALE;

  /*
    Asked during render, not from an effect.

    A remount that must not play has to return `null` before anything reaches
    the DOM — an effect could only remove the tile a frame late, and a frame of
    full-screen green is the whole thing being avoided. Hydration is safe
    because the flag is still `false` during a document's first render pass: it
    is armed from the effect below, and effects run after render.
  */
  const [present, setPresent] = useState(() => replay || !playedInThisDocument);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    /*
      This playing is the document's one playing. Set before anything below can
      bail out, so a remount is suppressed even if the sound or the animation
      never got going.
    */
    playedInThisDocument = true;

    /*
      How far into the splash we already are.

      The animation starts when the browser paints the element; this effect runs
      when React hydrates, and on a cold load with a route still streaming those
      two can be several hundred milliseconds apart. Anything scheduled from
      "now" would be that much late — the blips would land after the hops that
      caused them, which is worse than silence.

      `getAnimations()` on the overlay itself returns its one CSS animation —
      the exit — whose `currentTime` counts from first paint and keeps counting
      through its 1620ms delay, so it is the browser's own answer to "how far
      in are we" for the splash's *whole* life. The hop cannot serve here: a
      finished animation with no fill drops out of `getAnimations()`, so past
      900ms it would read 0 and everything timed off it would think the splash
      had just begun. If the list is somehow empty this reads 0, which only
      errs toward scheduling sound that `schedule`'s late-tolerance filters.
    */
    const readElapsed = () => {
      const [exit] = overlay.getAnimations();
      return typeof exit?.currentTime === 'number' ? exit.currentTime : 0;
    };

    const elapsedMs = readElapsed();

    const landingsAfter = (from: number): PendingLanding[] =>
      LANDING_MS.map((at, index) => ({ index, delayMs: at - from }));

    /*
      The picture never waits for the sound.

      A browser will not start audio without a user gesture, and a cold load has
      not had one — so on the loads where the answer is no, there is nothing any
      of this can do and the splash is silent. The character sets off on the
      first frame either way; the question is asked alongside the animation, and
      the moment the answer is yes the blips are scheduled onto whichever
      landings are still ahead. An answer that arrives after the first landing
      simply plays the remaining two — a hop already made is not scored late.

      The wait runs to the last landing rather than a couple of frames, because
      with nothing paused there is no cost to keeping the question open: a
      resume that comes up at 700ms still catches the arrival.

      When there is no sound to wait for at all — reduced motion, or a browser
      with no `AudioContext` — `createSplashSound` returns null and none of
      this runs.
    */
    const sound = createSplashSound();

    void sound?.whenAudible(Math.max(0, AUDIO_GRACE_MS - elapsedMs)).then((audible) => {
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

    overlay.addEventListener('animationend', onAnimationEnd);

    /*
      A tile that was never painted is dismissed on the next tick instead. It has
      no exit to wait for — `display: none` runs no animation and so fires no
      `animationend` either — which makes this timeout the only thing that would
      ever take it out of the tree. A tick rather than a synchronous
      `setPresent(false)`, because a `setState` in an effect body is a cascading
      render.
    */
    const fallback = window.setTimeout(
      dismiss,
      Math.max(0, OUT_DELAY_MS + OUT_MS - elapsedMs) + FALLBACK_SLACK_MS,
    );

    return () => {
      overlay.removeEventListener('animationend', onAnimationEnd);
      window.clearTimeout(fallback);
      sound?.stop();
    };
  }, [replay]);

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
        <div className="q-splash-mark">
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
          The name, under the mark rather than beside it — and in the reader's
          own language, which is the one thing on this screen that is not the
          same in both.

          **Arabic gets the drawn wordmark.** `WORDMARK_VIEWBOX` is the lettering
          framed on its own ink — the lockup path, cropped rather than redrawn,
          so there is still one copy of these curves in the repository. The
          lockup itself is not used here: it sets the name *beside* the mark and
          reads right to left, which is a horizontal composition, and this screen
          is a vertical one.

          **English gets type.** The brand sheet draws one wordmark and it is the
          Arabic one, so there is no Latin path to crop; `.q-splash-word-type`
          sets the name in the product's own display face at the same size and in
          the same box. See that rule for what to change if a drawn Latin lockup
          is ever produced.

          Either way it holds its box from the first frame while it is still
          invisible, so the column below the mark is already the right height and
          the mark's landing spot does not move underneath it when the name
          arrives — and the two locales get a composition of identical size.
        */}
        {isArabic ? (
          <svg
            className="q-splash-word"
            viewBox={WORDMARK_VIEWBOX}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d={LOCKUP_WORDMARK_PATH} fill="var(--q-splash-figure)" />
          </svg>
        ) : (
          <div className="q-splash-word-type">{LATIN_WORDMARK}</div>
        )}
      </div>
    </div>
  );
}
