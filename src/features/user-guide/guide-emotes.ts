import type { BodyPose, EyePose, MascotKeyframe } from '@/features/portal/mascot/eye-choreography';
import type { MascotPerformance } from '@/features/portal/mascot/mascot-face';

import type { GuideStep } from './steps';

/**
 * The face the tour wears, one expression per step.
 *
 * ## Why the guide writes its own beats
 *
 * The character is the product's own mark — the leaf from `@/features/brand/logo`
 * with its two seeds used as eyes — and it is drawn by exactly one component,
 * `MascotFace`. What it is *not* is the portal's mascot: the emotion vocabulary
 * that component was built around (`mealReminder`, `missedMeal`,
 * `streakAtRisk`, `goalComplete`) is a reading of one client's week, and the
 * staff app's tour has no client in front of it. Borrowing `mealReminder`
 * because its eyes happen to glance down at the right angle would put a name on
 * this screen that means something it cannot mean here.
 *
 * So the drawing is shared and the choreography is not. Each step below gets
 * beats written for what that step is *about* — the rail being scanned, the
 * register being surveyed, the filters narrowing — and the name says which.
 *
 * ## Each step ends holding its own face
 *
 * Every sequence finishes on a **signature pose**, not on the drawing's resting
 * geometry, and that is the difference between sixteen expressions and one.
 *
 * The first version of this file settled every step back to rest. The
 * expression was therefore only on screen for the second or so it took to play,
 * and a card sits there for as long as someone needs to read it — so what a
 * reader actually saw, on all sixteen steps, was the same neutral face. Worse,
 * `MascotFace` steps a `prefers-reduced-motion` reader **straight to the last
 * frame**: for them the tour had exactly one expression, the empty one.
 *
 * Holding the pose fixes both. The step's face stays for as long as the step
 * does, the reader can see it change when they press Next, and reduced motion
 * now lands on the step's own expression instead of on nothing. Idle blinking
 * carries on over the held pose — `MascotFace` layers that under whatever is
 * current — so a held face is still a live one.
 *
 * ## Everything here is sized for the card
 *
 * The poses look extreme next to the portal's, and they have to be. The eyes
 * move in the drawing's own 743-unit space, and the card draws that whole space
 * at somewhere between 72 and 200px (`mascotPlacement` in `guide-overlay.tsx`
 * sizes the mark to the card it stands beside): one unit is a fraction of a
 * pixel. The portal's ±10-unit glances are perfectly legible on a 160px mascot
 * and were *half a pixel* on the first version of this card — which is to say,
 * invisible. A gaze that reads at this size starts around 30 units and a head
 * lift around 20.
 *
 * Degrees are the exception: a tilt is the same tilt at any size, so the
 * rotations are the one part of this file that stays in the portal's range.
 *
 * ## What is allowed to move
 *
 * The eyes, and the head as a whole. Nothing else — see {@link HeadPose}: the
 * squash and stretch the portal's celebrations use is unavailable here by type,
 * not by convention. A guide card is a reading surface, and a mark bouncing
 * beside a paragraph becomes an irritation by the third step. A glance and a
 * tilt say the same thing and then hold still.
 *
 * ## Direction is placement's to decide, not the expression's
 *
 * No expression below holds a sideways gaze, and that is not squeamishness
 * about Arabic — it is that the expression is in no position to know which way
 * to look. The same step stands to the card's left in one layout, to its right
 * in another and above it on a phone, and a face that turned right in all three
 * would be looking at the card once and away from it twice.
 *
 * So each of the sixteen is written direction-free, out of the four things that
 * mean the same in both scripts — how open the eyes are, how far up or down
 * they look, how the head is tilted, and how it is carried — and {@link facing}
 * turns the whole sequence towards the card once the side is known.
 */

/** The head: where it is and how it is angled, never how it is squashed. */
type HeadPose = Omit<BodyPose, 'scaleX' | 'scaleY'>;

const REST_EYES: EyePose = { gazeX: 0, gazeY: 0, openness: 1, tilt: 0 };

