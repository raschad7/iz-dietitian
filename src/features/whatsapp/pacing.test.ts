import { afterEach, describe, expect, test } from 'bun:test';

import { paceSend, resetSendPacing } from './pacing';

/**
 * Timing tests, so the numbers are deliberately small: a 40ms gap is long
 * enough to measure on a loaded CI box and short enough that the suite does not
 * notice it. The assertions allow a few milliseconds of slack in the direction
 * a timer can only err — late, never early.
 */

const CLINIC = 'clinic-a';
const OTHER = 'clinic-b';
const GAP = 40;

const exactly = (spacingMs: number) => ({ spacingMs, jitterMs: 0 });

afterEach(() => {
  resetSendPacing();
});

function now(): number {
  return Date.now();
}

describe('paceSend', () => {
  test('sends the first message for a clinic immediately', async () => {
    const started = now();

    await paceSend(CLINIC, exactly(GAP), async () => 'sent');

    expect(now() - started).toBeLessThan(GAP);
  });

  test('holds the second message for the gap', async () => {
    const started = now();

    await paceSend(CLINIC, exactly(GAP), async () => 'first');
    await paceSend(CLINIC, exactly(GAP), async () => 'second');

    expect(now() - started).toBeGreaterThanOrEqual(GAP);
  });

  test('serializes overlapping sends and keeps their order', async () => {
    const order: string[] = [];
    const started = now();

    await Promise.all([
      paceSend(CLINIC, exactly(GAP), async () => void order.push('first')),
      paceSend(CLINIC, exactly(GAP), async () => void order.push('second')),
      paceSend(CLINIC, exactly(GAP), async () => void order.push('third')),
    ]);

    expect(order).toEqual(['first', 'second', 'third']);
    // Two gaps for three messages: the first one does not wait.
    expect(now() - started).toBeGreaterThanOrEqual(GAP * 2);
  });

  test('paces each clinic on its own, since each owns a number', async () => {
    const started = now();

    await Promise.all([
      paceSend(CLINIC, exactly(GAP), async () => 'a'),
      paceSend(OTHER, exactly(GAP), async () => 'b'),
    ]);

    expect(now() - started).toBeLessThan(GAP);
  });

  test('a failed send still holds the queue open for the next one', async () => {
    const started = now();

    await expect(
      paceSend(CLINIC, exactly(GAP), async () => {
        throw new Error('the gateway refused');
      }),
    ).rejects.toThrow('the gateway refused');

    await paceSend(CLINIC, exactly(GAP), async () => 'next');

    expect(now() - started).toBeGreaterThanOrEqual(GAP);
  });

  test('sends without waiting when spacing is zero', async () => {
    const started = now();

    await paceSend(CLINIC, exactly(0), async () => 'first');
    await paceSend(CLINIC, exactly(0), async () => 'second');

    expect(now() - started).toBeLessThan(GAP);
  });

  test('adds jitter on top of the gap, never below it', async () => {
    const started = now();

    await paceSend(CLINIC, { spacingMs: GAP, jitterMs: GAP }, async () => 'first');
    await paceSend(CLINIC, { spacingMs: GAP, jitterMs: GAP }, async () => 'second');

    expect(now() - started).toBeGreaterThanOrEqual(GAP);
  });

  test('returns what the send returned', async () => {
    await expect(paceSend(CLINIC, exactly(0), async () => ({ messageId: 'wa-1' }))).resolves.toEqual({
      messageId: 'wa-1',
    });
  });
});
