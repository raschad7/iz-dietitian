'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The box the spotlight cuts, in viewport coordinates.
 *
 * Viewport rather than document coordinates because the overlay is `fixed`:
 * both are measured against the same origin, so the hole stays over its element
 * through a scroll without either of them having to know the scroll offset.
 */
export type AnchorRect = { top: number; left: number; width: number; height: number };

export type AnchorStatus =
  /** The step declares no anchor. The card is drawn centred, with no hole. */
  | 'none'
  /**
   * Looking for the element — the screen may still be loading.
   *
   * `rect` is not necessarily `null` here: while the search runs, the *previous*
   * step's box is carried through, so the hole stays where it was instead of the
   * screen going flat for a frame between every pair of steps. See the note on
   * the return below.
   */
  | 'waiting'
  /** Found and measured. */
  | 'found'
  /** Gave up. The card is drawn centred, with its text intact. */
  | 'missing';

export type AnchorState = { status: AnchorStatus; rect: AnchorRect | null };

/**
 * What the frame loop has settled on for one step.
 *
 * `stepId` travels with the rect so a result from the step before can never be
 * read as this one's — the loop is asynchronous and the tour can advance out
 * from under it. A `null` rect is the loop having given up; see
 * {@link ANCHOR_TIMEOUT_MS}.
 */
type Resolution = { stepId: string; rect: AnchorRect | null };

/**
 * How long to wait for an anchor before drawing the step without one.
 *
 * The wait exists because a step and its screen do not arrive together: the
 * overlay pushes a route, Next fetches it, and the element the step points at
 * appears some hundreds of milliseconds later. Three seconds is long enough for
 * a cold server component on a slow connection and short enough that a genuinely
 * absent anchor does not read as a hang.
 *
 * A step marked `optional` in `steps.ts` waits a third of that. Those are the
 * anchors that belong to states a clinic may simply not be in — an empty
 * register draws no table, a clinic with no plans yet has no suggested clients —
 * so the likeliest reason one has not appeared is that it never will, and three
 * seconds of dimmed screen is the wrong price for finding that out.
 */
const ANCHOR_TIMEOUT_MS = 3000;
const OPTIONAL_ANCHOR_TIMEOUT_MS = 1000;

/**
 * How often the timer behind the frame loop measures anyway.
 *
 * Slow enough to cost nothing while the frame loop is doing the real work, fast
 * enough that a screen which never animates still gets its spotlight promptly.
 * See the note at the call site for why a second clock exists at all.
 */
const ANCHOR_BACKSTOP_MS = 250;

/** Below this, a rect change is layout noise rather than movement worth a render. */
const RECT_EPSILON = 0.5;

/**
 * Padding drawn around the anchor, so the hole frames the control rather than
 * cropping it. Also what keeps a focus ring or a shadow inside the light.
 */
const SPOTLIGHT_PADDING = 8;

function pad(rect: DOMRect): AnchorRect {
  /*
    Clamped to the viewport. A control scrolled half off the top of its own
    scroller would otherwise be given a hole with a negative origin, and the
    `box-shadow` that draws the dim would leave a bright band along that edge.
  */
  const top = Math.max(0, rect.top - SPOTLIGHT_PADDING);
  const left = Math.max(0, rect.left - SPOTLIGHT_PADDING);
  const right = Math.min(window.innerWidth, rect.right + SPOTLIGHT_PADDING);
  const bottom = Math.min(window.innerHeight, rect.bottom + SPOTLIGHT_PADDING);

  return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

function same(a: AnchorRect | null, b: AnchorRect | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    Math.abs(a.top - b.top) < RECT_EPSILON &&
    Math.abs(a.left - b.left) < RECT_EPSILON &&
    Math.abs(a.width - b.width) < RECT_EPSILON &&
    Math.abs(a.height - b.height) < RECT_EPSILON
  );
}

/**
 * Finds the element a step points at, keeps its rectangle current, and says so
 * when there is nothing to find.
 *
 * ## Why it watches rather than measures once
 *
 * Everything the tour points at can move after it has been found. The route it
 * just pushed is still streaming in; the element is scrolled into view on a
 * smooth animation that takes a few hundred milliseconds; a phone rotates; the
 * dashboard's requests card grows a row when a request arrives while the guide
 * is open. A hole measured once ends up beside its control in all four cases.
 *
 * So the rect is read on an animation frame for as long as the step is showing.
 * That sounds expensive and is not: `getBoundingClientRect` on one element is
 * cheap, the loop exists only while a modal overlay is up, and state is set only
 * when the box has actually moved — see {@link RECT_EPSILON}, which is what
 * stops sub-pixel jitter from re-rendering the overlay sixty times a second.
 *
 * A `MutationObserver` would answer "has it appeared yet" but not "where is it
 * now", and a `ResizeObserver` answers neither for an element moved by an
 * ancestor's scroll. One frame loop answers all of it.
 *
 * ## Why "waiting" and "none" are not stored
 *
 * Only one of the four states is a *finding*: `found`, and its near neighbour
 * `missing`, which is the loop reporting that it stopped looking. The other two
 * are restatements of the arguments — a closed tour is `none`, and a step whose
 * result has not arrived yet is `waiting` — so they are derived at render rather
 * than written into state by an effect.
 *
 * That is not only tidiness. Seeding them from the effect meant `setState` in an
 * effect body, which this project's lint rules reject outright and React
 * charges a cascading render for; and it left a window, between the step
 * changing and the effect running, in which the hook returned the *previous*
 * step's rect. Keying the stored result by `stepId` closes that window
 * structurally: a result that is not this step's simply reads as `waiting`.
 *
 * @param anchor `data-guide` value to look for, or `null` for an unanchored step.
 * @param stepId Restarts the search when the tour advances.
 * @param active Whether the tour is running at all.
 * @param optional Shortens the wait — see {@link OPTIONAL_ANCHOR_TIMEOUT_MS}.
 */