/**
 * One beat. `scaleX`/`scaleY` are pinned at 1 here and cannot be passed in —
 * that is the whole enforcement of "eyes and head only".
 */
function beat(eyes: Partial<EyePose>, head: Partial<HeadPose> = {}, durationMs = 260, holdMs = 0): MascotKeyframe {
  return {
    eyes: { ...REST_EYES, ...eyes },
    body: { scaleX: 1, scaleY: 1, rotate: 0, translateY: 0, ...head },
    durationMs,
    holdMs,
  };
}

/**
 * The beat a sequence ends on and stays at. Slower than the beats before it,
 * because arriving somewhere and staying reads as settling, and arriving at the
 * same speed as a sweep reads as another sweep that happened to stop.
 */
function hold(eyes: Partial<EyePose>, head: Partial<HeadPose> = {}): MascotKeyframe {
  return beat(eyes, head, 340, 0);
}

/** Eyes shut and straight back open, reused wherever a sequence needs one. */
const BLINK = beat({ openness: 0.08 }, {}, 90, 60);

/**
 * The sixteen expressions, keyed by the look rather than by the step.
 *
 * Each is written as "how it gets there, then where it stays". The last beat of
 * every one is a {@link hold}, and no two holds are the same face: they are
 * spread across how open the eyes are (a squint at 0.4 through a stare at
 * 1.35), where they look, how the head is tilted, and whether it is carried
 * high or low. Reading the table down its last line is the quickest way to
 * check that a new expression is not a repeat of one already here.
 */
