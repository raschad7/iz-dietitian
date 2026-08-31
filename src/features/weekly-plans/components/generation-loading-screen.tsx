'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { BrandMark } from '@/components/layout/brand-logo';

import type { NewWeekMode } from '../new-week';

/**
 * The four stages, in order, with the weight each carries.
 *
 * The durations are not a schedule the server publishes — nothing in the
 * generation pipeline reports which phase it is in. They are the shape of the
 * call as it is actually observed: a fast read, a longer analysis, a long build
 * that is most of the wait, and a review that closes it. They sum to 45s, in
 * the middle of the 30–60s the real call takes, and what happens when the
 * response is slower than that is the whole of `progressAt` below.
 *
 * Message keys are written out in full rather than composed from a stage id.
 * `ar.json` types every key in the app, so a literal path is checked against
 * the real message tree; a template built from two unions would offer the
 * type-checker fifty-two paths of which thirteen exist.
 */
const STAGES = [
  {
    name: 'generationLoading.stages.gather.name',
    description: 'generationLoading.stages.gather.description',
    durationMs: 7_000,
    points: [
      'generationLoading.stages.gather.points.profile',
      'generationLoading.stages.gather.points.goals',
      'generationLoading.stages.gather.points.limits',
    ],
  },
  {
    name: 'generationLoading.stages.analyse.name',
    description: 'generationLoading.stages.analyse.description',
    durationMs: 10_000,
    points: [
      'generationLoading.stages.analyse.points.calories',
      'generationLoading.stages.analyse.points.macros',
      'generationLoading.stages.analyse.points.meals',
    ],
  },
  {
    /*
      No sentence. Its checkpoints say what building the plan means in more
      detail than a summary line could, and the line above them was repeating
      them in worse words. The paragraph's height is still reserved at the call
      site so the block below does not move when this stage comes round.
    */
    name: 'generationLoading.stages.build.name',
    description: null,
    durationMs: 17_000,
    points: [
      'generationLoading.stages.build.points.dishes',
      'generationLoading.stages.build.points.days',
      'generationLoading.stages.build.points.portions',
    ],
  },
  {
    name: 'generationLoading.stages.review.name',
    description: 'generationLoading.stages.review.description',
    durationMs: 11_000,
    points: [
      'generationLoading.stages.review.points.balance',
      'generationLoading.stages.review.points.restrictions',
      'generationLoading.stages.review.points.draft',
    ],
  },
] as const;

/**
 * How far into its own stage's fill each checkpoint lights.
 *
 * Fractions of the *fill*, not of the clock, so a checkpoint always lights as
 * the green reaches it rather than a beat before or after — which is the only
 * thing that makes the list look like a readout of the bar instead of a second
 * animation running beside it.
 */
const CHECKPOINT_AT = [0.2, 0.45, 0.68];

/**
 * The curve, and the two ways it is used.
 *
 * `EASE` is a stage that has a known end: normalised so it arrives at exactly
 * 1 as the stage closes. Without the divisor the raw curve stops at .959 and
 * the last 4% of the block snaps shut in one frame at every handover.
 *
 * `TAIL_EASE` is the fourth stage, which has no known end — the response
 * arrives when it arrives. It is asymptotic instead: it approaches `TAIL_CAP`
 * and never reaches it, so the bar is still moving at ninety seconds if that is
 * what the call takes, and it can never claim to be finished. It is slacker
 * than the others on purpose; a curve that flattens in eleven seconds would put
 * the screen right back where it started.
 */
const EASE = 4.6;
const TAIL_EASE = 2.2;
/** Three closed stages plus .88 of the fourth is 97% exactly. */
const TAIL_CAP = 0.88;

/**
 * How far through the whole run the timer has got, from 0 to just under 1.
 *
 * One number for the entire bar rather than a stage and a fraction, because
 * that is what makes the landing below possible: the arrival can ramp this one
 * value to 1 and every block, every checkpoint and the counter follow from it,
 * with no seam where the timer stops and the response takes over.
 */
