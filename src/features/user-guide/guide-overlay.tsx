'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { getLocaleDirection, type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

import { useGuide } from './guide-context';
import { placeCard } from './place-card';
import { GUIDE_SECTION_ICONS, stepIsOptional, stepSide, type GuideStep } from './steps';
import { useGuideAnchor, type AnchorRect } from './use-guide-anchor';

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

/** Keep-out margin against the edges of the screen, and around the spotlight. */
const GUTTER = 16;
const GAP = 12;

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
        <Spotlight rect={rect} />
      )}

      <GuideCard
        step={step}
        rect={rect}
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

/**
 * The hole, and the dim that is cast by it.
 *
 * No transition on its position. The rect it is given is re-read every animation
 * frame while the step is up (see `useGuideAnchor`), so the box already moves at
 * the refresh rate of the thing it is tracking — a transition on top of that
 * would make the hole lag behind its own control during the scroll that brings
 * it into view.
 */
function Spotlight({ rect }: { rect: AnchorRect }) {
  return (
    <div
      aria-hidden
      className="q-guide-spotlight absolute"
      style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
    />
  );
}

function GuideCard({
  step,
  rect,
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
  const [placement, setPlacement] = useState<{ top: number; left: number } | null>(null);

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
    setPlacement(
      placeCard({
        anchor: rect,
        card: { width: box.width, height: box.height },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        side: stepSide(step),
        dir,
        gutter: GUTTER,
        gap: GAP,
      }),
    );
  }, [rect, docked, dir, step]);

  /*
    Docked: which edge.

    The sheet takes the edge the spotlight is furthest from, so it never covers
    the thing the step is about. An unanchored step has no preference and takes
    the bottom, where a thumb is.
  */
  const dockTop = rect !== null && rect.top + rect.height / 2 > window.innerHeight * 0.55;

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
            <Button type="button" variant="ghost" size="sm" onClick={onPrevious}>
              {t('back')}
            </Button>
          )}

          <Button type="button" size="sm" onClick={isLast ? onStop : onNext}>
            {isLast ? t('finish') : t('next')}
          </Button>
        </div>
      </div>
    </div>
  );
}