const GUIDE_EMOTES = {
  /* Meeting the reader: eyes open up, the head lifts, and it stays looking at them. */
  greeting: [
    beat({ openness: 0.15 }, { translateY: 10 }, 170, 60),
    beat({ openness: 1.32 }, { translateY: -18 }, 220, 90),
    hold({ openness: 1.3, gazeY: -20 }, { translateY: -40 }),
  ],

  /* The rail: a look down its whole length, ending with the head cocked at it. */
  scanning: [
    beat({ gazeX: -68, tilt: 5 }, { rotate: -7 }, 320, 140),
    beat({ gazeX: 68, tilt: -5 }, { rotate: 7 }, 380, 140),
    hold({ gazeY: 8, tilt: 10 }, { rotate: -14 }),
  ],

  /* A band of figures: caught by them, and still staring. */
  takingItIn: [
    beat({ openness: 1.45, gazeY: -14 }, { translateY: -18 }, 200, 220),
    BLINK,
    hold({ openness: 1.45, gazeY: -14, tilt: -4 }, { translateY: -14, rotate: 4 }),
  ],

  /* Something waiting to be dealt with: leans in and keeps watching it. */
  attentive: [
    beat({ openness: 1.1, gazeY: 40, tilt: 5 }, { rotate: 8 }, 280, 160),
    hold({ openness: 1.05, gazeY: 46, tilt: 6 }, { rotate: 13, translateY: 6 }),
  ],

  /* Reading down a list — two steps down, and it stays down there. */
  readingDown: [
    beat({ gazeY: 34 }, {}, 220, 120),
    BLINK,
    hold({ gazeY: 78, openness: 0.85 }, { translateY: 26 }),
  ],

  /* A long register: a slow look right across it, then a level survey. */
  surveying: [
    beat({ gazeX: -70, openness: 1.12 }, { rotate: -5 }, 360, 160),
    beat({ gazeX: 70, openness: 1.12 }, { rotate: 5 }, 400, 160),
    hold({ openness: 1.15, gazeY: 22, tilt: -8 }, { rotate: -6, translateY: 10 }),
  ],

  /* Searching: eyes narrow to look closely, and stay narrowed. */
  peering: [
    beat({ openness: 0.45, gazeY: 26 }, { translateY: 14 }, 280, 200),
    beat({ openness: 0.45, gazeX: 52 }, { translateY: 14 }, 240, 160),
    hold({ openness: 0.42, gazeY: 30 }, { translateY: 14 }),
  ],

  /* An invitation: the head comes up and stays up, turned towards the reader. */
  inviting: [
    beat({ openness: 1.24, gazeY: -16 }, { translateY: -34 }, 240, 180),
    hold({ openness: 1.22, gazeY: -16, tilt: 8 }, { translateY: -34, rotate: 10 }),
  ],

  /* A row of controls: two quick looks along it, then a raised, ready face. */
  glancing: [
    beat({ gazeX: -60 }, {}, 190, 110),
    BLINK,
    beat({ gazeX: 60 }, {}, 190, 120),
    hold({ openness: 1.18, gazeY: -8, tilt: -9 }, { translateY: -18, rotate: -9 }),
  ],

  /* Watching a drag: one long travel across, ending where it landed. */
  tracking: [
    beat({ gazeX: -66, gazeY: 20, openness: 1.1 }, { rotate: -6 }, 260, 100),
    beat({ gazeX: 66, gazeY: 40, openness: 1.1 }, { rotate: 6 }, 560, 160),
    hold({ openness: 1.08, gazeY: 52, tilt: -7 }, { rotate: -12, translateY: 8 }),
  ],

  /* Weighing a choice: a slow blink over it, then a good long think. */
  considering: [
    beat({ gazeX: -48, tilt: 10, openness: 0.9 }, { rotate: -8 }, 300, 180),
    beat({ openness: 0.12, tilt: 10 }, { rotate: -8 }, 190, 130),
    hold({ openness: 0.68, gazeY: 10, tilt: 12 }, { rotate: -16 }),
  ],

  /* Work already done for you: a pleased sway that ends high and wide. */
  impressed: [
    beat({ openness: 1.36 }, { translateY: -30 }, 200, 110),
    beat({ openness: 1.3, tilt: -6 }, { translateY: -30, rotate: -8 }, 180, 70),
    hold({ openness: 1.4, gazeY: -20, tilt: 6 }, { translateY: -44, rotate: 9 }),
  ],

  /* Browsing a catalog: an unhurried look over it, settling into it. */
  browsing: [
    beat({ gazeY: 44, tilt: 5 }, { rotate: 5 }, 320, 150),
    BLINK,
    hold({ gazeY: 56, tilt: 5, openness: 0.92 }, { rotate: 7, translateY: 20 }),
  ],

  /* Narrowing a list down: the eyes close in on it and stay closed in. */
  narrowing: [
    beat({ openness: 0.6, gazeY: 20 }, {}, 260, 160),
    beat({ openness: 0.6, gazeX: 46 }, {}, 220, 140),
    hold({ openness: 0.3, gazeY: 24 }, { translateY: 8 }),
  ],

  /* Ready to be given something: two small nods, ending up on its toes. */
  eager: [
    beat({ openness: 1.2 }, { translateY: -34 }, 180, 60),
    beat({ openness: 1.2 }, { translateY: 10 }, 160, 40),
    hold({ openness: 1.26, gazeY: -18, tilt: -6 }, { translateY: -36, rotate: -7 }),
  ],

  /* The end of the tour: a sway, and a happy squint it keeps. */
  delighted: [
    beat({ openness: 1.24, gazeY: -16 }, { translateY: -22 }, 220, 120),
    beat({ openness: 0.15 }, { rotate: -8, translateY: -20 }, 200, 110),
    hold({ openness: 0.15 }, { rotate: 8, translateY: -20 }),
  ],
} as const satisfies Record<string, readonly MascotKeyframe[]>;

type GuideEmote = keyof typeof GUIDE_EMOTES;

/**
 * Which expression each step wears.
 *
 * Held here rather than as a field on `GUIDE_STEPS` for the same reason the
 * section icons are: `steps.ts` states the shape of the tour — order, screen,
 * anchor, side — and someone rearranging that should not have to step over a
 * choreography table to do it. Exhaustive either way: this is keyed by
 * `GuideStep['id']`, so a step added without an expression is a compile error
 * rather than a card whose mascot silently sits still.
 *
 * Sixteen steps, sixteen expressions, and no two neighbours anywhere near each
 * other — pressing Next has to visibly change the face, or the character is
 * decoration.
 */