function progressAt(elapsedMs: number): number {
  const lastIndex = STAGES.length - 1;
  let stageStart = 0;

  for (const [index, stage] of STAGES.entries()) {
    const isLast = index === lastIndex;

    /* The last stage is never left, whatever the clock says. */
    if (isLast || elapsedMs < stageStart + stage.durationMs) {
      const u = Math.max(0, (elapsedMs - stageStart) / stage.durationMs);
      const fill = isLast
        ? TAIL_CAP * (1 - 2 ** (-TAIL_EASE * u))
        : (1 - 2 ** (-EASE * u)) / (1 - 2 ** -EASE);

      return (index + fill) / STAGES.length;
    }

    stageStart += stage.durationMs;
  }

  /* Unreachable — the loop always returns on its last pass. Here because the
     type-checker cannot see that, and a thrown error would be a worse answer
     than the value that branch would have produced. */
  return (lastIndex + TAIL_CAP) / STAGES.length;
}

/**
 * The landing: what happens when the plan actually exists.
 *
 * Until the response arrives the bar cannot honestly reach 100%, so it does not
 * — that is what `TAIL_CAP` is for. The moment it does arrive, this runs the
 * bar from wherever the timer had got to up to a true 100%. So the bar completes
 * *because* the plan completed, rather than stopping at ninety-one while the
 * plan appears on the board behind it.
 *
 * **It is an animation and nothing depends on it finishing.** The response
 * carries a revalidated tree that replaces the board — and this dialog with it —
 * within a few hundred milliseconds, so the last frames of the landing are in a
 * race with an unmount that they can lose. Everything that has to actually
 * happen on success happens in `handleSuccess` over in `new-week-dialog.tsx`,
 * on the response itself. This only has to look right for as long as it lasts.
 *
 * It is deliberately brief. The plan exists the instant the response lands, so
 * every millisecond the bar spends catching up is a millisecond the screen is
 * behind the truth: in the ordinary case — a response at forty-five seconds or
 * later, with the bar already in the nineties — the whole landing is about two
 * hundred milliseconds, which reads as the bar completing *on* the response
 * rather than after it. The duration still scales with the distance left, so an
 * unusually fast response has a little longer to cross the ground it skipped
 * instead of tearing across it in one frame.
 */
const LANDING_BASE_MS = 180;
const LANDING_PER_UNIT_MS = 340;
/**
 * A handful of frames at a full bar, and then gone.
 *
 * Not a success screen — there is none, deliberately. The toast the dialog
 * raises is where "the plan was created" is said; this screen's last word is a
 * bar that is full, and it leaves on it. Anything longer turns a wait state
 * into a second thing to read after the waiting is over.
 */
const LANDING_HOLD_MS = 140;

/**
 * How far the seed pair may travel inside the leaf, per direction, in viewBox
 * units.
 *
 * Asymmetric because the artwork is: the seeds sit high and to the left of the
 * leaf's centre, so there are 294 units of room below them and 68 to their
 * left. One symmetric limit is therefore the tightest of the four, and the gaze
 * barely moves at all. Each direction gets its own room, less a margin, so the
 * eyes go as far as the shape allows and never leave it.
 */
const GAZE_ROOM = { left: 56, right: 120, up: 72, down: 230 };
/** The lean the whole mark takes with them. */
const GAZE_TILT = 10;
/** Chasing the pointer, and letting go of it. Two speeds — see `settle`. */
const GAZE_CHASE_MS = 85;
const GAZE_RELEASE_MS = 260;

