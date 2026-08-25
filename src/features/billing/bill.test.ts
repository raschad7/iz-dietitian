import { describe, expect, test } from 'bun:test';

import {
  batchNumbers,
  billFileName,
  billNumber,
  compareEntries,
  entryTotals,
  statementFileName,
  type BillEntry,
} from './bill';

/**
 * The parts of a bill that are arithmetic or identity, tested without a
 * database or a renderer.
 *
 * What is *not* tested here is the PDF itself. A snapshot of a binary tells you
 * that something changed, never whether the page is right, and the questions
 * worth asking about that page — does Arabic join, does the total foot — are a
 * reader's questions. The numbers behind it are here instead, where a wrong
 * answer is a failing assertion rather than a misprinted receipt.
 */

function entry(over: Partial<BillEntry> = {}): BillEntry {
  return {
    id: '1f3a9c2e-0000-4000-8000-000000000001',
    kind: 'charge',
    occurredOn: '2026-08-24',
    amountMinor: 27000,
    description: 'Follow-up visit',
    method: null,
    note: null,
    createdAt: new Date('2026-08-24T09:00:00Z'),
    ...over,
  };
}

describe('billNumber', () => {
  test(`is eight characters of the row's own id, split by a dash`, () => {
    expect(billNumber(entry())).toBe('1F3A-9C2E');
    /* Eight characters and the separator between them. */
    expect(billNumber(entry()).replace('-', '')).toHaveLength(8);
  });

  test('is stable — the same row reprints with the same number', () => {
    expect(billNumber(entry())).toBe(billNumber(entry()));
  });

  test('two rows get different numbers', () => {
    const a = billNumber(entry());
    const b = billNumber(entry({ id: '9b2d7e11-0000-4000-8000-000000000002' }));

    expect(a).not.toBe(b);
  });

  /*
    Latin digits and A-F, upper case — it is read out on the phone and written
    on receipts, so it cannot change shape with the interface language or
    depend on anybody's case-sensitivity.
  */
  test('is upper-case hexadecimal in two groups of four', () => {
    expect(billNumber(entry())).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
  });

  /*
    The date and the CHG/PAY prefix are gone at this length. Nothing else about
    the entry may creep back into the number: it is a function of the id alone,
    so a row that is re-read with a different shape still prints the same
    reference.
  */
  test('depends on nothing but the id', () => {
    expect(billNumber(entry({ kind: 'payment', occurredOn: '2020-01-01' }))).toBe(billNumber(entry()));
  });
});

describe('compareEntries', () => {
  test('newest day first', () => {
    const older = entry({ occurredOn: '2026-08-01' });
    const newer = entry({ occurredOn: '2026-08-24' });

    expect([older, newer].sort(compareEntries)).toEqual([newer, older]);
  });

  test('same day falls back to the order they were entered, latest first', () => {
    const first = entry({ id: 'a', createdAt: new Date('2026-08-24T09:00:00Z') });
    const second = entry({ id: 'b', createdAt: new Date('2026-08-24T15:00:00Z') });

    expect([first, second].sort(compareEntries)).toEqual([second, first]);
  });

  test('is total — two rows entered in the same instant still order', () => {
    const a = entry({ id: 'a' });
    const b = entry({ id: 'b' });

    expect([a, b].sort(compareEntries)).toEqual([b, a]);
    expect([b, a].sort(compareEntries)).toEqual([b, a]);
  });
});

describe('entryTotals', () => {
  test('foots charges and payments separately', () => {
    const totals = entryTotals([
      entry({ id: 'a', amountMinor: 27000 }),
      entry({ id: 'b', amountMinor: 13000 }),
      entry({ id: 'c', kind: 'payment', amountMinor: 30000 }),
    ]);

    expect(totals.chargedMinor).toBe(40000);
    expect(totals.paidMinor).toBe(30000);
    expect(totals.balanceMinor).toBe(10000);
    expect(totals.remainingMinor).toBe(10000);
  });

  /* A refund is a negative payment — see the schema. It has to reduce what has
     been received rather than count as more money in. */
  test('a refund nets off the payments', () => {
    const totals = entryTotals([
      entry({ id: 'a', amountMinor: 27000 }),
      entry({ id: 'b', kind: 'payment', amountMinor: 27000 }),
      entry({ id: 'c', kind: 'payment', amountMinor: -7000 }),
    ]);

    expect(totals.paidMinor).toBe(20000);
    expect(totals.remainingMinor).toBe(7000);
  });

  test('a subscriber in credit owes nothing but the balance still says so', () => {
    const totals = entryTotals([
      entry({ id: 'a', amountMinor: 10000 }),
      entry({ id: 'b', kind: 'payment', amountMinor: 15000 }),
    ]);

    expect(totals.balanceMinor).toBe(-5000);
    expect(totals.remainingMinor).toBe(0);
  });

  test('an empty ledger is all zeroes, not a crash', () => {
    expect(entryTotals([])).toEqual({
      chargedMinor: 0,
      paidMinor: 0,
      balanceMinor: 0,
      remainingMinor: 0,
    });
  });
});

describe('file names', () => {
  test('a bill is named by its number', () => {
    expect(billFileName(entry())).toBe('BILL-1F3A-9C2E.pdf');
  });

  test('a statement is named by the subscriber and the day it was produced', () => {
    expect(statementFileName('1f3a9c2e-0000-4000-8000-000000000001', '2026-08-24')).toBe(
      'STATEMENT-20260824-1F3A9C.pdf',
    );
  });

  /* Both go into a `Content-Disposition` header, which has no room for a quote,
     a newline or an Arabic name. Nothing in either is taken from user input. */
  test('are ASCII and quote-free', () => {
    expect(billFileName(entry())).toMatch(/^[A-Z0-9-]+\.pdf$/);
    expect(statementFileName('1f3a9c2e-0000-4000-8000-000000000001', '2026-08-24')).toMatch(/^[A-Z0-9-]+\.pdf$/);
  });
});

describe('batchNumbers', () => {
  const day = (occurredOn: string, id: string) => entry({ id, occurredOn, createdAt: new Date(`${occurredOn}T09:00:00Z`) });

  test('counts from the oldest, whatever order the list arrives in', () => {
    const entries = [day('2026-08-24', 'c'), day('2026-07-02', 'a'), day('2026-08-01', 'b')];
    const numbers = batchNumbers(entries);

    expect(numbers.get('a')).toBe(1);
    expect(numbers.get('b')).toBe(2);
    expect(numbers.get('c')).toBe(3);
  });

  /* The whole point of counting from the oldest: a number, once printed on a
     receipt, must still mean the same bill after the next one is recorded. */
  test('a new bill does not renumber the ones before it', () => {
    const existing = [day('2026-07-02', 'a'), day('2026-08-01', 'b')];
    const after = batchNumbers([day('2026-08-24', 'c'), ...existing]);

    expect(after.get('a')).toBe(1);
    expect(after.get('b')).toBe(2);
  });

  /* One sequence over the whole ledger, not one per kind — a charge and a
     payment that both called themselves "3" would need the row beside them to
     say which "3" they were. */
  test('charges and payments share one sequence', () => {
    const numbers = batchNumbers([
      { ...day('2026-07-02', 'a'), kind: 'charge' },
      { ...day('2026-07-05', 'b'), kind: 'payment' },
      { ...day('2026-07-09', 'c'), kind: 'charge' },
    ]);

    expect([numbers.get('a'), numbers.get('b'), numbers.get('c')]).toEqual([1, 2, 3]);
  });

  test('an empty ledger numbers nothing', () => {
    expect(batchNumbers([]).size).toBe(0);
  });
});