const STEP_EMOTES: Record<GuideStep['id'], GuideEmote> = {
  welcome: 'greeting',
  navigation: 'scanning',
  dashboardStats: 'takingItIn',
  dashboardRequests: 'attentive',
  dashboardAgenda: 'readingDown',
  clientsRegister: 'surveying',
  clientsSearch: 'peering',
  clientsNew: 'inviting',
  calendarToolbar: 'glancing',
  calendarBooking: 'tracking',
  plannerPicker: 'considering',
  plannerBoard: 'impressed',
  dishesCatalog: 'browsing',
  dishesFilters: 'narrowing',
  dishesAdd: 'eager',
  finish: 'delighted',
};

/**
 * Which side of the card the mark is standing on — the physical side, decided
 * by `mascotSide` in `guide-overlay.tsx` from where the card ended up.
 */
export type GuideMascotSide = 'above' | 'below' | 'left' | 'right';

/**
 * How far the mark turns towards the card, per side it is standing on.
 *
 * A character standing beside a panel of text and staring off the other way is
 * a character ignoring it. Turning it towards the card is what makes the two
 * one object: the mark looks at the words, so the reader does.
 *
 * This is added on top of whatever the step's own expression is doing, which is
 * why the expressions themselves are written direction-free — none of the
 * sixteen holds a sideways gaze of its own (see "Both scripts" above). The
 * direction is not the expression's to know: the same step is on the card's
 * left in one layout and above it in another, and only the placement knows
 * which.
 *
 * Sideways turns are the big ones because they are the ones with room: the eyes
 * sit high in the leaf, so they can travel much further down than up, and a
 * horizontal turn has the whole width to play with. `below` is the smallest for
 * that reason — the eyes are near the top of the shape already, and a bigger
 * upward look walks them off it.
 *
 * The head leans with the eyes on the two sideways placements, which is what a
 * turn of the head *is*; above and below leave it level, because a mark stacked
 * with the card is already square to it.
 */
const ATTENTION: Record<GuideMascotSide, { gazeX: number; gazeY: number; rotate: number }> = {
  left: { gazeX: 62, gazeY: 0, rotate: 6 },
  right: { gazeX: -62, gazeY: 0, rotate: -6 },
  above: { gazeX: 0, gazeY: 36, rotate: 0 },
  below: { gazeX: 0, gazeY: -22, rotate: 0 },
};

