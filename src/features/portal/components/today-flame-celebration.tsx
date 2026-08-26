'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { adherenceFraction, type AdherenceDay } from '@/features/portal/adherence';
import { MascotFace } from '@/features/portal/mascot/mascot-face';
import { FINAL_MASCOT_STATE } from '@/features/portal/mascot/states';
import { usePlanDayCompletion } from '@/features/weekly-plans/components/plan-day-completion';
import { getLocaleDirection, type Locale } from '@/i18n/routing';
import { playCelebrationChime } from '@/lib/celebration-chime';
import { playFlameClaimSound } from '@/lib/flame-claim-sound';
import { cn } from '@/lib/utils';

import { DayFlame } from './day-flame';

/**
 * The flame's own badge size inside the card — small, since it now shares the
 * row with the meal count rather than standing alone at hero scale. Still
 * what `heroRef` below measures for the claim's flight, so the FLIP math is
 * unaffected by the size chosen here; it only changes how far the flame
 * travels visually.
 */
const HERO_SIZE = 40;

/**
 * The mascot's own size in the claim card — the character that leads it, the
 * same reactive mark the journey card draws on the progress tab, larger here
 * than anywhere else it appears because this card exists to be looked at.
 */
const MASCOT_SIZE = 132;

/**
 * Six sparkles scattered around the card's top half, each its own size, ink
 * and delay so the twinkle in `globals.css` (`q-claim-sparkle-twinkle`) never
 * reads as one pattern repeating. Positions are logical (`start`/`end`), the
 * project's own convention for anything absolutely placed, so the scatter
 * mirrors correctly under Arabic rather than only ever leaning one way.
 * Alternates the flame's own ink (`--status-complete-mark`) and the brand
 * green so the card reads as one family of colour, not a generic gold.
 */
const SPARKLES: readonly { key: number; className: string; delayMs: number }[] = [
  { key: 0, className: 'start-[10%] top-[6%] size-3 text-status-complete-mark/80', delayMs: 0 },
  { key: 1, className: 'end-[8%] top-[4%] size-4 text-primary/70', delayMs: 260 },
  { key: 2, className: 'start-[4%] top-[42%] size-2.5 text-primary/60', delayMs: 620 },
  { key: 3, className: 'end-[4%] top-[46%] size-3 text-status-complete-mark/70', delayMs: 140 },
  { key: 4, className: 'start-[16%] top-[78%] size-2 text-status-complete-mark/60', delayMs: 460 },
  { key: 5, className: 'end-[18%] top-[80%] size-3.5 text-primary/50', delayMs: 340 },
];

/** A four-point sparkle glyph — no icon in `Icon`'s own registry draws this, and it exists nowhere else in the app. */
function SparkleGlyph({ className, delayMs }: { className: string; delayMs: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={cn('q-claim-sparkle pointer-events-none absolute', className)}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <path d="M12 2 14 10 22 12 14 14 12 22 10 14 2 12 10 10Z" />
    </svg>
  );
}

/** The small curved accent flanking the title — a decorative flourish, never a directional arrow, so the same path mirrors under `dir="rtl"` with a plain horizontal flip. */
function SwooshGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 14" fill="none" aria-hidden="true" className={className}>
      <path d="M2 12C7 2 17 1 26 5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** The flight from the dialog down to the strip. Not a named `--duration-*`
 * token: those are for micro-interactions inside a surface, and this is a
 * surface-to-surface hand-off — closer in kind to `--duration-travel` than
 * to anything smaller, just not that exact token (see globals.css). */
const FLIGHT_MS = 480;

/** How long the landing's glow/particles play once the flame is back in the
 * strip — long enough to read, short enough to never compete with it. */
const LANDING_MS = 700;

/** Six evenly-spaced points around the ring, in px offsets from centre — the
 * particle burst `.q-flame-particle` in `globals.css` travels along each. */
const PARTICLES = Array.from({ length: 6 }, (_, index) => {
  const angle = (index * 60 * Math.PI) / 180;
  return {
    key: index,
    style: {
      '--q-tx': `${Math.round(Math.cos(angle) * 18)}px`,
      '--q-ty': `${Math.round(Math.sin(angle) * 18)}px`,
      animationDelay: `${index * 25}ms`,
    } as CSSProperties,
  };
});

