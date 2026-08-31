'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { getLocaleDirection, type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

import { useGuide } from './guide-context';
import type { GuideReactionName } from './guide-emotes';
import { GuideMascot } from './guide-mascot';
import { placeCard } from './place-card';
import { GUIDE_SECTION_ICONS, stepIsOptional, stepSide, type GuideStep } from './steps';
import { useGuideAnchor, type AnchorRect, type AnchorState } from './use-guide-anchor';

/**
 * Where the card stops being a floating panel and becomes a docked sheet.
 *
 * Two questions in one query, because either one alone gets a real device wrong.
 * **Width** (`64rem`, the `lg` the staff rail is locked at) rules out every
 * screen too narrow to hold a card beside a full-width dashboard panel. **Pointer**
 * rules out the tablets that are wide enough and still should not get one: an
 * iPad in landscape is 1024px, and a card floating beside the anchor there is a
 * card a thumb cannot reach without crossing the whole screen.
 *
 * A comma is `or` in a media query list, so a coarse pointer docks the card at
 * any width. That is the same test `globals.css` uses to turn popups into bottom
 * sheets — see the note above its `(pointer: coarse)` block — so the guide docks
 * on exactly the devices the rest of the app already treats as touch.
 */
const DOCKED_QUERY = '(width < 64rem), (pointer: coarse)';

