import { describe, expect, test } from 'bun:test';

import { failureRate, formatCost, formatDuration, formatTokens } from './format';

describe('formatCost', () => {
  test('gives four decimals below a dollar, where two would print $0.00', () => {
    // 28,600 micro-dollars is under three cents — the size a week of plans
    // actually costs, and the reason the column needs the extra digits.
    expect(formatCost('en', 28_600)).toBe('$0.0286');
  });

  test('gives ordinary money above a dollar', () => {
    expect(formatCost('en', 12_500_000)).toBe('$12.50');
  });

  test('is null for an unrated model, so the caller prints a dash', () => {
    expect(formatCost('en', null)).toBeNull();
  });

  /**
   * Zero and "no rate" must stay distinguishable: the local stand-in transport
   * genuinely costs nothing, and that is a different fact from not knowing.
   */
  test('formats a real zero rather than treating it as unknown', () => {
    expect(formatCost('en', 0)).toBe('$0.0000');
  });

  test('is dollars in Arabic too, in Latin digits', () => {
    const arabic = formatCost('ar', 28_600)!;

    expect(arabic).toContain('0.0286');
    // The app forces `numberingSystem: 'latn'` everywhere; see src/lib/format.ts.
    expect(arabic).not.toMatch(/[٠-٩]/);
  });
});

describe('formatTokens', () => {
  test('prints a small count in full, where a compact form would lose detail', () => {
    expect(formatTokens('en', 1_234)).toBe('1,234');
  });

  test('abbreviates once the exact digits stop being comparable', () => {
    // One decimal place, so 190.6K and 188.2K are still distinguishable at a
    // glance — rounding both to 191K and 188K would flatten the comparison the
    // column exists to support.
    expect(formatTokens('en', 190_583)).toBe('190.6K');
  });

  test('switches at ten thousand', () => {
    expect(formatTokens('en', 9_999)).toBe('9,999');
    expect(formatTokens('en', 10_000)).toBe('10K');
  });
});

describe('formatDuration', () => {
  test('reads milliseconds as seconds', () => {
    expect(formatDuration('en', 35_400)).toBe('35.4s');
  });

  test('is null when nothing reported a duration', () => {
    expect(formatDuration('en', null)).toBeNull();
  });

  /**
   * The unit is `Intl`'s, not a `${n}s` template. A Latin "s" glued onto an
   * Arabic number is the kind of thing that never reaches a translation review,
   * because it is not in a message file.
   */
  test('uses the locale’s own unit rather than a hardcoded Latin s', () => {
    const arabic = formatDuration('ar', 35_400)!;

    expect(arabic).toContain('ث');
    expect(arabic).not.toContain('s');
  });
});

describe('failureRate', () => {
  test('is the share of runs that failed', () => {
    expect(failureRate(10, 2)).toBe(0.2);
  });

  test('is zero rather than NaN when nothing has run', () => {
    // A clinic that has never called a model has no failure rate. The screen
    // decides to show a dash on the run count; this must not hand it a NaN.
    expect(failureRate(0, 0)).toBe(0);
  });
});
