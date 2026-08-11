'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { adherenceFraction, type AdherenceDay } from '@/features/portal/adherence';
import { usePlanDayCompletion } from '@/features/weekly-plans/components/plan-day-completion';
import { getLocaleDirection, type Locale } from '@/i18n/routing';

import { DayFlame } from './day-flame';

/** The dialog's own flame, drawn at hero scale — see `DayFlame`'s `size` prop. */
const HERO_SIZE = 96;

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
              className="m-auto w-[min(22rem,calc(100vw-2rem))] max-w-none rounded-2xl"
            >
              <div className="flex flex-col items-center gap-5 px-6 py-10 text-center">
                <span ref={heroRef} className="relative isolate grid place-items-center">
                  <DayFlame day={liveDay} size={HERO_SIZE} className="q-flame-celebrate" />

                  {/*
                    The same glow/burst `TodayFlameCell` plays when the claimed
                    flame lands in the strip, played once here instead on the
                    dialog's own open — one celebration, reused where it is
                    earned, not a second effect invented for the card. This
                    span mounts once per day's claim (see the portal gate
                    above), so the animations fire on that mount and never
                    replay while the dialog is merely re-opened by React.
                  */}
                  <span aria-hidden="true" className="q-flame-glow pointer-events-none absolute -inset-6 -z-10" />
                  <span aria-hidden="true" className="pointer-events-none absolute inset-0">
                    {HERO_PARTICLES.map((particle) => (
                      <span key={particle.key} className="q-flame-particle" style={particle.style} />
                    ))}
                  </span>
                </span>

                <h2 className="font-heading text-heading-sm font-semibold text-balance">
                  {t('celebration.title')}
                </h2>

                <Button type="button" size="default" className="w-full" onClick={handleClaim}>
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
