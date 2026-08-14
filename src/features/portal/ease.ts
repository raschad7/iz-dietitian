/**
 * `--ease-sweep`, `cubic-bezier(.2, .6, .2, 1)`, solved in JS.
 *
 * The app has exactly one easing curve and the design system forbids inventing
 * a second, so this is that curve rather than a hand-rolled ease-out that would
 * be close. CSS solves it for a transition; a JS tween has to do it itself,
 * because neither of the two things the progress tab animates in JS can be
 * transitioned by CSS — text content is not an animatable property, and the
 * ring's `stroke-dasharray` is a generated list whose *length* changes with the
 * fraction.
 *
 * Its own module rather than a private helper inside `rising-fraction.ts`: the
 * curve is the app's, not that hook's, and keeping it directive-free means
 * anything server-side can read it without being pulled across the client
 * boundary.
 */

/**
 * `x` is monotonic for this curve, so bisection finds the parameter for a given
 * progress with no derivative and no failure case. Twelve halvings put it
 * within 1/4096 of the true value — far finer than a percentage rounded to a
 * whole number can show.
 */
export function easeSweep(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;

  const x1 = 0.2;
  const y1 = 0.6;
  const x2 = 0.2;
  const y2 = 1;

  const bezier = (u: number, p1: number, p2: number): number => {
    const v = 1 - u;
    return 3 * v * v * u * p1 + 3 * v * u * u * p2 + u * u * u;
  };

  let low = 0;
  let high = 1;
  let u = t;

  for (let index = 0; index < 12; index += 1) {
    if (bezier(u, x1, x2) < t) low = u;
    else high = u;
    u = (low + high) / 2;
  }

  return bezier(u, y1, y2);
}

/*
 * There was also a `sweepReaches` here — the curve read backwards, to find when
 * a tween has covered enough of its distance to *look* finished. It existed so
 * the progress tab's streak card could start drawing the moment the ring above
 * it appeared to stop counting. That sequencing is gone (the two now animate
 * together; see the note on the progress page), and with it the only caller.
 *
 * Worth knowing if this comes up again: the reason it was needed is that a
 * decelerating curve has no crisp end, so keying anything off "when part one
 * finishes" means picking a threshold and defending it. A linear ramp would not
 * need one.
 */
