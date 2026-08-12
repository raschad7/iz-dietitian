import { describe, expect, test } from 'bun:test';

import { pageWindow } from './pagination';

describe('pageWindow', () => {
  test('draws every page when they all fit', () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test('elides on the far side when the reader is near the start', () => {
    expect(pageWindow(1, 20)).toEqual([1, 2, 3, 4, 'gap', 20]);
    expect(pageWindow(2, 20)).toEqual([1, 2, 3, 4, 'gap', 20]);
  });

  test('elides on both sides in the middle', () => {
    expect(pageWindow(10, 20)).toEqual([1, 'gap', 9, 10, 11, 'gap', 20]);
  });

  test('elides on the near side when the reader is at the end', () => {
    expect(pageWindow(20, 20)).toEqual([1, 'gap', 17, 18, 19, 20]);
    expect(pageWindow(19, 20)).toEqual([1, 'gap', 17, 18, 19, 20]);
  });

  /**
   * The reason the window's start is clamped rather than its two ends: a window
   * that shrank at the edges would leave you fewer pages to reach in one click
   * from page 1 than from the middle. Five links everywhere — the first, three
   * around you, the last. Only the gap count differs.
   */
  test('offers the same number of page links wherever the reader is', () => {
    const counts = new Set(
      Array.from(
        { length: 20 },
        (_, index) => pageWindow(index + 1, 20).filter((token) => token !== 'gap').length,
      ),
    );
    expect([...counts]).toEqual([5]);
  });

  test('never draws a gap where no page is actually skipped', () => {
    for (let pageCount = 1; pageCount <= 30; pageCount += 1) {
      for (let page = 1; page <= pageCount; page += 1) {
        const tokens = pageWindow(page, pageCount);

        tokens.forEach((token, index) => {
          if (token !== 'gap') return;

          const before = tokens[index - 1];
          const after = tokens[index + 1];
          expect(typeof before).toBe('number');
          expect(typeof after).toBe('number');
          // A gap standing in for nothing is a lie about what was skipped.
          expect((after as number) - (before as number)).toBeGreaterThan(1);
        });
      }
    }
  });

  test('is always ascending, starts at the first page and ends at the last', () => {
    for (let pageCount = 1; pageCount <= 30; pageCount += 1) {
      for (let page = 1; page <= pageCount; page += 1) {
        const numbers = pageWindow(page, pageCount).filter(
          (token): token is number => token !== 'gap',
        );

        expect(numbers[0]).toBe(1);
        expect(numbers.at(-1)).toBe(pageCount);
        expect([...numbers].sort((a, b) => a - b)).toEqual(numbers);
        expect(new Set(numbers).size).toBe(numbers.length);
      }
    }
  });

  /** The page you are on has to be one of the pages drawn, or it cannot be marked. */
  test('always includes the current page', () => {
    for (let pageCount = 1; pageCount <= 30; pageCount += 1) {
      for (let page = 1; page <= pageCount; page += 1) {
        expect(pageWindow(page, pageCount)).toContain(page);
      }
    }
  });
});
