'use client';

import { useCallback, useSyncExternalStore } from 'react';

import { BILLS_COLUMNS, type BillsColumn, type BillsColumnKey } from './bills-columns';

/**
 * The order this browser keeps the Bills columns in.
 *
 * A dietitian chasing unpaid balances reads Remaining and the phone number; one
 * reconciling the drawer reads Total payment. Both are the same screen, and
 * which column belongs at the start of it is a question only the person using
 * it can answer — so they drag them, and the answer is remembered.
 *
 * ## Why the browser and not the database
 *
 * This is a view preference, not a fact about the clinic. Storing it would mean
 * a column, a migration, a write on every drag and a server round trip in the
 * middle of a gesture — for something with no meaning outside the machine it
 * was set on. `localStorage` is where a preference of this kind belongs, and
 * the failure mode is the mild one: a new browser starts from the default
 * order.
 *
 * ## `useSyncExternalStore`, not an effect
 *
 * `localStorage` is an external store, and this is the hook for reading one
 * during render — the same construction `DismissibleCallout` uses, for the same
 * reasons. The server snapshot is the default order, so the server renders the
 * columns as declared and the browser's own order arrives at hydration. The
 * header and every row read it from here, so they cannot disagree about which
 * column is which.
 *
 * Subscribing picks up `storage` as well, so dragging a column in one tab moves
 * it in every other tab showing the screen.
 *
 * ## The stored value is never trusted
 *
 * What comes back out is filtered against {@link BILLS_COLUMNS} and then has
 * any missing column appended. That is what makes adding or renaming a column
 * safe: a reader who dragged their columns last month does not get a table with
 * a hole in it, or one missing the column that was added since.
 */

const STORAGE_KEY = 'qiwam.bills.columns';

const DEFAULT_ORDER: BillsColumnKey[] = BILLS_COLUMNS.map((column) => column.key);

const listeners = new Set<() => void>();

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  /* The cross-tab half. `localStorage` does not fire `storage` in the tab that
     wrote it, which is what the listener set above is for. */
  window.addEventListener('storage', onStoreChange);

  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener('storage', onStoreChange);
  };
}

function isKey(value: unknown): value is BillsColumnKey {
  return typeof value === 'string' && DEFAULT_ORDER.includes(value as BillsColumnKey);
}

/**
 * Repairs whatever is in storage into a complete, duplicate-free order.
 *
 * Kept whole: known keys in the order they were stored, then anything the
 * stored value did not mention, in the default order.
 */
function reconcile(stored: readonly unknown[]): BillsColumnKey[] {
  const kept: BillsColumnKey[] = [];

  for (const value of stored) {
    if (isKey(value) && !kept.includes(value)) kept.push(value);
  }

  return [...kept, ...DEFAULT_ORDER.filter((key) => !kept.includes(key))];
}

/*
  Cached, because `useSyncExternalStore` compares snapshots by identity and
  parsing on every call would hand React a new array each render — an infinite
  loop rather than a re-render. The cache is invalidated by the raw string it
  was parsed from, so another tab's write is still picked up.
*/
let cachedRaw: string | null = null;
let cachedOrder: BillsColumnKey[] = DEFAULT_ORDER;

function readOrder(): BillsColumnKey[] {
  let raw: string | null = null;

  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    /* Storage blocked — a Safari private window, or site data turned off. The
       default order is a working screen, so this is not worth reporting. */
    return DEFAULT_ORDER;
  }

  if (raw === cachedRaw) return cachedOrder;

  cachedRaw = raw;

  if (!raw) {
    cachedOrder = DEFAULT_ORDER;
    return cachedOrder;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    cachedOrder = Array.isArray(parsed) ? reconcile(parsed) : DEFAULT_ORDER;
  } catch {
    cachedOrder = DEFAULT_ORDER;
  }

  return cachedOrder;
}

function writeOrder(order: readonly BillsColumnKey[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  } catch {
    /* Nothing to do but carry on. The move still applies to this view; it will
       be back in the default order next load, which is honest. */
  }

  for (const listener of listeners) listener();
}

/** The default order on the server, so the first paint is not a guess. */
function serverSnapshot(): BillsColumnKey[] {
  return DEFAULT_ORDER;
}

export function useBillsColumns(): {
  columns: BillsColumn[];
  /** Moves `key` to the position `to`, counted in the current order. */
  move: (key: BillsColumnKey, to: number) => void;
  /** Back to the order the columns are declared in. */
  reset: () => void;
  /** Whether anything has been moved — what the reset control listens to. */
  moved: boolean;
} {
  const order = useSyncExternalStore(subscribe, readOrder, serverSnapshot);

  const move = useCallback(
    (key: BillsColumnKey, to: number) => {
      const current = readOrder();
      const from = current.indexOf(key);
      if (from < 0 || from === to) return;

      const next = [...current];
      next.splice(from, 1);
      next.splice(Math.max(0, Math.min(to, next.length)), 0, key);

      writeOrder(next);
    },
    [],
  );

  const reset = useCallback(() => writeOrder(DEFAULT_ORDER), []);

  return {
    /* Resolved to the column objects here, so no caller has to look a key up
       and none of them can disagree about what `numeric` means. */
    columns: order.map((key) => BILLS_COLUMNS.find((column) => column.key === key)!),
    move,
    reset,
    moved: order.join() !== DEFAULT_ORDER.join(),
  };
}
