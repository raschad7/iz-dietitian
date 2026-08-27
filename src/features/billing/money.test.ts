import { describe, expect, test } from 'bun:test';

import {
  MAX_AMOUNT_MINOR,
  balanceState,
  formatAmount,
  formatAmountCompact,
  formatKeypad,
  keypadReadout,
  parseAmount,
  paymentStatus,
  subscriberTotals,
  sumAmounts,
  toAmountInput,
  toKeypadDigits,
} from './money';

describe('parseAmount', () => {
  test('reads a whole number of shekels as agorot', () => {
    expect(parseAmount('270')).toBe(27000);
  });

  test('reads both decimal places', () => {
    expect(parseAmount('270.50')).toBe(27050);
  });

  test('pads a single decimal place rather than reading it as agorot', () => {
    // `270.5` is ₪270.50, not ₪270.05.
    expect(parseAmount('270.5')).toBe(27050);
  });

  /*
    The case the digit-by-digit arithmetic exists for: `19.99 * 100` is
    1998.9999999999998 in IEEE 754, so a float multiply here rounds a real
    invoice down by an agora.
  */
  test('does not lose an agora to floating point', () => {
    expect(parseAmount('19.99')).toBe(1999);
    expect(parseAmount('1234.56')).toBe(123456);
  });

  test('reads Arabic-Indic digits and the Arabic decimal separator', () => {
    expect(parseAmount('٢٧٠٫٥٠')).toBe(27050);
    expect(parseAmount('٤٢')).toBe(4200);
  });

  test('reads the Persian digits some keyboards emit', () => {
    expect(parseAmount('۲۷۰')).toBe(27000);
  });

  test('ignores grouping separators and surrounding space', () => {
    expect(parseAmount(' 1,250.00 ')).toBe(125000);
    expect(parseAmount('1٬250')).toBe(125000);
  });

  test('keeps the sign, because a refund is a negative payment', () => {
    expect(parseAmount('-150')).toBe(-15000);
    expect(parseAmount('+150')).toBe(15000);
  });

  /*
    A third decimal place is rejected, not rounded. Silently turning what
    somebody typed into a different amount is worse than telling them.
  */
  test('rejects more precision than a shekel has', () => {
    expect(parseAmount('12.345')).toBeNull();
  });

  test('rejects anything that is not a number', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('   ')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('12.')).toBeNull();
    expect(parseAmount('.5')).toBeNull();
    expect(parseAmount('1-2')).toBeNull();
  });

  test('rejects an amount the integer column could not hold', () => {
    expect(parseAmount(String(MAX_AMOUNT_MINOR / 100 + 1))).toBeNull();
  });
});

describe('toAmountInput', () => {
  test('always writes both decimal places', () => {
    expect(toAmountInput(27000)).toBe('270.00');
    expect(toAmountInput(27050)).toBe('270.50');
    expect(toAmountInput(27005)).toBe('270.05');
  });

  test('round-trips through parseAmount', () => {
    for (const minor of [0, 1, 99, 100, 1999, 123456]) {
      expect(parseAmount(toAmountInput(minor))).toBe(minor);
    }
  });

  test('keeps a refund negative', () => {
    expect(toAmountInput(-15000)).toBe('-150.00');
    expect(parseAmount(toAmountInput(-15000))).toBe(-15000);
  });
});

describe('formatAmount', () => {
  test('draws Latin digits in both locales', () => {
    for (const locale of ['ar', 'en'] as const) {
      const drawn = formatAmount(locale, 27050);
      expect(drawn).toContain('270.50');
      // Never Arabic-Indic — see `toIntlLocale` in src/lib/format.ts.
      expect(drawn).not.toMatch(/[٠-٩]/);
    }
  });

  /*
    The symbol leads in both languages. Left to `Intl`, English puts it first
    and Arabic puts it last — one clinic's screen drawing the same amount two
    ways, and a money column whose symbol changes ends when the language does.
  */
  test('puts the currency symbol in front, in both locales', () => {
    for (const locale of ['ar', 'en'] as const) {
      expect(formatAmount(locale, 27050)).toBe('₪270.50');
    }
  });

  /* Outside the symbol, where English already had it — `₪-70.00` reads as an
     amount with something odd in it rather than as a negative one. */
  test('a refund keeps its sign outside the symbol', () => {
    expect(formatAmount('ar', -7000)).toBe('-₪70.00');
  });

  /* Two places always, so the decimal points line up down a column. */
  test('always shows the agorot', () => {
    expect(formatAmount('en', 27000)).toBe('₪270.00');
    expect(formatAmount('en', 0)).toBe('₪0.00');
  });

  /*
    No direction marks. `Intl`'s own Arabic currency string starts with a U+200F
    that reorders the figure inside a cell that has already declared `dir`; this
    one is assembled, so there is nothing to strip.
  */
  test('carries no bidirectional control characters', () => {
    expect(formatAmount('ar', 27050)).not.toMatch(/[‎‏؜⁦-⁩]/);
  });
});