/** Same burst, scaled to `HERO_SIZE` — `DayFlame`'s `viewBox` makes the hero
 * flame a 3x redraw of the strip's, not a new shape, so its one-time burst on
 * the dialog's own open travels 3x as far for the same reason. */
const HERO_PARTICLES = Array.from({ length: 6 }, (_, index) => {
  const angle = (index * 60 * Math.PI) / 180;
  const scale = HERO_SIZE / 32;
  return {
    key: index,
    style: {
      '--q-tx': `${Math.round(Math.cos(angle) * 18 * scale)}px`,
      '--q-ty': `${Math.round(Math.sin(angle) * 18 * scale)}px`,
      animationDelay: `${index * 25}ms`,
    } as CSSProperties,
  };
});

type Phase = 'idle' | 'awaitingClaim' | 'claiming' | 'done';

/**
 * Today's cell in the week strip — the one cell a client can actually change
 * mid-visit, and the one this whole feature is about.
 *
 * **The live fraction.** The same trick `PlanDayStrip` already plays:
 * `usePlanDayCompletion()` is read directly rather than waiting on the
 * `router.refresh()` `toggle()` fires once the write lands. Outside a
 * `PlanDayCompletionProvider` `completion` is null and this falls back to the
 * server's own `day`, same as every other cell.
 *
 * **The celebration is a claim, not a toast.** Reaching 100% does not light
 * the strip's flame by itself — the last-known *incomplete* shape is held in
 * `heldDay` and drawn in its place until the client presses the dialog's
 * button. The cell only carries the real, complete shape once that flight
 * lands, which is why `displayDay` below reads from the hold during
 * `awaitingClaim`/`claiming` and from the live value everywhere else.
 *
 * **The flight is a FLIP, not a portal.** `handleClaim` measures the dialog's
 * hero flame the instant it is pressed — still mounted, since `dialog.close()`
 * has not run yet — and the layout effect below turns that into a start
 * transform on a fixed clone sized and positioned to the strip's own cell.
 * `position: fixed` reaches the viewport from here with no portal underneath
 * it; the one thing that would break it is a transformed ancestor, and this
 * tree has none between here and `<body>`.
 *
 * **`heldDay` and the `false -> true` edge that opens the dialog are both
 * adjusted during render, not in an effect** — the pattern the React docs
 * call out for state that tracks another value: comparing against the
 * previous render's own `useState` and calling `set` again, right there in
 * the render body, rather than an effect that would run one frame late and
 * flash the real, complete shape for a frame first. `liveDay` is memoised so
 * that comparison is a reference check, not a deep one, and so this only
 * re-renders when the numbers behind it actually move.
 */