/**
 * The protected wait state for full-week generation.
 *
 * The request owns this component's lifetime: it mounts when the real server
 * action starts and stays until the bar has finished answering it. Nothing here
 * runs on a guess about how long that takes.
 *
 * ## Why there is a timeline at all
 *
 * The screen it replaces crossfaded four food icons over an indeterminate bar.
 * Nothing about it moved forward, so after ten seconds of a wait that runs to
 * sixty it read as frozen, and the honest answer — an elapsed second count —
 * only told the reader how long they had been waiting, never how much was left.
 *
 * The four stages are a described process rather than an observed one, and the
 * trade is deliberate: the pipeline does not report its phase, so the choice is
 * between a plausible account of the work and no account at all. What keeps it
 * from becoming a lie is the ceiling.
 *
 * ## The ceiling, and who is allowed to lift it
 *
 * **The timer cannot take the bar past 97%.** The fourth stage approaches its
 * cap asymptotically and stops nowhere, so a slow call finds a bar that is
 * still moving rather than a full bar above a stuck screen.
 *
 * 100% has exactly one cause: `complete`, which the dialog sets when the server
 * action resolves. The bar closes the remaining distance in about two hundred
 * milliseconds and calls `onComplete`, and only then does the dialog go. So the
 * plan is never on the board behind a bar stopped at ninety-one, and the bar
 * never sits at a hundred waiting for something that already happened.
 *
 * ## There is no success state here
 *
 * The screen says one thing for its whole life and then leaves on a full bar.
 * Reporting the finished plan is the toast's job — see `finishGeneration` in
 * `new-week-dialog.tsx`. A wait state that swaps in a congratulation after the
 * waiting is over is a second screen to read at the exact moment the reader
 * wants the board.
 *
 * ## What is allowed to move
 *
 * Three things: the fill crossing its block, colours crossfading, and text
 * fading up where it already stands. There are no keyframes on this screen and
 * nothing pulses, breathes, glows, sweeps, bounces or slides. A wait that
 * decorates itself is a wait that is asking to be watched, and this one is
 * asking to be believed.
 *
 * The single exception is the mark, which follows the pointer and blinks. It is
 * the one thing on the screen that is not reporting progress, so it is the one
 * thing that can afford to be alive — and it is off entirely under reduced
 * motion, where the bar's own travel stays, because there the movement *is* the
 * state.
 *
 * ## Why so little of this is React state
 *
 * The frame loop writes `transform` and `data-*` straight onto the nodes. Only
 * the stage index is state, so this component renders five times across a
 * minute rather than three thousand — and re-rendering it means re-rendering
 * the dialog it is inside. The styles those attributes select live in
 * `globals.css` under `.q-plan-*`.
 */
