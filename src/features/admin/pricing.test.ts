import { describe, expect, test } from 'bun:test';

import { MODEL_RATES, costMicroUsd, microUsdToUsd, rateFor } from './pricing';

describe('rateFor', () => {
  test('finds a model named exactly as the table writes it', () => {
    expect(rateFor('gpt-4o-mini')).toEqual({ inputPerMillionUsd: 0.15, outputPerMillionUsd: 0.6 });
  });

  /**
   * The case that matters in production and in no test written against the
   * alias: OpenAI resolves `gpt-4o-mini` to a dated snapshot on the way out, so
   * the name this app stores is the one in the reply body, not the one it asked
   * for. An exact lookup would price almost nothing.
   */
  test('matches a dated snapshot the provider resolved the alias to', () => {
    expect(rateFor('gpt-4o-mini-2024-07-18')).toEqual(MODEL_RATES['gpt-4o-mini']!);
  });

  test('is case-insensitive and ignores surrounding space', () => {
    expect(rateFor('  GPT-4o-Mini  ')).toEqual(MODEL_RATES['gpt-4o-mini']!);
  });

  test('returns null for a model nobody has rated', () => {
    expect(rateFor('gpt-5.6-luna')).toBeNull();
    expect(rateFor('some-local-llama')).toBeNull();
  });

  test('returns null for an empty name rather than matching everything', () => {
    // Every key would "match" a prefix test against '' if the guard were missing.
    expect(rateFor('')).toBeNull();
    expect(rateFor('   ')).toBeNull();
  });

  /**
   * The reason the match is longest-prefix rather than first-hit: a family entry
   * must never price a cheaper member of that family at the family's rate.
   */
  test('prefers the most specific entry when two keys both match', () => {
    const table: Record<string, { inputPerMillionUsd: number; outputPerMillionUsd: number }> = MODEL_RATES;
    const restore = { ...table };

    try {
      table['gpt-4o'] = { inputPerMillionUsd: 2.5, outputPerMillionUsd: 10 };

      expect(rateFor('gpt-4o-mini-2024-07-18')).toEqual(restore['gpt-4o-mini']!);
      expect(rateFor('gpt-4o-2024-11-20')).toEqual({ inputPerMillionUsd: 2.5, outputPerMillionUsd: 10 });
    } finally {
      delete table['gpt-4o'];
    }
  });

  test('the local stand-in transport is free, not unrated', () => {
    // It reaches no network. Counting development runs as "could not price"
    // would put a permanent warning on the screen of every local deployment.
    expect(rateFor('console')).toEqual({ inputPerMillionUsd: 0, outputPerMillionUsd: 0 });
  });
});

describe('costMicroUsd', () => {
  /**
   * A rate is dollars per million tokens, so `tokens × rate` is already
   * micro-dollars. This is the assertion that catches a stray factor of a
   * million in either direction.
   */
  test('one million prompt tokens costs exactly the input rate, in micro-dollars', () => {
    expect(costMicroUsd('gpt-4o-mini', 1_000_000, 0)).toBe(150_000);
    expect(microUsdToUsd(150_000)).toBeCloseTo(0.15, 10);
  });

  test('one million completion tokens costs exactly the output rate', () => {
    expect(costMicroUsd('gpt-4o-mini', 0, 1_000_000)).toBe(600_000);
  });

  test('adds both halves', () => {
    // 3,000 prompt + 1,500 completion = 450 + 900 = 1,350 micro-dollars.
    expect(costMicroUsd('gpt-4o-mini', 3_000, 1_500)).toBe(1_350);
  });

  test('reads a missing token count as zero rather than inventing one', () => {
    expect(costMicroUsd('gpt-4o-mini', null, 1_500)).toBe(900);
    expect(costMicroUsd('gpt-4o-mini', null, null)).toBe(0);
  });

  /** The whole point of the null: a dash on the screen, never a guessed figure. */
  test('returns null for an unrated model, even with real token counts', () => {
    expect(costMicroUsd('gpt-5.6-luna', 100_000, 50_000)).toBeNull();
  });

  test('returns an integer, so a column of these adds up exactly', () => {
    const cost = costMicroUsd('gpt-4o-mini', 1_237, 891)!;
    expect(Number.isInteger(cost)).toBe(true);
  });
});