describe('sumAmounts', () => {
  test('an empty ledger sums to nothing, not to NaN', () => {
    expect(sumAmounts([])).toBe(0);
  });

  test('adds exactly', () => {
    expect(sumAmounts([1999, 1999, 1999])).toBe(5997);
  });
});

describe('subscriberTotals', () => {
  test('a subscriber who has paid nothing owes everything', () => {
    expect(subscriberTotals(27000, 0)).toEqual({
      chargedMinor: 27000,
      paidMinor: 0,
      balanceMinor: 27000,
      remainingMinor: 27000,
    });
  });

  test('a settled account has nothing remaining', () => {
    expect(subscriberTotals(27000, 27000)).toEqual({
      chargedMinor: 27000,
      paidMinor: 27000,
      balanceMinor: 0,
      remainingMinor: 0,
    });
  });

  /*
    The distinction the two columns exist for: someone who paid up front has a
    negative balance — the clinic holds their money — and nothing left to
    collect. Clamping the balance too would make that read as settled.
  */
  test('an overpayment shows as credit on the balance and nothing to collect', () => {
    expect(subscriberTotals(27000, 30000)).toEqual({
      chargedMinor: 27000,
      paidMinor: 30000,
      balanceMinor: -3000,
      remainingMinor: 0,
    });
  });
});

describe('balanceState', () => {
  test('names the three positions an account can be in', () => {
    expect(balanceState(1)).toBe('owing');
    expect(balanceState(0)).toBe('settled');
    expect(balanceState(-1)).toBe('credit');
  });
});

describe('paymentStatus', () => {
  const status = (charged: number, paid: number) => paymentStatus(subscriberTotals(charged, paid));

  /*
    The state a naive "balance is zero means paid" would get wrong. A new
    subscriber has never been billed, so every row in a fresh register would
    otherwise wear a settled badge.
  */
  test('an untouched account is not a settled one', () => {
    expect(status(0, 0)).toBe('none');
  });

  test('billed and nothing received', () => {
    expect(status(27000, 0)).toBe('unpaid');
  });

  /*
    The distinction the column exists for: both of these owe money, and only one
    of them is being chased.
  */
  test('part paid is its own state, not just owing', () => {
    expect(status(27000, 10000)).toBe('partial');
    expect(status(27000, 26999)).toBe('partial');
  });

  test('paid in full', () => {
    expect(status(27000, 27000)).toBe('paid');
  });

  test('paid ahead reads as credit', () => {
    expect(status(27000, 30000)).toBe('credit');
    // A payment against no charge at all is still credit, not `none`.
    expect(status(0, 5000)).toBe('credit');
  });

  /*
    A refund that outruns the payments leaves money owed and nothing actually
    received, so it is not "partly paid".
  */
  test('a refund that cancels the payments is unpaid, not partial', () => {
    expect(status(27000, 0)).toBe('unpaid');
    expect(status(27000, -5000)).toBe('unpaid');
  });

  test('every state is reachable and they are mutually exclusive', () => {
    const seen = new Set([
      status(0, 0),
      status(27000, 0),
      status(27000, 10000),
      status(27000, 27000),
      status(27000, 30000),
    ]);

    expect([...seen].sort()).toEqual(['credit', 'none', 'paid', 'partial', 'unpaid']);
  });
});