export function GenerationLoadingScreen({
  mode,
  complete,
  onComplete,
}: {
  mode: NewWeekMode;
  /**
   * The plan exists. Set by the dialog the moment the server action resolves,
   * and the only thing in the app that can take the bar to 100%.
   */
  complete: boolean;
  /** The bar has landed and been read. The dialog may close now. */
  onComplete: () => void;
}) {
  const t = useTranslations('weeklyPlans');
  const rootRef = useRef<HTMLElement>(null);
  const markRef = useRef<HTMLDivElement>(null);
  const percentRef = useRef<HTMLSpanElement>(null);
  const blockRefs = useRef<(HTMLDivElement | null)[]>([]);
  const fillRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const labelRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pointRefs = useRef<(HTMLSpanElement | null)[][]>(STAGES.map(() => []));

  const [stageIndex, setStageIndex] = useState(0);

  /*
    The frame loop is set up once and runs for the life of the screen, so it
    cannot close over a prop. These two are the seam: the loop reads the refs,
    and the refs are kept current by the render.
  */
  const completeRef = useRef(complete);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    completeRef.current = complete;
    onCompleteRef.current = onComplete;
  });

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    root.focus();

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /*
      Measured, not guessed. The stage name flips from dark to white when the
      fill passes its far edge, and where that edge is depends on the word: the
      same block holds "بناء الخطة" and "Building the plan". Timing the flip at
      a fixed fraction leaves one language legible and dissolves the other into
      the fill for a second on the way past.
    */
    const coverAt: number[] = [];

    const measure = () => {
      STAGES.forEach((_, index) => {
        const block = blockRefs.current[index];
        const label = labelRefs.current[index];
        if (!block || !label) return;

        const blockWidth = block.getBoundingClientRect().width || 1;
        const labelWidth = label.getBoundingClientRect().width || 0;
        coverAt[index] = Math.min(0.98, (labelWidth + 6) / blockWidth);
      });
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(root);

    /*
      And again once the webfonts are in. The first measurement runs against
      whatever face is painting at mount, and the fallback is not the same width
      as Plex Arabic — a label measured in the wrong font flips colour in the
      wrong place for the whole of its stage.
    */
    void document.fonts?.ready.then(measure);

    /* ── The bar ────────────────────────────────────────────────────────── */

    const startedAt = performance.now();
    let renderedStage = -1;

    /*
      Write only what changed.

      The fill's transform is genuinely different every frame; almost nothing
      else is. Setting `data-state` to the value it already holds is still an
      attribute write, and thirty-four of those a frame is two thousand a
      second — each one an invalidation, on the one screen in the app whose
      only job is to keep moving smoothly.
    */
    const put = (node: HTMLElement, key: string, value: string) => {
      if (node.dataset[key] !== value) node.dataset[key] = value;
    };

    /* Captured on the first frame after the response lands, then never reset. */
    let landing: { from: number; startedAt: number; durationMs: number } | null = null;
    let released = false;

    const draw = (now: number) => {
      let overall: number;

      if (completeRef.current) {
        if (!landing) {
          const from = progressAt(now - startedAt);
          landing = {
            from,
            startedAt: now,
            durationMs: LANDING_BASE_MS + LANDING_PER_UNIT_MS * (1 - from),
          };
        }

        const elapsed = now - landing.startedAt;
        const u = Math.min(1, elapsed / landing.durationMs);
        /* Cubic ease-out: it arrives rather than stops. */
        overall = landing.from + (1 - landing.from) * (1 - (1 - u) ** 3);

        if (!released && elapsed >= landing.durationMs + LANDING_HOLD_MS) {
          released = true;
          onCompleteRef.current();
        }
      } else {
        overall = progressAt(now - startedAt);
      }

      const reach = overall * STAGES.length;
      const liveIndex = Math.min(STAGES.length - 1, Math.floor(reach));

      STAGES.forEach((stage, position) => {
        /* Every block, every checkpoint and the counter are read off the one
           number, so the landing needs no separate path through any of them. */
        const value = Math.min(1, Math.max(0, reach - position));
        const done = value >= 1;
        const live = !done && position === liveIndex;

        const block = blockRefs.current[position];
        const filled = fillRefs.current[position];
        const column = columnRefs.current[position];

        if (filled) filled.style.transform = `scaleX(${value.toFixed(4)})`;

        if (block) {
          put(block, 'state', done ? 'done' : live ? 'live' : 'upcoming');
          put(block, 'covered', String(live && value > (coverAt[position] ?? 0.3)));
        }

        /* Which list a phone shows. Decoupled from the block's own state on
           purpose: at a true 100% no block is live any more, and the reader
           should be left looking at the last stage's checkpoints rather than
           at nothing. */
        if (column) put(column, 'live', String(position === liveIndex));

        stage.points.forEach((_point, order) => {
          const node = pointRefs.current[position]?.[order];
          if (!node) return;

          const reached = value > (CHECKPOINT_AT[order] ?? 1);
          put(node, 'reached', String(reached));
          put(node, 'past', String(reached && done));
        });
      });

      const percent = String(Math.round(overall * 100));
      if (percentRef.current && percentRef.current.textContent !== percent) {
        percentRef.current.textContent = percent;
      }

      if (renderedStage !== liveIndex) {
        renderedStage = liveIndex;
        setStageIndex(liveIndex);
      }
    };

    /* ── The mark ───────────────────────────────────────────────────────── */

    const seeds = root.querySelector<SVGGElement>('[data-slot="brand-seeds"]');
    const mark = markRef.current?.querySelector('svg') ?? null;

    const gaze = { x: 0, y: 0, tilt: 0 };
    const target = { x: 0, y: 0, tilt: 0 };
    let chasing = false;

    /*
      The card is the whole interaction. The listener is on it rather than on
      the window, so the pointer is tracked only while it is genuinely over the
      screen — no viewport arithmetic and no hit testing.

      Both coordinates are taken against that same card: the pointer through its
      rect, the mark through its offsets inside it (the card is the mark's
      offset parent). One origin for both, so the vector between them stays
      exact at any scroll position or window size.
    */
    const aim = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;

      const card = root.getBoundingClientRect();
      const wrap = markRef.current;
      if (!card.width || !wrap?.offsetWidth) return;

      const dx = event.clientX - card.left - (wrap.offsetLeft + wrap.offsetWidth / 2);
      const dy = event.clientY - card.top - (wrap.offsetTop + wrap.offsetHeight / 2);
      const distance = Math.hypot(dx, dy) || 1;
      const ux = dx / distance;
      const uy = dy / distance;
      /*
        Full deflection almost at once. The falloff is not a softening — it is
        only there so the direction cannot spin when the pointer is sitting on
        top of the mark itself.
      */
      const reach = Math.min(1, distance / 90);

      target.x = ux * (ux > 0 ? GAZE_ROOM.right : GAZE_ROOM.left) * reach;
      target.y = uy * (uy > 0 ? GAZE_ROOM.down : GAZE_ROOM.up) * reach;
      target.tilt = ux * GAZE_TILT * reach;
      chasing = true;
    };

    const release = () => {
      target.x = 0;
      target.y = 0;
      target.tilt = 0;
      chasing = false;
    };

    /* Irregular on purpose: a blink on a metronome reads as a machine. */
    let blinkIn = 2_600 + Math.random() * 2_400;
    let blinkFor = -1;

    const settle = (deltaMs: number) => {
      /*
        Frame-rate independent, and two speeds. It chases the pointer quickly
        but returns slowly: a snap back to centre reads as a glitch, while an
        unhurried release reads as losing interest.
      */
      const k = 1 - Math.exp(-deltaMs / (chasing ? GAZE_CHASE_MS : GAZE_RELEASE_MS));
      gaze.x += (target.x - gaze.x) * k;
      gaze.y += (target.y - gaze.y) * k;
      gaze.tilt += (target.tilt - gaze.tilt) * k;

      if (mark) mark.style.transform = `rotate(${gaze.tilt.toFixed(2)}deg)`;

      let lid = 1;

      if (blinkFor >= 0) {
        blinkFor += deltaMs;
        const u = blinkFor / 150;
        if (u >= 1) {
          blinkFor = -1;
          blinkIn = 2_600 + Math.random() * 3_200;
        } else {
          lid = 1 - Math.sin(u * Math.PI) * 0.94;
        }
      } else {
        blinkIn -= deltaMs;
        if (blinkIn <= 0) blinkFor = 0;
      }

      if (seeds) {
        seeds.style.transform = `translate(${gaze.x.toFixed(1)}px, ${gaze.y.toFixed(1)}px) scaleY(${lid.toFixed(3)})`;
      }
    };

    if (!reduceMotion) {
      root.addEventListener('pointermove', aim, { passive: true });
      /* Fires on the card itself, so the eyes let go the moment the pointer is
         out of it — including when it leaves the window entirely. */
      root.addEventListener('pointerleave', release);
      root.addEventListener('pointercancel', release);
      window.addEventListener('blur', release);
    }

    let frame = 0;
    let previous: number | null = null;

    const tick = (now: number) => {
      const deltaMs = previous === null ? 0 : Math.min(64, now - previous);
      previous = now;

      draw(now);
      if (!reduceMotion) settle(deltaMs);

      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      root.removeEventListener('pointermove', aim);
      root.removeEventListener('pointerleave', release);
      root.removeEventListener('pointercancel', release);
      window.removeEventListener('blur', release);
    };
  }, []);

  const stage = STAGES[stageIndex] ?? STAGES[0];

  return (
    <section
      ref={rootRef}
      role="status"
      tabIndex={-1}
      aria-live="polite"
      aria-busy="true"
      /*
        The 30rem floor is what keeps this screen from collapsing to the height
        of its own text while the plan is being written, so the dialog does not
        shrink and re-grow around it. `min()` is the landscape half of that: a
        phone turned sideways is ~390px tall, and an unconditional floor made a
        *status* screen — one with nothing to read past the first paragraph and
        no control to reach — something the reader had to scroll.

        `flex-1` is what puts the bar at the bottom of the 52rem stage the
        dialog holds open from `sm` up, rather than at the bottom of the text.
      */
      className="q-plan-stages relative flex min-h-[min(30rem,70dvh)] flex-1 flex-col pb-9 outline-none sm:pb-14"
    >
      <div ref={markRef} className="q-plan-mark" aria-hidden="true">
        <BrandMark />
      </div>

      {/* The airy half. Everything here is centred and the bar below is not;
          the whitespace between them is what makes the bar read as a floor
          rather than as another row of content. */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-5 pt-10 pb-4 text-center sm:px-8">
        {/*
          It never changes. This screen says one thing for as long as it is up,
          and the moment it has nothing left to say it goes — the toast the
          dialog raises is what reports the finished plan, not a success frame
          rendered here after the work is over.
        */}
        <h2 className="max-w-xl text-heading-lg font-semibold text-balance">
          {t(mode === 'regenerate' ? 'generationLoading.regenerateTitle' : 'generationLoading.title')}
        </h2>

        {/* Height reserved: the third stage carries no sentence, and an empty
            line must not move the counter under it. */}
        <p className="min-h-[1.5em] max-w-[48ch] text-body-sm text-pretty text-muted-foreground">
          {stage.description ? t(stage.description) : null}
        </p>

        {/*
          `dir="ltr"`: the number and its sign are one Latin run in both
          locales — digits are `nu-latn` app-wide — and pinning the direction
          is what keeps the sign behind the number in Arabic rather than in
          front of it. The span is deliberately childless in JSX; the frame
          loop owns its text.
        */}
        <p dir="ltr" aria-hidden="true" className="mt-1 leading-none tabular-nums">
          <span ref={percentRef} className="text-display-sm text-foreground sm:text-display-lg" />
          <span className="text-heading-sm text-muted-foreground">%</span>
        </p>

        {/* The running stage, named — on a phone only, where the blocks are too
            narrow to carry their own names. From `sm` up the bar is already
            saying it, and the counter above says how far along it is, so a line
            here restating both was the one piece of furniture on this screen
            that nobody needed to read. */}
        <p aria-hidden="true" className="min-h-[1.5em] text-label text-muted-foreground sm:hidden">
          {t(stage.name)}
        </p>

        {/* The only thing in here a screen reader is meant to hear. Everything
            that moves is hidden from it, so this live region announces four
            times across the wait instead of sixty times a second. */}
        <p className="sr-only">
          {t('generationLoading.announce', {
            current: stageIndex + 1,
            total: STAGES.length,
            stage: t(stage.name),
          })}
        </p>
      </div>

      {/* The checkpoint lists, standing on the bar. `min-h` holds the tallest
          of the four so the bar keeps its line as the stages change. */}
      <div
        aria-hidden="true"
        className="q-plan-lists"
      >
        {STAGES.map((entry, index) => (
          <div
            key={entry.name}
            ref={(node) => {
              columnRefs.current[index] = node;
            }}
            className="q-plan-column"
          >
            {entry.points.map((point, order) => (
              <span
                key={point}
                ref={(node) => {
                  const column = pointRefs.current[index];
                  if (column) column[order] = node;
                }}
                className="q-plan-point text-label"
              >
                <span className="q-plan-dot" />
                {t(point)}
              </span>
            ))}
          </div>
        ))}
      </div>

      <div
        aria-hidden="true"
        className="flex h-14 shrink-0 gap-(--q-plan-gap) sm:h-17.5"
      >
        {STAGES.map((entry, index) => (
          <div
            key={entry.name}
            ref={(node) => {
              blockRefs.current[index] = node;
            }}
            className="q-plan-block"
          >
            <span
              ref={(node) => {
                fillRefs.current[index] = node;
              }}
              className="q-plan-fill"
            />
            <span
              ref={(node) => {
                labelRefs.current[index] = node;
              }}
              className="q-plan-label text-label"
            >
              <span className="tabular-nums">{index + 1}</span>
              <span className="hidden min-w-0 truncate sm:inline">/{t(entry.name)}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