export function TodayFlameCell({ day }: { day: AdherenceDay }) {
  const locale = useLocale() as Locale;
  const t = useTranslations('portal.progress.strip');
  const completion = usePlanDayCompletion();

  const local = completion && completion.dayOfWeek === day.weekday ? completion : null;
  const completedCount = local?.completedCount;
  const totalCount = local?.totalCount;

  const liveDay = useMemo<AdherenceDay>(
    () =>
      completedCount === undefined || totalCount === undefined
        ? day
        : { ...day, fraction: adherenceFraction(completedCount, totalCount), completedMeals: completedCount, totalMeals: totalCount },
    [day, completedCount, totalCount],
  );

  const isComplete = liveDay.totalMeals > 0 && liveDay.completedMeals >= liveDay.totalMeals;

  const [heldDay, setHeldDay] = useState(liveDay);
  const [wasComplete, setWasComplete] = useState(isComplete);
  const [phase, setPhase] = useState<Phase>('idle');
  const [landing, setLanding] = useState(false);

  if (!isComplete && heldDay !== liveDay) setHeldDay(liveDay);

  if (isComplete !== wasComplete) {
    setWasComplete(isComplete);
    if (isComplete) setPhase('awaitingClaim');
  }

  /*
    The chime, once per genuine claim opportunity — `phase` only ever becomes
    `'awaitingClaim'` from the render-time edge above, the same guarantee that
    keeps the dialog itself from reopening on an ordinary re-render, so this
    effect firing on that same transition cannot replay the sound on ticks
    that do not actually complete the day.
  */
  useEffect(() => {
    if (phase === 'awaitingClaim') playCelebrationChime();
  }, [phase]);

  useEffect(() => {
    if (!landing) return;
    const timer = window.setTimeout(() => setLanding(false), LANDING_MS);
    return () => window.clearTimeout(timer);
  }, [landing]);

  const heroRef = useRef<HTMLSpanElement>(null);
  const targetRef = useRef<HTMLSpanElement>(null);
  const flyingRef = useRef<HTMLSpanElement>(null);
  const startRectRef = useRef<DOMRect | null>(null);

  function handleClaim() {
    // The dialog is still open and painted at this exact instant — `close()`
    // only runs once `<Dialog>`'s own effect sees `open` flip below.
    startRectRef.current = heroRef.current?.getBoundingClientRect() ?? null;
    setPhase('claiming');
    playFlameClaimSound();
  }

  useLayoutEffect(() => {
    if (phase !== 'claiming') return;

    const flying = flyingRef.current;
    const start = startRectRef.current;
    const end = targetRef.current?.getBoundingClientRect();

    if (!flying || !start || !end) {
      setPhase('done');
      return;
    }

    flying.style.top = `${end.top}px`;
    flying.style.left = `${end.left}px`;
    flying.style.width = `${end.width}px`;
    flying.style.height = `${end.height}px`;

    const dx = start.left + start.width / 2 - (end.left + end.width / 2);
    const dy = start.top + start.height / 2 - (end.top + end.height / 2);
    const scale = start.width / end.width;

    flying.style.transition = 'none';
    flying.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;

    // Forces the browser to register the line above as a real, painted state
    // before the write below — the standard trick for getting a transition
    // out of two synchronous style writes instead of an instant jump.
    void flying.getBoundingClientRect();

    flying.style.transition = `transform ${FLIGHT_MS}ms cubic-bezier(.2, .6, .2, 1)`;
    flying.style.transform = 'translate(0, 0) scale(1)';
  }, [phase]);

  function handleLanded(event: React.TransitionEvent<HTMLSpanElement>) {
    if (event.target !== flyingRef.current) return;
    setPhase('done');
    setLanding(true);
  }

  const awaiting = phase === 'awaitingClaim' || phase === 'claiming';
  const displayDay = awaiting ? heldDay : liveDay;

  return (
    <>
      <span ref={targetRef} className="relative isolate grid place-items-center">
        <DayFlame day={displayDay} className={landing ? 'q-flame-celebrate' : undefined} />

        {landing ? (
          <>
            <span aria-hidden="true" className="q-flame-glow pointer-events-none absolute -inset-2 -z-10" />
            <span aria-hidden="true" className="pointer-events-none absolute inset-0">
              {PARTICLES.map((particle) => (
                <span key={particle.key} className="q-flame-particle" style={particle.style} />
              ))}
            </span>
          </>
        ) : null}
      </span>

      {/*
        No `dismissible`: the point of a claim is that it is claimed, not
        swiped away. `onClose` stays a no-op because `open` — not this
        callback — is what drives the dialog; the callback only exists to
        satisfy `Dialog`'s contract for a real `close` event.

        Portalled to `<body>` — this cell can now sit inside the plan day
        picker's own `<button>`, and a same-tree `<dialog>` would nest its
        "claim" button inside that button, which is invalid HTML and would
        let a claim tap bubble into `selectDay`. Gated on `phase`, not a
        mounted flag: `phase` only ever leaves `'idle'` from a client-side
        completion update (see the render-time check below), never on the
        first render, so `document` is always available by the time this
        branch is reached — no SSR guard required.
      */}
      {phase !== 'idle'
        ? createPortal(
            <Dialog
              open={phase === 'awaitingClaim'}
              onClose={() => {}}
              dismissible={false}
              label={t('celebration.title')}
              dir={getLocaleDirection(locale)}
              /*
                Always the centred card, on a phone too — this is a short,
                one-thing modal (a claim, not a browsing surface), exactly
                the case `Dialog`'s own `placement="center"` doc calls out
                over its `'sheet'` default: a bottom sheet this short reads
                as a strip that failed to finish opening.
              */
              placement="center"
              className="w-[min(23rem,calc(100vw-2rem))] overflow-hidden rounded-3xl"
            >
              <div className="relative isolate flex flex-col items-center gap-3 px-6 pt-9 pb-8 text-center">
                {/*
                  A soft warm wash behind the whole card — `q-claim-glow` in
                  globals.css, a gentler, wider cousin of `.q-mascot-glow`
                  built for a card-sized surface rather than a small badge.
                  Behind everything (`-z-10`), so the sparkles and the
                  character both sit on top of it rather than in front of a
                  flat card colour.
                */}
                <span aria-hidden="true" className="q-claim-glow pointer-events-none absolute inset-0 -z-10" />

                {/*
                  Six sparkles, scattered and twinkling on their own delays —
                  see the constant above for why the positions and inks vary.
                  `-z-10`, same reasoning as the wash: they read as part of
                  the card's own light, not as a layer floating over the
                  character.
                */}
                <span aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
                  {SPARKLES.map((sparkle) => (
                    <SparkleGlyph key={sparkle.key} className={sparkle.className} delayMs={sparkle.delayMs} />
                  ))}
                </span>

                {/*
                  The title leads, flanked by the same curved accent mirrored
                  left and right — purely decorative, the flourish the brief
                  for this card asked for, never a direction cue (see
                  `SwooshGlyph`'s own doc).
                */}
                <h2 className="flex items-center justify-center gap-2 font-heading text-heading-md font-extrabold text-primary text-balance">
                  <SwooshGlyph className="h-3.5 w-6 shrink-0 -scale-x-100" />
                  {t('celebration.title')}
                  <SwooshGlyph className="h-3.5 w-6 shrink-0" />
                </h2>

                <p className="text-sm text-muted-foreground">{t('celebration.subtitle')}</p>

                {/*
                  The character — the same reactive mark the journey card
                  draws on the progress tab, here playing its `celebration`
                  beat once on the card's own entrance, with its own soft
                  glow directly behind it. `FINAL_MASCOT_STATE` (not this
                  client's actual weekly tier): a claimed streak is its own
                  achievement, not a read on the week average, so the eyes
                  lean into the happiest baseline regardless of what tier the
                  week is otherwise at.
                */}
                <span className="relative isolate mt-1 grid place-items-center">
                  <span aria-hidden="true" className="q-mascot-glow pointer-events-none absolute -inset-6 -z-10" />
                  <MascotFace emotion="celebration" tier={FINAL_MASCOT_STATE} size={MASCOT_SIZE} />
                </span>

                {/*
                  The flame and the day's own count, together in one pill —
                  what used to be the flame alone at hero scale is now this
                  badge, since the character carries the card's main weight
                  now. `heroRef` wraps only the flame itself, not the whole
                  pill, so the claim's FLIP flight below still measures the
                  flame's own box rather than the wider row around it.
                */}
                <span className="mt-1 inline-flex items-center gap-2 rounded-full bg-muted/70 py-1.5 ps-2 pe-4">
                  <span ref={heroRef} className="relative isolate grid place-items-center">
                    <DayFlame day={liveDay} size={HERO_SIZE} className="q-flame-celebrate" />

                    {/*
                      The burst `TodayFlameCell` plays when the claimed flame
                      lands in the strip, played once here instead on the
                      dialog's own open — one celebration, reused where it is
                      earned, not a second effect invented for the card.
                    */}
                    <span aria-hidden="true" className="pointer-events-none absolute inset-0">
                      {HERO_PARTICLES.map((particle) => (
                        <span key={particle.key} className="q-flame-particle" style={particle.style} />
                      ))}
                    </span>
                  </span>

                  <span className="text-sm font-semibold">
                    {t('celebration.mealsCompleted', {
                      completed: liveDay.completedMeals,
                      total: liveDay.totalMeals,
                    })}
                  </span>
                </span>

                {/*
                  `text-white`, not the button's own `text-primary-foreground`
                  — that token went dark (`n-900`) when `--primary` moved to
                  the brand's lighter #72AE34, but this claim button is asked
                  for white text specifically, so it overrides the default
                  pairing rather than reopening it globally.
                */}
                <Button type="button" size="default" className="mt-2 w-full text-white" onClick={handleClaim}>
                  {t('celebration.claim')}
                </Button>
              </div>
            </Dialog>,
            document.body,
          )
        : null}

      {phase === 'claiming' ? (
        <span
          ref={flyingRef}
          aria-hidden="true"
          onTransitionEnd={handleLanded}
          className="pointer-events-none fixed z-50"
        >
          <DayFlame day={liveDay} />
        </span>
      ) : null}

      {phase === 'done' ? (
        <span role="status" className="sr-only">
          {t('celebration.claimed')}
        </span>
      ) : null}
    </>
  );
}
