import { describe, expect, test } from 'bun:test';

import {
  actionSpec,
  ADMIN_ACTIONS,
  escapeLike,
  isUsableReason,
  REASON_MAX_LENGTH,
  REASON_MIN_LENGTH,
  requiresReason,
} from './audit-rules';

/**
 * The rules the log enforces, asserted without a database.
 *
 * `writeAudit` and the two read functions connect to Postgres, so they are
 * exercised by the live checks rather than here. What is here is the part that
 * decides whether a privileged action is allowed to proceed at all.
 */

describe('the action registry', () => {
  test('every verb declares a target', () => {
    for (const spec of ADMIN_ACTIONS) {
      expect(['clinic', 'account', 'food', 'plan']).toContain(spec.target);
    }
  });

  /**
   * The rule that makes the log worth keeping. Anything that takes something
   * away from somebody who cannot undo it and cannot see who did it must carry
   * a reason.
   */
  test('every destructive verb requires a reason', () => {
    for (const spec of ADMIN_ACTIONS) {
      if (spec.destructive) expect(spec.requiresReason).toBe(true);
    }
  });

  /**
   * And the mirror of it. Making it as costly to give access back as to take it
   * away is how a panel ends up with clinics left suspended because nobody had a
   * sentence ready.
   */
  test('restoring access never requires one', () => {
    expect(requiresReason('clinic.reactivate')).toBe(false);
    expect(requiresReason('account.enable')).toBe(false);
  });

  test('promotion requires one even though it destroys nothing', () => {
    // It hands somebody the keys to every clinic on the deployment.
    expect(requiresReason('account.promote')).toBe(true);
  });

  test('an unknown verb has no spec and requires nothing', () => {
    // `action` is a text column: a row written by an older build has to be
    // readable, not fatal.
    expect(actionSpec('clinic.explode')).toBeUndefined();
    expect(requiresReason('clinic.explode')).toBe(false);
  });
});

describe('isUsableReason', () => {
  test('takes a real sentence', () => {
    expect(isUsableReason('Non-payment since June, three reminders sent.')).toBe(true);
  });

  /**
   * A required field with no floor is a field people type `x` into on the day
   * they are in a hurry — which is precisely the day the reason matters.
   */
  test('refuses a keystroke', () => {
    expect(isUsableReason('x')).toBe(false);
    expect(isUsableReason('ok')).toBe(false);
  });

  test('whitespace is not a reason', () => {
    expect(isUsableReason('          ')).toBe(false);
    expect(isUsableReason(null)).toBe(false);
    expect(isUsableReason(undefined)).toBe(false);
  });

  test('exactly the minimum passes', () => {
    expect(isUsableReason('a'.repeat(REASON_MIN_LENGTH))).toBe(true);
    expect(isUsableReason('a'.repeat(REASON_MIN_LENGTH - 1))).toBe(false);
  });

  test('an essay pasted by accident does not', () => {
    expect(isUsableReason('a'.repeat(REASON_MAX_LENGTH + 1))).toBe(false);
  });

  test('the length is measured after trimming', () => {
    expect(isUsableReason('   spam   ')).toBe(false);
    expect(isUsableReason('   spammer   ')).toBe(true);
  });
});

describe('escapeLike', () => {
  /**
   * Not a security hole — the value is still a bound parameter, so there is no
   * injection here. It is a correctness one: without this, a search for a reason
   * containing `%` matches every row, and a search that silently returns
   * everything is a search nobody can trust. All three platform screens had it
   * wrong before the log existed to notice.
   */
  test('neutralises the wildcards LIKE gives meaning to', () => {
    expect(escapeLike('100%')).toBe('100\\%');
    expect(escapeLike('a_b')).toBe('a\\_b');
  });

  /** The backslash goes first, or it escapes the escapes added after it. */
  test('escapes the escape character before anything else', () => {
    expect(escapeLike('a\\%b')).toBe('a\\\\\\%b');
  });

  test('leaves ordinary text alone, in either script', () => {
    expect(escapeLike('dietitian@clinic.ps')).toBe('dietitian@clinic.ps');
    expect(escapeLike('عيادة النور')).toBe('عيادة النور');
  });
});
