import { describe, expect, test } from 'bun:test';

import { greetingKey } from './greeting';

describe('greetingKey', () => {
  test('splits the day at noon and at five', () => {
    expect(greetingKey(0)).toBe('morning');
    expect(greetingKey(11 * 60 + 59)).toBe('morning');
    expect(greetingKey(12 * 60)).toBe('afternoon');
    expect(greetingKey(16 * 60 + 59)).toBe('afternoon');
    expect(greetingKey(17 * 60)).toBe('evening');
    expect(greetingKey(23 * 60 + 59)).toBe('evening');
  });

  test('folds a wrapped clock back into the day rather than failing', () => {
    expect(greetingKey(24 * 60)).toBe('morning');
    expect(greetingKey(-60)).toBe('evening');
  });
});