function subscribeDocked(onChange: () => void) {
  const query = window.matchMedia(DOCKED_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function useIsDocked() {
  return useSyncExternalStore(
    subscribeDocked,
    () => window.matchMedia(DOCKED_QUERY).matches,
    /*
      `true` on the server, not `false`. The docked sheet is the layout that
      needs no measurement to be correct, so a first paint that guesses it is
      right on a phone and merely re-lays-out once on a desktop. Guessing the
      other way puts a floating card at an unmeasured position on the device
      least able to absorb the reflow.
    */
    () => true,
  );
}

/**
 * The mark's size, in pixels, as a floor and two ceilings.
 *
 * **Beside the card it is drawn at the card's own height**, so the two read as
 * one object: a character the height of the panel it is standing next to, not
 * an ornament stuck to its corner. The card's height is the honest number to
 * take, because it is the one thing about the card that already answers to this
 * step — it is as tall as this step's sentence made it.
 *
 * The floor is what the face needs to be legible at all: it is two ellipses,
 * and every expression the tour has is carried by how open, how tilted and how
 * high those two shapes are. At 40px the difference between a squint and a
 * stare was a pixel and a half, which is to say there was no difference.
 *
 * The beside ceiling is a guard rather than a preference — a card whose Arabic
 * sentence ran to six lines on a short screen should not put a 300px face next
 * to itself.
 *
 * Stacked above or below, the ceiling is much lower. A mark as tall as the card
 * *over* the card is two cards' worth of screen for one step, and on the phone
 * that is where the sheet is docked, that is most of the screen. Beside, the
 * height is shared with the card; stacked, it is spent on top of it.
 */
const MASCOT_MIN = 72;
const MASCOT_BESIDE_MAX = 200;
const MASCOT_STACKED_MAX = 88;

/**
 * The gap between the mark's box and the card's edge, in pixels.
 *
 * The two are the same height and sit side by side, so this is the only thing
 * keeping them from reading as one shape with a bite out of it. It is measured
 * between the *drawings*, not the boxes: the stylesheet adds the 12.1% of
 * transparent canvas `MascotFace` paints past its own edge on top of this, so
 * what lands on screen is this much clear space.
 */
const MASCOT_GAP = 24;

/**
 * How much of the drawn size lands outside the mark's own box, as a factor.
 *
 * `MascotFace` renders `(743 + 2 × 90) / 743` of the size it is given — the
 * padding it puts around the leaf so a tilt has somewhere to go. Written here
 * as the ratio rather than as a pixel count because the size is no longer
 * fixed, and used only to ask for enough room on the screen.
 */
const MASCOT_CANVAS = 923 / 743;

/**
 * Where the card is, and how big it turned out — the whole of what the card's
 * own geometry tells the rest of the render.
 *
 * `placeCard` answers the first half. The second is measured here rather than
 * derived, because the card's width is a clamp against the viewport and its
 * height depends on how long this step's sentence came out in this language;
 * {@link mascotPlacement} needs the height to size the mark and both to know
 * which side of the card has room for it.
 */
type CardPlacement = { top: number; left: number; width: number; height: number };

/** Which side of the card the mark stands on. Physical — see {@link mascotPlacement}. */
type MascotSide = 'above' | 'below' | 'left' | 'right';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Where the mark goes and how big it is drawn, or `null` where it does not go
 * at all.
 *
 * ## Not on a phone or a tablet
 *
 * `docked` is the whole answer there, and it is `null`: the sheet is as wide as
 * the screen, so there is no "beside" for a character to stand in, and the
 * edges above and below it are the ones the tour has deliberately left clear —
 * that is where the spotlight and the control the step is about are. A mark
 * stacked on a docked sheet is a mark covering either the thing being pointed
 * at or the notch.
 *
 * It is a companion to a floating card, in other words, and a device that never
 * floats the card never sees it. The card reads the same without it; nothing in
 * the tour is carried by the mascot, which is exactly why it can be dropped on
 * the layouts that have no room for it.
 *
 * ## Beside the card, wherever the screen allows it
 *
 * On whichever side has more room — a card pushed to the left of the screen
 * puts the mark on its right, because that is where the space is. Beside is the
 * placement worth having: the card is a column of text, so a character next to
 * it, at its height, reads as standing beside what it is saying, while one
 * above or below reads as another row of the card.
 *
 * The sides are **physical, not logical**, and that is on purpose. Every other
 * placement decision in this file mirrors for Arabic because it is about
 * reading order; this one is about which half of the screen is empty, and a
 * screen does not mirror. What does mirror is the fallback: above and below
 * align the mark to the card's inline-start, which is the corner its eyebrow and
 * its title begin at.
 *
 * The side is also what the mark *looks* at — `guideEmote` turns the eyes and
 * the head towards the card from whichever side it ends up on, and mirrors the
 * drawing outright on the one side where a turn of the eyes is not enough — so
 * this answer decides both where the character stands and which way it faces.
 *
 * A floating card with no room either side takes the last fallback: above it,
 * unless the card is itself near the top of the screen, in which case below.
 *
 * An unmeasured card (the first frame of a floating step) answers "above" at
 * the floor size and is never seen: the card is hidden until it has been
 * measured, and the mark is inside it.
 */
function mascotPlacement(
  docked: boolean,
  placement: CardPlacement | null,
): { side: MascotSide; size: number } | null {
  if (docked) return null;

  function stacked(side: MascotSide) {
    const height = placement?.height ?? MASCOT_MIN;
    return { side, size: clamp(height, MASCOT_MIN, MASCOT_STACKED_MAX) };
  }

  if (placement === null) return stacked('above');

  const size = clamp(placement.height, MASCOT_MIN, MASCOT_BESIDE_MAX);
  const needed = size * MASCOT_CANVAS + MASCOT_GAP + GUTTER;
  const roomLeft = placement.left;
  const roomRight = window.innerWidth - (placement.left + placement.width);

  if (roomLeft >= needed || roomRight >= needed) {
    return { side: roomRight >= roomLeft ? 'right' : 'left', size };
  }

  const above = stacked('above');
  return placement.top >= above.size * MASCOT_CANVAS + MASCOT_GAP + GUTTER ? above : stacked('below');
}

/** Keep-out margin against the edges of the screen, and around the spotlight. */
const GUTTER = 16;
const GAP = 12;

/**
 * How much roomier one side of the spotlight has to be before the docked card
 * moves to it. See the note where it is used.
 *
 * 48px is a touch target: below that the "roomier" side has not got enough extra
 * space to be worth crossing the screen for, so the difference is noise and the
 * card should stay where a thumb expects it.
 */
const DOCK_MARGIN = 48;

/**
 * Whether React has hydrated, which is the same question as "is there a
 * `document` to portal into".
 *
 * `useSyncExternalStore` with a subscription that never fires: the server
 * snapshot is `false` and the client snapshot is `true`, so the value flips
 * exactly once, on hydration, and never again. This is the shape `use-mobile.ts`
 * uses for the media queries and for the same reason — a `useEffect` that sets
 * state to seed its first real value is a cascading render, and this project's
 * lint rules reject it outright.
 */
const NEVER = () => () => {};

function useHydrated(): boolean {
  return useSyncExternalStore(
    NEVER,
    () => true,
    () => false,
  );
}

/**
 * The tour's one piece of chrome: a dimmed screen with a hole in it, and a card
 * that says what is in the hole.
 *
 * ## What draws the dim
 *
 * A single `box-shadow` with a spread larger than any viewport, cast by the
 * spotlight box itself. The alternative — four rectangles fitted around the hole
 * — is four elements to keep in step through a scroll, and it seams visibly at
 * the corners on fractional device pixel ratios. One box has no corners to seam.
 *
 * It also means the hole is genuinely transparent rather than a lightened patch,
 * so the control under it is drawn at its real contrast. That is the entire
 * point of pointing at real screens instead of pictures of them.
 *
 * ## What is unreachable while it is up
 *
 * Everything. The shell is marked `inert` for as long as the tour runs, which
 * takes the page out of the tab order and stops every pointer event on it —
 * including on the control in the spotlight. The guide points; it does not press
 * (see `steps.ts`), and a highlighted button that *looks* pressable but has been
 * lit up as an illustration is worse than one that plainly is not.
 *
 * ⚠ `inert` also removes the page from the accessibility tree, so a screen
 * reader cannot read the highlighted control while the card is describing it.
 * The card is written to be self-sufficient for that reason: each step names its
 * control in words rather than saying "this button".
 */
export function GuideOverlay() {
  const guide = useGuide();
  const hydrated = useHydrated();

  /*
    The shell goes inert for the life of the tour.

    Set imperatively on a node found by class rather than through a prop, because
    the element that has to go inert is `AppShell`'s outer box — the rail and the
    page together — and that component is shared with the portal, which has no
    tour to go inert for. Reaching for it here keeps the knowledge in the feature
    that needs it.
  */
  const active = guide?.active ?? false;
  useEffect(() => {
    if (!active) return;
    const shell = document.querySelector<HTMLElement>('.q-app-shell');
    if (shell === null) return;
    shell.inert = true;

    return () => {
      shell.inert = false;

      /*
        Focus goes back to the rail row that opened the tour.

        Closing sends focus to `<body>` otherwise — the card it was on has just
        unmounted — which leaves a keyboard user at the top of the document with
        the whole app to tab back through. `ClientFormTrigger` restores focus for
        the same reason and records it in the same terms.

        The launcher is found by attribute rather than remembered from
        `document.activeElement`: child effects run before parent ones, so by the
        time this effect first ran the card had already taken focus, and what it
        would have captured is the card. Ordering matters in the cleanup too —
        the shell has to stop being inert before anything inside it can be
        focused.

        `preventScroll` because the last step is at the dish catalog and the rail
        is `fixed`; scrolling to it would jump a page the reader is done with.
      */
      document
        .querySelector<HTMLElement>('[data-guide-launcher]')
        ?.focus({ preventScroll: true });
    };
  }, [active]);

  /* Escape closes, as it does on every other modal surface in the app. */
  const stop = guide?.stop;
  useEffect(() => {
    if (!active || stop === undefined) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        stop?.();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, stop]);

  if (!hydrated || guide === null || guide.step === null) return null;

  return createPortal(<GuideSurface step={guide.step} />, document.body);
}

function GuideSurface({ step }: { step: GuideStep }) {
  const guide = useGuide();
  const locale = useLocale() as Locale;
  const dir = getLocaleDirection(locale);
  const docked = useIsDocked();
  const anchor = useGuideAnchor(step.anchor, step.id, true, stepIsOptional(step));

  if (guide === null) return null;

  /*
    The status is not consulted: whether there is a hole to draw is exactly the
    question of whether there is a rect, and `useGuideAnchor` already decides
    that for all four of its states — including carrying the previous step's box
    through the search for the next one. See the note on its return.
  */
  const rect = anchor.rect;

  return (
    /*
      `z-50`, the same rank `Sheet` takes. It is above the rail (`z-10`) and the
      page, and below nothing that matters: the app's dialogs are native
      `<dialog>` elements drawn in the top layer, which no z-index can reach — so
      a dialog opened before the tour started still covers it, correctly.

      `fixed inset-0` with no pointer handler of its own. It has to catch events
      so that a click on the dim goes nowhere, and it must not close on that
      click: the whole surface is dim except a hole the reader is being asked to
      look at, and dismissing a tour by clicking near the thing it is pointing at
      is a trap. Escape and the close button are the ways out.
    */
    <div
      className="fixed inset-0 z-50 q-guide-surface"
      /*
        Announced as a dialog rather than left as decoration: the page behind is
        inert, so this genuinely is the only thing on screen.
      */
      role="dialog"
      aria-modal="true"
      aria-labelledby="q-guide-title"
      dir={dir}
    >
      {rect === null ? (
        /*
          No anchor, or none found — an unanchored step, or a screen whose
          element never appeared (an empty register has no table). The dim is
          drawn as a plain sheet and the card is centred on it. The step still
          reads: its words are about the section, not about a rectangle.
        */
        <div className="absolute inset-0 bg-[var(--overlay)]" aria-hidden />
      ) : (
        /*
          `anchor` whole rather than `rect`, because the hole does not render
          from the settled box — it subscribes to the live one. See `Spotlight`.
        */
        <Spotlight anchor={anchor} stepId={step.id} />
      )}

      <GuideCard
        step={step}
        rect={rect}
        anchorStatus={anchor.status}
        docked={docked}
        dir={dir}
        index={guide.index}
        total={guide.total}
        onNext={guide.next}
        onPrevious={guide.previous}
        onStop={guide.stop}
      />
    </div>
  );
}

/** How long the hole takes to travel from one step's control to the next. */
const TRAVEL_MS = 380;

/**
 * The curve the rest of the app moves on, taken from the stylesheet rather than
 * copied into this file.
 *
 * `element.animate` wants a string and cannot resolve a custom property itself,
 * so the choice is between reading the token here and pinning `cubic-bezier(...)`
 * at this call site. Pinning it is how the guide ends up on a curve the rest of
 * the app has since moved off — the same failure the design system's rule about
 * not writing a colour at a call site is about. `--ease-sweep` is defined on
 * `:root`, so any node in the document inherits it.
 *
 * The fallback is only reached if the stylesheet has not applied at all, which
 * on a document that has already painted the dimmed overlay it has.
 */
function travelEasing(node: Element): string {
  const token = getComputedStyle(node).getPropertyValue('--ease-sweep').trim();
  return token === '' ? 'ease-out' : token;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function geometry(rect: AnchorRect): Record<string, string> {
  return {
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  };
}

function writeGeometry(node: HTMLElement, rect: AnchorRect): void {
  const style = geometry(rect);
  for (const [property, value] of Object.entries(style)) {
    node.style.setProperty(property, value);
  }
}

/**
 * The hole, and the dim that is cast by it.
 *
 * ## It does not render its own position
 *
 * The box is written onto this node from `useGuideAnchor`'s live channel, in the
 * measurement loop's own frame. React renders this component once per step and
 * then has nothing further to do with where the hole is.
 *
 * That is not a micro-optimisation, it is the fix for the shaking on steps 9 and
 * 10. Positioning through `useState` meant a full reconcile, commit and repaint
 * of the overlay on every frame of every scroll — and the thing being repainted
 * is `120vmax` of `box-shadow`, whose cost scales with the size of the hole. The
 * calendar toolbar and the calendar grid are the two largest anchors in the
 * tour, so they were the two that pushed a phone past its frame budget, and a
 * hole that misses its frame is a hole that is somewhere else than the control
 * it is cut around. The note on `SETTLE_MS` records the same finding from the
 * hook's side.
 *
 * ## Travel, and when it is suspended
 *
 * Between steps the hole moves from the old control to the new one instead of
 * cutting, which is what makes the tour read as one continuous surface rather
 * than sixteen unrelated dims. `stepId` is what tells this component that the
 * next box it is handed belongs somewhere else.
 *
 * While that travel plays, live measurements are **held, not applied** — the
 * newest is kept and written the moment the animation finishes. Applying them
 * mid-flight is the one thing that would reintroduce the fault this component
 * was rewritten to remove: two authorities writing the same four properties on
 * alternating frames is, precisely, a shake.
 *
 * Within a step there is no travel at all. The box is re-read every frame, so it
 * already moves at the refresh rate of whatever is moving it; a tween on top of
 * that would make the hole lag its own control through the scroll that brings it
 * into view.
 */
function Spotlight({ anchor, stepId }: { anchor: AnchorState; stepId: string }) {
  const node = useRef<HTMLDivElement>(null);
  const { subscribe, peek } = anchor;

  useEffect(() => {
    const element = node.current;
    if (element === null) return;

    /*
      The box this step is travelling *from*: whatever is on screen right now.
      Read off the node rather than remembered in a ref, because on the first
      step there is nothing to remember and the node's own inline style is the
      single honest answer in both cases.
    */
    const from = element.style.top === '' ? null : element.getBoundingClientRect();

    let travel: Animation | null = null;
    /** The newest measurement that arrived while `travel` was playing. */
    let held: AnchorRect | null = null;
    let arrived = false;

    function apply(rect: AnchorRect | null): void {
      const element = node.current;
      if (element === null || rect === null) return;

      /* Mid-flight: keep the newest and let the animation land on it. */
      if (travel !== null) {
        held = rect;
        return;
      }

      /*
        The first box of a new step is the one worth travelling to. Everything
        after it is this step's control moving under a live measurement, which
        is tracked rather than tweened.
      */
      if (!arrived) {
        arrived = true;

        if (from !== null && !prefersReducedMotion()) {
          travel = element.animate([geometry(from), geometry(rect)], {
            duration: TRAVEL_MS,
            easing: travelEasing(element),
          });

          /*
            The final box is written by hand rather than left to `fill:
            'forwards'`. A filling animation keeps overriding the inline style
            for as long as it exists, so every live measurement after this one
            would be computed correctly and then drawn at the stale value — the
            hole silently unsticking itself from its control the moment the
            control moved.
          */
          travel.onfinish = () => {
            travel = null;
            const latest = held ?? rect;
            held = null;
            writeGeometry(element, latest);
          };

          /*
            `oncancel` as well as `onfinish`: an animation is cancelled when the
            node is torn down mid-travel, and a handler that only ran on finish
            would leave `travel` non-null forever on a step the reader skipped
            through. Nothing to write here — the node is going away.
          */
          travel.oncancel = () => {
            travel = null;
          };

          return;
        }
      }

      writeGeometry(element, rect);
    }

    /*
      First mount only: catch up with a loop that may already have measured, so
      the hole is never drawn at the browser's default corner while waiting for
      the next frame.

      Written straight to the node rather than through `apply`, and the
      difference matters on every step after the first. Child effects run before
      parent ones, so at the moment this runs the hook above has not yet started
      the new step's search and `peek` still answers with the *previous* step's
      box. Feeding that to `apply` would spend this step's one arrival on the
      place the hole is already sitting, and the travel would be a 380ms
      animation from a box to itself — after which the real anchor would simply
      appear, which is the cut this was built to remove.

      When `from` is non-null the node is already displaying that same box
      anyway, so there is nothing to catch up on and skipping it costs nothing.
    */
    if (from === null) {
      const initial = peek();
      if (initial !== null) writeGeometry(element, initial);
    }

    const unsubscribe = subscribe(apply);

    return () => {
      unsubscribe();
      travel?.cancel();
    };
  }, [subscribe, peek, stepId]);

  return <div ref={node} aria-hidden className="q-guide-spotlight absolute" />;
}

function GuideCard({
  step,
  rect,
  anchorStatus,
  docked,
  dir,
  index,
  total,
  onNext,
  onPrevious,
  onStop,
}: {
  step: GuideStep;
  rect: AnchorRect | null;
  anchorStatus: AnchorState['status'];
  docked: boolean;
  dir: 'ltr' | 'rtl';
  index: number;
  total: number;
  onNext: () => void;
  onPrevious: () => void;
  onStop: () => void;
}) {
  const t = useTranslations('userGuide');
  const card = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<CardPlacement | null>(null);

  /*
    What the character is reacting to, and who decides it.

    Two sources, and they are not the same kind of thing. A **reaction** is
    something the reader did — a press, a pointer resting on a control — and it
    is stored, because the event is a moment and the face has to keep showing it
    after the moment has passed. `GuideMascot` owns how long that lasts and
    calls back when it is over.

    An **ambient** reaction is a condition rather than an event: the anchor for
    this step has not been found, or is not going to be. That one is read
    straight off `anchorStatus` every render — there is nothing to remember,
    because the condition itself is the memory, and it clears when the anchor
    resolves rather than on a timer.

    A press wins over a condition while it lasts: the reader doing something is
    always more current than the state of the search.
  */
  const [reaction, setReaction] = useState<GuideReactionName | null>(null);
  const clearReaction = useCallback(() => setReaction(null), []);

  /*
    `waiting` is every step's first frame, so it cannot raise `hunting` on its
    own — the mark would twitch into a search at the top of all sixteen steps,
    on top of the expression that step just started. It has to have *lasted*,
    and the only steps where it does are the ones that cross a route.

    The state is set from a timer rather than during render, and the cleanup
    puts it back: React skips a re-render when the value is unchanged, so
    clearing it on every status that is not `waiting` costs nothing.
  */
  const [huntingSince, setHuntingSince] = useState<string | null>(null);
  useEffect(() => {
    if (anchorStatus !== 'waiting') return;

    const timer = window.setTimeout(() => setHuntingSince(step.id), 700);
    return () => {
      window.clearTimeout(timer);
      setHuntingSince(null);
    };
  }, [anchorStatus, step.id]);

  const ambient: GuideReactionName | null =
    anchorStatus === 'missing' ? 'puzzled' : huntingSince === step.id ? 'hunting' : null;

  const isFirst = index === 0;
  const isLast = index === total - 1;

  /*
    Focus moves to the card on every step.

    On the card itself rather than on its Next button: the title and body are
    what changed, and a screen reader that lands on "Next" has been handed the
    control without the sentence explaining it. `tabIndex={-1}` makes the panel
    focusable without putting it in the tab order twice.
  */
  useEffect(() => {
    card.current?.focus({ preventScroll: true });
  }, [step.id]);

  /*
    Placement is measured, not guessed, because the card's height depends on how
    long the step's sentence turned out to be in this language — and Arabic and
    English do not agree about that often enough to hard-code a number.

    `useLayoutEffect` so the card is positioned in the same frame it is measured
    in; with `useEffect` the first paint of every step puts it at the top-left
    corner and moves it a frame later, which reads as a flinch.
  */
  useLayoutEffect(() => {
    /*
      Nothing to measure while docked: the sheet's geometry is entirely in
      `globals.css`. The stale placement left behind is never read — the `style`
      below is only applied in the floating layout — and leaving it alone is
      also what keeps this effect free of a synchronous `setState`.
    */
    if (docked) return;

    const element = card.current;
    if (element === null) return;

    const box = element.getBoundingClientRect();
    setPlacement({
      ...placeCard({
        anchor: rect,
        card: { width: box.width, height: box.height },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        side: stepSide(step),
        dir,
        gutter: GUTTER,
        gap: GAP,
      }),
      width: box.width,
      height: box.height,
    });
  }, [rect, docked, dir, step]);

  /*
    Docked: which edge.

    The sheet takes the edge the spotlight is furthest from, so it never covers
    the thing the step is about. An unanchored step has no preference and takes
    the bottom, where a thumb is.

    ## Why there are two thresholds and not one

    There used to be one, at `0.55`, and on the calendar steps it sat almost
    exactly under the answer. Both of those anchors are close to viewport-sized
    once `pad` has clamped them — the toolbar spans the full width, the grid
    spans nearly the whole screen — so the centre of the hole lands within a
    percent or two of the middle, which is within a percent or two of the line.

    A single threshold there is a coin balanced on its edge, and a phone is
    exactly the device that keeps nudging it: hiding the URL bar changes
    `innerHeight`, the grid re-lays-out against the new height, the centre of the
    hole crosses the line, and the card jumps from one edge of the screen to the
    other — replaying its entrance animation on the way. That is a layout jump
    with the same cause as the shake and it deserves the same treatment.

    So the question changed instead of gaining a memory. Hysteresis was the first
    answer and it is not available here: remembering the last decision means
    either a ref read back during render or a `setState` in an effect, and this
    project's lint rules reject both — correctly, and the second of them is the
    cascading render `useGuideAnchor` was just rewritten to stop paying.

    What is asked now is the thing the card actually needs to know — **which side
    has room for it** — rather than a proxy for it, and it has to win by
    {@link DOCK_MARGIN} to count. Two properties fall out of that. A hole with
    nothing above it and half the screen below can never be a close call, so the
    ordinary steps answer the same way they always did. And a hole so large that
    neither side has room answers `false` and keeps answering `false`, because
    two numbers that are both nearly zero cannot differ by 48px — which is
    exactly the calendar case, now settled rather than balanced.

    Bottom is the right way to fail: it is where a thumb is, and it is what an
    unanchored step takes for the same reason.
  */
  const spaceAbove = rect === null ? 0 : rect.top;
  const spaceBelow = rect === null ? 0 : window.innerHeight - (rect.top + rect.height);
  const dockTop = rect !== null && spaceAbove > spaceBelow + DOCK_MARGIN;

  /* Beside the card, at its height — and nowhere at all when docked. */
  const mascot = mascotPlacement(docked, placement);

  return (
    <div
      ref={card}
      tabIndex={-1}
      className={cn(
        'q-guide-card',
        /*
          Docked, the card's whole geometry — both inline edges, the safe-area
          gutter, the centring and the reading-width ceiling — is in
          `globals.css`, because `env()` cannot be written as a utility. Only
          `fixed` is said here.
        */
        docked
          ? cn('fixed', dockTop ? 'q-guide-card-top' : 'q-guide-card-bottom')
          : 'absolute w-[min(22rem,calc(100vw-2rem))]',
        /*
          Hidden until measured, and only in the floating layout — the docked
          sheet is positioned by CSS and has nothing to wait for. Without this
          the first frame of every floating step is drawn at the corner the
          browser defaults to.
        */
        !docked && placement === null && 'invisible',
      )}
      style={docked ? undefined : { top: placement?.top ?? 0, left: placement?.left ?? 0 }}
    >
      {/*
        The mark, standing on the outside of the card.

        It is the product's own logo — the same leaf `BrandMark` draws, with its
        two seeds moving as eyes — and the tour is the one place in the staff app
        it is anything other than still. A first run is when a character earns
        its keep: sixteen dimmed screens in a row is a procedure, and a face that
        reacts to each one is a walkthrough. Each step has its own expression, in
        `guide-emotes.ts`, and the eyes and the head are all that move.

        ## Outside the card, and outside the keyed block

        Both of those are deliberate, and the second is what makes the tour read
        as one character rather than sixteen.

        The contents below are replaced whole on every step (`key={step.id}`), so
        anything inside them is *destroyed and rebuilt* — a mascot in there
        starts each step from a standing start, playing its opening beat from the
        drawing's resting geometry with a fade under it. Out here it is the same
        element from the first step to the last: when the expression changes, the
        eyes and the head travel from the pose they are holding to the new one,
        on the transitions `MascotFace` already puts on them. Nothing cuts.

        Hanging it outside the card's box is the other half. Inside, it was
        another line of the card's contents, competing with the eyebrow and the
        title for the top of a panel that is mostly words. Out here it is a
        character standing next to what it is saying — and the card keeps the
        whole of its own width for the sentence.

        Decorative, and it says so twice: `MascotFace` marks its own SVG
        `role="presentation"`, and this box carries nothing to read. The eyebrow,
        the title and the sentence are the entire content of the card, which is
        what keeps a screen reader's account of a step identical to a sighted
        reader's.
      */}
      {mascot === null ? null : (
        <GuideMascot
          stepId={step.id}
          side={mascot.side}
          size={mascot.size}
          reaction={reaction ?? ambient}
          onReactionEnd={clearReaction}
        />
      )}

      {/*
        The step's own contents, remounted on every step so their entrance
        replays.

        `key={step.id}` rather than a transition on the text, because what
        changes between two steps is every line of the card at once — eyebrow,
        title, sentence, and which of Back and Skip are present. Cross-fading
        four independently-changing nodes reads as four things twitching;
        replacing the block once reads as a page being turned.

        It is a wrapper rather than a class on the card itself for the same
        reason the card is not keyed: keying the card would throw away the
        measured `placement` on every step and flash it `invisible` at the
        corner before re-measuring. The shell stays, the contents turn over.
      */}
      <div key={step.id} className="q-guide-card-step">
        {/*
          Section, then position, on one line.

          The count used to sit in the controls row on its own, which is the row
          that now has to hold Skip as well as Back and Next — three controls and a
          sentence do not fit across a 375px phone. Up here it reads as what it is:
          a qualifier on the section name, the way a page number qualifies a
          chapter. `aria-live` so a screen reader is told the position changed
          without the whole card being re-read.
        */}
        <p
          className="flex items-center gap-1.5 text-caption font-medium text-muted-foreground"
          aria-live="polite"
        >
          <Icon name={GUIDE_SECTION_ICONS[step.section]} className="size-4 shrink-0" />
          <span className="min-w-0 truncate">{t(`sections.${step.section}`)}</span>
          <span aria-hidden className="shrink-0 opacity-60">
            ·
          </span>
          <span className="shrink-0 tabular-nums">{t('progress', { current: index + 1, total })}</span>
        </p>

        <h2 id="q-guide-title" className="mt-1 font-heading text-heading-sm font-semibold [text-wrap:balance]">
          {t(`steps.${step.id}.title`)}
        </h2>

        {/*
          The body is the one part of the card allowed to scroll, and the reason
          it is the *body* rather than the card is the row underneath it.

          A step's sentence is two or three lines on a desktop and can be six on a
          375px phone in Arabic, at which point a short screen in landscape cannot
          hold the whole card. Scrolling the card would take Next and the close
          button off the bottom of it — the two controls that must never be more
          than one look away, because on a touch screen there is no Escape key to
          fall back on. Scrolling only the prose keeps the eyebrow, the title, the
          progress line and both controls where they were.

          `overscroll-contain` so reaching the end of a long step does not hand the
          gesture to the inert page behind it.
        */}
        <p className="mt-1.5 max-h-[38svh] overflow-y-auto overscroll-contain text-body-sm leading-relaxed text-muted-foreground">
          {t(`steps.${step.id}.body`)}
        </p>

        {/*
          Leaving on one side, moving on the other.

          **Skip is a labelled button, not the X this corner used to carry.** The
          two were the same action wearing two looks — a glyph in the corner and
          the Escape key — and neither said what it did. A tour is something a
          reader has agreed to be led through, so the way out of it has to be as
          plainly readable as the way onward; a bare ✕ on a panel that is already
          covering the whole screen reads as "close this card", not "stop the
          guide". Escape still does the same thing for anyone who reaches for it.

          It stands down on the last step, where Finish is the same action with a
          better name.
        */}
        <div className="mt-4 flex items-center justify-between gap-2">
          {isLast ? (
            <span />
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ms-3 text-muted-foreground"
              onClick={onStop}
              onPointerEnter={() => setReaction('warned')}
              onFocus={() => setReaction('warned')}
            >
              {t('skip')}
            </Button>
          )}

          <div className="flex shrink-0 items-center gap-2">
            {/*
              Back is omitted on the first step rather than disabled. A control
              that exists only to be unusable is a control the reader has to
              examine before ignoring, and this row is already three wide.
            */}
            {isFirst ? null : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setReaction('returning');
                  onPrevious();
                }}
              >
                {t('back')}
              </Button>
            )}

            {/*
              The two controls the face answers to.

              `onPointerEnter`/`onFocus` rather than `onMouseOver`: the second
              is what makes the mark react to a keyboard reader as well, who
              never hovers anything. Both are advisory — a reaction is a face,
              not a state change — so neither does anything a reader could be
              stuck in.
            */}
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setReaction('advancing');
                (isLast ? onStop : onNext)();
              }}
              onPointerEnter={() => setReaction('offered')}
              onFocus={() => setReaction('offered')}
            >
              {isLast ? t('finish') : t('next')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
