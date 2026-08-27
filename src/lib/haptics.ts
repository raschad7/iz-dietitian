/**
 * The tick's own touch: a single short buzz for marking a meal eaten.
 *
 * The third channel of the same confirmation. `MealCheckMark` draws the tick,
 * `playMealFillSound` pours it, and this is what a thumb feels — the three fire
 * together from one click handler so that a client who has their phone on
 * silent, or who is not looking straight at the control, still gets an answer
 * that the tap landed.
 *
 * Same posture as the sound helpers beside it (`meal-fill-sound.ts`,
 * `celebration-chime.ts`, `flame-claim-sound.ts`): a plain function, called
 * from inside the gesture, and every failure swallowed. A phone that cannot
 * buzz costs nothing; breaking the tick itself over a haptics glitch would.
 *
 * ## What it deliberately is not
 *
 * **Not a pattern.** `navigator.vibrate` takes an array — buzz, pause, buzz —
 * and every one of those reads as an *alert*: a phone insisting on attention.
 * This is an acknowledgement of something the client just did on purpose, so it
 * is one pulse, short enough to feel like the control's own click rather than a
 * notification.
 *
 * **Not on uncheck.** `MealCheck` calls this only when a meal is being marked
 * eaten, exactly as it does the sound — unticking is a correction, not a second
 * helping, and confirming a correction with the same flourish as an achievement
 * reads as the app celebrating a mistake.
 *
 * ⚠ **iOS does not implement the Vibration API at all** — not in Safari, not in
 * an installed PWA, not in Chrome or Firefox on an iPhone (all of which are
 * WebKit underneath). `navigator.vibrate` is simply undefined there, so this
 * returns without doing anything and an iPhone gets the tick and the sound
 * only. That is a platform limit rather than something to work around: the
 * approaches that fake it — driving a hidden `<input type="checkbox" switch>`
 * to borrow the system's own haptic — depend on an implementation detail Apple
 * has never documented, and a control that silently buzzes when a stylesheet
 * changes is worse than no buzz at all.
 *
 * Desktop browsers with no vibration hardware also expose the function and
 * simply do nothing with it, which is the specified behaviour and needs no
 * branch here.
 */

/**
 * Milliseconds. Android's own selection tick is around this long, and the
 * length is the whole difference between "the control clicked" and "your phone
 * wants something": past about 30ms a pulse stops reading as part of the button
 * and starts reading as a message. Some devices round very short durations up
 * to their motor's minimum, which is why this is not lower.
 */
const TICK_MS = 12;

/**
 * One short pulse, if this device can.
 *
 * ⚠ **Must be called from inside a user gesture.** Chrome ignores
 * `navigator.vibrate` on a page the client has never interacted with, and
 * silently — there is no error and no rejected promise to catch. Calling it
 * from an effect, a timer or a server response would look correct and do
 * nothing. Every call site is a click handler for that reason.
 *
 * `prefers-reduced-motion` is deliberately **not** consulted, which is the one
 * choice here worth stating. That setting is about animation the app plays *at*
 * the reader; this is 12ms of feedback answering a deliberate tap, and it is
 * the accessible channel for anyone who cannot rely on the drawn tick or the
 * sound. The sound helpers beside this one make the same call. Anyone who
 * wants a client-facing switch for it should put it on the notifications
 * settings screen, not behind a media query that means something else.
 */
export function vibrateTick(): void {
  if (typeof navigator === 'undefined') return;

  // Not optional chaining: `vibrate` is non-optional in `lib.dom`, so TypeScript
  // would reject `?.()` — and it is genuinely absent on every WebKit browser,
  // so the check is a runtime necessity rather than defensive decoration.
  if (typeof navigator.vibrate !== 'function') return;

  try {
    navigator.vibrate(TICK_MS);
  } catch {
    // A device that refuses — a permissions policy, a driver that is unhappy.
    // No feedback this time; see the module doc.
  }
}
