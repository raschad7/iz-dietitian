'use client';

import { useCallback, useSyncExternalStore } from 'react';

import {
  deleteNotification,
  markNotificationRead,
  markNotificationsRead,
  parseNotificationState,
  type NotificationState,
} from './browser-state';

/**
 * The `qiwam.` prefix is the product's former name. It stays: this key names a
 * record already sitting in real browsers, and renaming it would not migrate
 * that record, it would abandon it. A rebrand is not a reason to silently
 * discard state a user already has.
 */
const STORAGE_KEY = 'qiwam.staff.notifications.v2';
const listeners = new Set<() => void>();

let cachedRaw: string | null = null;
let cachedState = parseNotificationState(null);
let fallbackState: NotificationState | null = null;

function readState(): NotificationState {
  if (fallbackState) return fallbackState;

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return cachedState;
  }

  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedState = parseNotificationState(raw);
  }

  return cachedState;
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function writeState(next: NotificationState) {
  const raw = JSON.stringify(next);

  try {
    window.localStorage.setItem(STORAGE_KEY, raw);
    cachedRaw = raw;
    cachedState = next;
    fallbackState = null;
  } catch {
    fallbackState = next;
  }

  listeners.forEach((listener) => listener());
}

export function useBrowserNotificationState() {
  const state = useSyncExternalStore(subscribe, readState, () => null);

  const markRead = useCallback((id: string) => {
    writeState(markNotificationRead(readState(), id));
  }, []);

  /** Every id in one write — see `markNotificationsRead`. */
  const markAllRead = useCallback((ids: readonly string[]) => {
    writeState(markNotificationsRead(readState(), ids));
  }, []);

  const dismiss = useCallback((id: string) => {
    writeState(deleteNotification(readState(), id));
  }, []);

  return { state, markRead, markAllRead, dismiss };
}
