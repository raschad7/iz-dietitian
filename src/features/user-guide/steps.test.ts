import { describe, expect, test } from 'bun:test';

import { GUIDE_STEPS, stepHrefForScreen, stepScreenMatches } from './steps';

/**
 * The rule these cover is the one that decides whether the tour navigates, and
 * the interesting half of it is a loop it used to be able to enter.
 *
 * `CalendarViewGuard` replaces `/app/calendar/week` with `/app/calendar/day` on
 * any screen narrower than 48rem. While this predicate was `pathname === href`,
 * the two disagreed forever: the guide pushed `week`, the guard replaced it with
 * `day`, and the guide pushed `week` again — several times a second, for as long
 * as step 9 or 10 was on screen, rebuilding the element the spotlight was
 * measuring on every pass.
 */
describe('stepScreenMatches', () => {
  test('an exact path matches', () => {
    expect(stepScreenMatches('/app/clients', '/app/clients')).toBe(true);
  });

  test('a different screen does not', () => {
    expect(stepScreenMatches('/app/clients', '/app/dishes')).toBe(false);
  });

  test('the calendar accepts the view a phone is redirected to', () => {
    /* The loop, in one assertion. */
    expect(stepScreenMatches('/app/calendar/week', '/app/calendar/day')).toBe(true);
    expect(stepScreenMatches('/app/calendar/week', '/app/calendar/month')).toBe(true);
    expect(stepScreenMatches('/app/calendar/week', '/app/calendar')).toBe(true);
  });

  test('the calendar is still somewhere the tour will navigate to', () => {
    /*
      The fix must not make the predicate so loose that the step stops moving
      anyone: a reader on the register still has to be taken to the calendar.
    */
    expect(stepScreenMatches('/app/calendar/week', '/app/clients')).toBe(false);
    expect(stepScreenMatches('/app/calendar/week', '/app')).toBe(false);
  });

  test('a sibling route that merely starts the same way is not a calendar view', () => {
    expect(stepScreenMatches('/app/calendar/week', '/app/calendar-settings')).toBe(false);
  });

  test('the calendar steps are walked to the day view on a phone', () => {
    /*
      The point of the correction: the week view is never pushed, so it is never
      mounted, painted and replaced under a card the reader is being asked to
      read. `stepScreenMatches` cleaned up after that swap; this stops it.
    */
    expect(stepHrefForScreen('/app/calendar/week', true)).toBe('/app/calendar/day');
  });

  test('a wide screen is left on the view the step asked for', () => {
    expect(stepHrefForScreen('/app/calendar/week', false)).toBe('/app/calendar/week');
  });

  test('every other step goes to its own screen at both widths', () => {
    for (const step of GUIDE_STEPS) {
      if (step.href === '/app/calendar/week') continue;
      expect(stepHrefForScreen(step.href, true)).toBe(step.href);
      expect(stepHrefForScreen(step.href, false)).toBe(step.href);
    }
  });

  test('a corrected href still satisfies the step it came from', () => {
    /*
      The two rules have to agree, or the tour arrives somewhere it will then
      navigate away from — which is the loop wearing a different hat.
    */
    for (const step of GUIDE_STEPS) {
      for (const narrow of [true, false]) {
        const href = stepHrefForScreen(step.href, narrow);
        expect(stepScreenMatches(href, href)).toBe(true);
        expect(stepScreenMatches(step.href, href)).toBe(true);
      }
    }
  });

  test('every step names a screen that satisfies itself', () => {
    /*
      A step whose own href did not match would navigate on every render — the
      same loop by a different route.
    */
    for (const step of GUIDE_STEPS) {
      expect(stepScreenMatches(step.href, step.href)).toBe(true);
    }
  });
});