describe('the payment keypad', () => {
  const shown = (digits: string) => formatKeypad('en', toKeypadDigits(digits));

  /* Every key is a shekel. A clinic says "two hundred and fifty"; a keypad that
     answers the first two keys with ₪0.02 is one nobody trusts mid-amount. */
  test('the figure grows leftwards, key by key', () => {
    expect(shown('1')).toBe('1');
    expect(shown('10')).toBe('10');
    expect(shown('100')).toBe('100');
    expect(shown('1000')).toBe('1,000');
    expect(shown('10000')).toBe('10,000');
    expect(shown('100000')).toBe('100,000');
    expect(shown('1000000')).toBe('1,000,000');
  });

  /* Any figure between them, not only the round ones. */
  test('anything in between reads the same way', () => {
    expect(shown('250')).toBe('250');
    expect(shown('1205')).toBe('1,205');
    expect(shown('99999')).toBe('99,999');
  });

  /* The agorot are the shape a shekel amount is written in, not two places
     waiting for a key. No number of keystrokes reaches them. */
  /* The `0.00` is the placeholder's, and it goes the moment a key lands — the
     agorot are not a place the keypad fills, so leaving them behind would be
     two zeros the reader neither typed nor can change. */
  test('a figure carries no decimals of its own', () => {
    for (const typed of ['1', '99', '10000', '1000000', '9999999']) {
      expect(shown(typed)).not.toContain('.');
    }
  });

  test('seven keys, and the largest figure they make', () => {
    expect(toKeypadDigits('9999999')).toHaveLength(7);
    expect(shown('9999999')).toBe('9,999,999');
  });

  /* The eighth key does nothing at all — the figure is not truncated from the
     front, which would invent an amount nobody typed. */
  test('an eighth key is refused', () => {
    expect(toKeypadDigits('99999999')).toBe('9999999');
  });

  test('a leading zero cannot push a digit off the end', () => {
    expect(toKeypadDigits('000250')).toBe('250');
  });

  test('an Arabic keypad produces the same readout', () => {
    expect(formatKeypad('ar', toKeypadDigits('٢٥٠'))).toBe('250');
  });

  /*
    The two halves of the readout: the amount in ink, the agorot in grey.
    Together they are the value the form posts, which is why they are one pair
    rather than two formattings that could disagree.
  */
  describe('what is keyed and what is only the shape of an amount', () => {
    test('an untouched card is all grey', () => {
      expect(keypadReadout('en', '')).toEqual({ entered: '', pending: '0.00' });
    });

    test('one key clears the placeholder entirely', () => {
      expect(keypadReadout('en', '1')).toEqual({ entered: '1', pending: '' });
      expect(keypadReadout('en', '100000')).toEqual({ entered: '100,000', pending: '' });
      expect(keypadReadout('en', '9999999')).toEqual({ entered: '9,999,999', pending: '' });
    });

  });

  /* The readout is what the form posts, so the parser has to read it back —
     grouping marks and all. */
  test('what it draws, parseAmount reads', () => {
    expect(parseAmount(shown('1'))).toBe(100);
    expect(parseAmount(shown('1205'))).toBe(120_500);
    expect(parseAmount(shown('9999999'))).toBe(999_999_900);
  });
});

describe('formatAmountCompact', () => {
  /* The payment card's answer line: ₪1,000, not ₪1,000.00. */
  test('drops the agorot when there are none', () => {
    expect(formatAmountCompact('en', 0)).toBe('₪0');
    expect(formatAmountCompact('en', 100)).toBe('₪1');
    expect(formatAmountCompact('en', 100_000)).toBe('₪1,000');
  });

  /* Two places or none: fifty agorot is `₪1.50`, not `₪1.5`. */
  test('keeps them when they were keyed', () => {
    expect(formatAmountCompact('en', 9_999_999)).toBe('₪99,999.99');
    expect(formatAmountCompact('en', 150)).toBe('₪1.50');
    expect(formatAmountCompact('en', 27_050)).toBe('₪270.50');
  });

  test('a refund keeps its sign outside the symbol', () => {
    expect(formatAmountCompact('en', -7000)).toBe('-₪70');
  });
});

/*
  The keystroke round trip, which is where the card went wrong: the field holds
  only the keyed figure, and what it holds has to be re-readable as the same
  digits. When the grey `.00` was part of the value, those two zeros came back
  as keystrokes and every press multiplied the amount by a hundred.
*/
describe('typing into the payment card', () => {
  const press = (digits: string, key: string) =>
    toKeypadDigits(`${keypadReadout('en', digits).entered}${key}`);

  test('a key adds one digit, never three', () => {
    expect(press('', '1')).toBe('1');
    expect(press('1', '0')).toBe('10');
    expect(press('10', '0')).toBe('100');
    expect(press('100', '0')).toBe('1000');
  });

  test('the grouping mark is not read back as a digit', () => {
    expect(keypadReadout('en', '1000').entered).toBe('1,000');
    expect(press('1000', '5')).toBe('10005');
  });

  test('any figure can be reached, not only the round ones', () => {
    expect(press('120', '5')).toBe('1205');
    expect(press('24', '9')).toBe('249');
  });
});