/** Keeps a turned gaze on the leaf: the eyes may travel this far, and no further. */
const GAZE_LIMIT = { x: 84, yUp: -34, yDown: 92 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * The sides the drawing is mirrored on — see `.q-guide-mascot-left` in
 * `globals.css`, which is what actually flips it.
 *
 * The mark is not symmetrical: the two seeds sit in the left half of the leaf
 * and the bite is out of the top right, so a face made of it looks *left*. That
 * is free when the mark stands to the card's right, and wrong when it stands to
 * the card's left — a character with its back to the thing it is introducing.
 * Gaze alone cannot fix it: the eyes can only travel inside a head that is
 * still pointing the other way.
 *
 * So on that one side the whole drawing is flipped. It is the mark used as a
 * character rather than as the product's signature — no wordmark, no lockup,
 * and it is decorative in the accessibility tree — which is the line that makes
 * mirroring it acceptable here and nowhere else in the app.
 *
 * Everything below is written in **screen** terms, and {@link facing} negates
 * the horizontal parts of it on a mirrored side, so "towards the card" stays
 * towards the card after the flip.
 */
const MIRRORED: Record<GuideMascotSide, boolean> = {
  left: true,
  right: false,
  above: false,
  below: false,
};

/**
 * The expression, turned to face the card.
 *
 * Every beat is offset, not just the one it settles on, so the mark is looking
 * the right way for the whole performance rather than swinging round at the end
 * of it. The clamp is what keeps a sweep that already goes one way from being
 * pushed off the drawing when the turn goes the same way.
 *
 * The negation on a mirrored side is applied *after* the offset, to the total:
 * the flip is a mirror of the finished drawing, so everything horizontal in it
 * — the step's own sweeps as much as the turn towards the card — has to be
 * written backwards for it to come out forwards.
 */
function facing(frames: readonly MascotKeyframe[], side: GuideMascotSide): readonly MascotKeyframe[] {
  const attention = ATTENTION[side];
  const flip = MIRRORED[side] ? -1 : 1;

  return frames.map((frame) => ({
    ...frame,
    eyes: {
      ...frame.eyes,
      gazeX: clamp(frame.eyes.gazeX + attention.gazeX, -GAZE_LIMIT.x, GAZE_LIMIT.x) * flip,
      gazeY: clamp(frame.eyes.gazeY + attention.gazeY, GAZE_LIMIT.yUp, GAZE_LIMIT.yDown),
      tilt: frame.eyes.tilt * flip,
    },
    body: { ...frame.body, rotate: (frame.body.rotate + attention.rotate) * flip },
  }));
}

/**
 * Every expression, in all four directions, built once.
 *
 * `MascotFace` takes the frame array as an effect dependency, so a `facing()`
 * call straight out of {@link guideEmote} would hand it a new array on every
 * render of the card — and the card re-renders whenever its placement is
 * measured. That would tear down and restart the timer stepping through the
 * beats, which on an unlucky sequence is an expression that never reaches its
 * last frame. One array per pair, made on the way in and then reused.
 */
const TURNED = new Map<string, MascotPerformance>();

/**
 * The performance for a step, ready to hand to `MascotFace`.
 *
 * The id carries the step *and* the side, which is what makes the face start
 * over both when the reader moves to the next step and when the card moves to
 * a place that needs the mark on a different side of it — in the second case it
 * plays its expression again, this time facing the way it now has to.
 */
export function guideEmote(stepId: GuideStep['id'], side: GuideMascotSide): MascotPerformance {
  const id = `guide:${stepId}:${side}`;

  const built = TURNED.get(id);
  if (built !== undefined) return built;

  const performance = { id, frames: facing(GUIDE_EMOTES[STEP_EMOTES[stepId]], side) };
  TURNED.set(id, performance);
  return performance;
}

/**
 * What just happened, as far as the character is concerned.
 *
 * The sixteen expressions above answer "which step is this"; these answer
 * "what did the reader just do", which is the other half of a face that is
 * actually watching. A reaction interrupts the step's expression, plays once,
 * and hands back to it — see `guideSettled`.
 *
 * Each one is tied to a real event, and nothing here fires on a timer:
 *
 * - `advancing` / `returning` — Next and Back were pressed. Opposite reactions
 *   on purpose: a nod forward, and a glance back over the shoulder.
 * - `offered` / `warned` — the pointer is resting on Next, or on Skip. The
 *   reader has not committed to either, so these are small: eyes up and keen
 *   for the one that carries on, eyes down for the one that ends the tour.
 * - `hunting` — the step's anchor has not been found yet. It loops, because it
 *   describes an ongoing condition rather than a moment, and it only ever
 *   appears on the steps that cross a route, where finding the control really
 *   does take a beat.
 * - `puzzled` — the anchor is not going to be found: an optional step whose
 *   element this clinic has not got (an empty register draws no table). The
 *   card still reads, and the face says the mark noticed.
 */
export type GuideReactionName = 'advancing' | 'returning' | 'offered' | 'warned' | 'hunting' | 'puzzled';

/**
 * A reaction's beats, and how long it holds the face before the step's own
 * expression takes it back.
 *
 * `ms` is stated rather than summed from the frames because it is a different
 * question: the frames say how the reaction is drawn, `ms` says how long the
 * character stays interrupted. `hunting` is the exception with no answer —
 * it loops until the condition that raised it goes away.
 */
type GuideReaction = { frames: readonly MascotKeyframe[]; ms: number; looping?: boolean };

const GUIDE_REACTIONS: Record<GuideReactionName, GuideReaction> = {
  /* Next: a quick, definite nod. Eyes close on the down-beat, as a nod does. */
  advancing: {
    frames: [
      beat({ openness: 1.16 }, { translateY: -16 }, 130, 40),
      beat({ openness: 0.35 }, { translateY: 14 }, 120, 60),
      hold({ openness: 1.1 }, { translateY: -6 }),
    ],
    ms: 620,
  },

  /* Back: a look over the shoulder — the head turns away and comes back. */
  returning: {
    frames: [
      beat({ openness: 1.24, gazeX: -70 }, { rotate: -10 }, 200, 120),
      beat({ openness: 1.12, gazeX: -40 }, { rotate: -6 }, 180, 80),
      hold({ openness: 1.08 }, {}),
    ],
    ms: 720,
  },

  /* The pointer is on Next: ears up, eyes up, ready to go. */
  offered: {
    frames: [hold({ openness: 1.34, gazeY: -14 }, { translateY: -20 })],
    ms: 260,
  },

  /* The pointer is on Skip: the one control that ends this. Eyes go down. */
  warned: {
    frames: [hold({ openness: 0.6, gazeY: 34, tilt: -5 }, { translateY: 16, rotate: -4 })],
    ms: 260,
  },

  /* Looking for the control this step is about, and not finding it yet. */
  hunting: {
    frames: [
      beat({ gazeX: -58, openness: 1.12 }, { rotate: -7 }, 300, 160),
      BLINK,
      beat({ gazeX: 58, openness: 1.12 }, { rotate: 7 }, 300, 160),
      beat({ gazeY: 20, openness: 1.05 }, {}, 280, 140),
    ],
    ms: 0,
    looping: true,
  },

  /* It is not there to be found. A shrug, in eyes: half-shut and tilted. */
  puzzled: {
    frames: [
      beat({ openness: 1.2, gazeY: 26 }, { rotate: 9 }, 240, 140),
      hold({ openness: 0.72, gazeY: 14, tilt: 11 }, { rotate: -12 }),
    ],
    ms: 900,
  },
};

/** How long a reaction holds the face. `0` means "until it is taken away". */
export function guideReactionMs(name: GuideReactionName): number {
  return GUIDE_REACTIONS[name].ms;
}

const REACTED = new Map<string, MascotPerformance>();

/**
 * A reaction to something the reader did, facing the card like everything else.
 *
 * Cached per side for the same reason {@link guideEmote} is: `MascotFace` reads
 * the frame array as an effect dependency, and a fresh array per render would
 * restart the beats under it.
 */
export function guideReaction(name: GuideReactionName, side: GuideMascotSide): MascotPerformance {
  const id = `guide-reaction:${name}:${side}`;

  const built = REACTED.get(id);
  if (built !== undefined) return built;

  const reaction = GUIDE_REACTIONS[name];
  const performance = { id, frames: facing(reaction.frames, side), looping: reaction.looping };
  REACTED.set(id, performance);
  return performance;
}

const SETTLED = new Map<string, MascotPerformance>();

/**
 * The step's expression with its arrival taken off — the held pose alone.
 *
 * What the face returns to once a reaction has finished. Replaying the whole
 * expression there would be the character re-introducing a step the reader is
 * already halfway through; the pose it was holding when it was interrupted is
 * the honest place to come back to.
 *
 * Every expression's last frame is its {@link hold}, so this is that frame and
 * nothing else. `MascotFace` treats a one-frame sequence as a still pose and
 * resumes its idle blinking over it.
 */
export function guideSettled(stepId: GuideStep['id'], side: GuideMascotSide): MascotPerformance {
  const id = `guide-settled:${stepId}:${side}`;

  const built = SETTLED.get(id);
  if (built !== undefined) return built;

  const frames = guideEmote(stepId, side).frames;
  const last = frames[frames.length - 1];
  const performance = { id, frames: last === undefined ? frames : [last] };
  SETTLED.set(id, performance);
  return performance;
}