export function useGuideAnchor(
  anchor: string | null,
  stepId: string,
  active: boolean,
  optional: boolean,
): AnchorState {
  const [resolution, setResolution] = useState<Resolution | null>(null);

  /*
    The last rect handed to React, kept in a ref so the frame loop can compare
    against it without listing it as a dependency and restarting itself.
  */
  const lastRect = useRef<AnchorRect | null>(null);

  useEffect(() => {
    if (!active || anchor === null) return;

    lastRect.current = null;

    let frame = 0;
    let cancelled = false;
    /** Set once, so a slow screen does not get scrolled to twice. */
    let scrolled = false;
    const startedAt = performance.now();
    const budget = optional ? OPTIONAL_ANCHOR_TIMEOUT_MS : ANCHOR_TIMEOUT_MS;

    /**
     * One measurement. Returns whether there is any point taking another.
     *
     * Deliberately free of scheduling, because two different clocks call it —
     * see below. It is idempotent: it re-reads the element and writes state only
     * when the box has actually moved, so being called twice in a frame costs a
     * `getBoundingClientRect` and nothing else.
     */
    function measure(): boolean {
      const element = document.querySelector<HTMLElement>(`[data-guide="${anchor}"]`);

      if (element === null) {
        /*
          Not found yet. Keep looking until the budget runs out, then draw the
          step centred rather than stalling on it — see `optional` in `steps.ts`.
        */
        if (performance.now() - startedAt > budget) {
          lastRect.current = null;
          setResolution({ stepId, rect: null });
          return false;
        }
        return true;
      }

      if (!scrolled) {
        scrolled = true;
        /*
          `center` on both axes, and `nearest` would not do: an element already
          technically visible at the very bottom of the viewport is one the card
          is about to sit on top of. Centring gives the card somewhere to go on
          either side of it.
        */
        element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
      }

      const raw = element.getBoundingClientRect();

      /*
        A zero-area element is in the DOM but not laid out — inside a
        `display: none` branch, most often, which is what a rail collapsed at
        the current width looks like from here. Keep waiting rather than cutting
        a hole where it is not.

        ⚠ The test is on the **raw** rect, not the padded one, and that is the
        whole point of doing it before `pad`. Padding adds 8px a side, so a 0×0
        element clamped at the origin comes out of `pad` as an 8×8 box that
        passes any "has area" test — an 8px hole in the corner of the screen,
        with the card politely pointing at it.
      */
      if (raw.width <= 0 || raw.height <= 0) return true;

      const rect = pad(raw);

      if (!same(lastRect.current, rect)) {
        lastRect.current = rect;
        setResolution({ stepId, rect });
      }

      return true;
    }

    function frameTick() {
      if (cancelled) return;
      if (!measure()) return;
      frame = requestAnimationFrame(frameTick);
    }

    frame = requestAnimationFrame(frameTick);

    /*
      A second, slower clock behind the frame loop — and it is not belt and
      braces, it is the only one guaranteed to tick.

      `requestAnimationFrame` fires only when the document is producing frames,
      and there are ordinary reasons it stops: a backgrounded tab, a phone
      saving power, a window the compositor has decided is not visible. On a
      document whose timeline was frozen this way the tour mounted correctly and
      then sat there forever with no spotlight, because the *only* thing that
      ever measured an anchor was the frame loop. Every step degraded to a
      centred card with no hole.

      Timers are throttled in those conditions rather than stopped, so a 250ms
      interval still lands. The frame loop keeps the hole glued to its control
      while the screen is live; this keeps the feature working when it is not.
    */
    const backstop = window.setInterval(() => {
      if (cancelled) return;
      if (!measure()) window.clearInterval(backstop);
    }, ANCHOR_BACKSTOP_MS);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.clearInterval(backstop);
    };
  }, [anchor, stepId, active, optional]);

  if (!active || anchor === null) return { status: 'none', rect: null };

  /*
    Nothing settled yet, or what settled belongs to the step before this one —
    and in that second case the previous step's box is handed back rather than
    dropped.

    That retention is the difference between a hole that travels from one control
    to the next and a screen that goes flat for a frame in between. Advancing a
    step always costs at least one render where the new anchor has not been
    measured yet; without this, every one of the sixteen steps opened with a
    blink of undifferentiated dim, and the two that cross a route opened with a
    long one.

    It is safe to draw a stale hole because it is never a stale *promise*: the
    card beside it has already changed to the new step's words, and the box
    catches up within a frame on the same screen, or as soon as the next screen
    paints.
  */
  if (resolution === null) return { status: 'waiting', rect: null };
  if (resolution.stepId !== stepId) return { status: 'waiting', rect: resolution.rect };
  if (resolution.rect === null) return { status: 'missing', rect: null };
  return { status: 'found', rect: resolution.rect };
}
