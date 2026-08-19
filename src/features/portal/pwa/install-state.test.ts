import { describe, expect, test } from 'bun:test';

import {
  DISMISS_COOLDOWN_MS,
  canShowInstallBanner,
  isInstalled,
  parseInstallState,
  resolveInstallAction,
} from './install-state';

describe('parseInstallState', () => {
  test('defaults to unshown/not-installed for null', () => {
    expect(parseInstallState(null)).toEqual({ dismissedAt: null, installed: false });
  });

  test('defaults for malformed JSON', () => {
    expect(parseInstallState('{not json')).toEqual({ dismissedAt: null, installed: false });
  });

  test('defaults when the parsed value is not an object', () => {
    expect(parseInstallState('42')).toEqual({ dismissedAt: null, installed: false });
    expect(parseInstallState('null')).toEqual({ dismissedAt: null, installed: false });
  });

  test('reads a well-formed record', () => {
    expect(parseInstallState(JSON.stringify({ dismissedAt: 100, installed: true }))).toEqual({
      dismissedAt: 100,
      installed: true,
    });
  });

  test('ignores non-numeric dismissedAt and non-boolean installed', () => {
    expect(parseInstallState(JSON.stringify({ dismissedAt: 'x', installed: 'yes' }))).toEqual({
      dismissedAt: null,
      installed: false,
    });
  });
});

describe('canShowInstallBanner', () => {
  const now = 1_000_000;

  test('never shows once installed, regardless of dismissal', () => {
    expect(canShowInstallBanner({ dismissedAt: null, installed: true }, now)).toBe(false);
  });

  test('shows when never dismissed and not installed', () => {
    expect(canShowInstallBanner({ dismissedAt: null, installed: false }, now)).toBe(true);
  });

  test('stays hidden inside the cooldown window', () => {
    const dismissedAt = now - DISMISS_COOLDOWN_MS / 2;
    expect(canShowInstallBanner({ dismissedAt, installed: false }, now)).toBe(false);
  });

  test('reappears once the cooldown has fully elapsed', () => {
    const dismissedAt = now - DISMISS_COOLDOWN_MS;
    expect(canShowInstallBanner({ dismissedAt, installed: false }, now)).toBe(true);
  });

  test('reappears past the cooldown boundary', () => {
    const dismissedAt = now - DISMISS_COOLDOWN_MS - 1;
    expect(canShowInstallBanner({ dismissedAt, installed: false }, now)).toBe(true);
  });
});

describe('isInstalled', () => {
  test('false when neither signal says installed', () => {
    expect(isInstalled(false, { dismissedAt: null, installed: false })).toBe(false);
  });

  test('true when currently running standalone, even if never marked installed', () => {
    expect(isInstalled(true, { dismissedAt: null, installed: false })).toBe(true);
  });

  test('true when the persisted record says installed, even outside a standalone tab', () => {
    expect(isInstalled(false, { dismissedAt: null, installed: true })).toBe(true);
  });

  test('true when both signals agree', () => {
    expect(isInstalled(true, { dismissedAt: null, installed: true })).toBe(true);
  });
});

describe('resolveInstallAction', () => {
  test('android when a native prompt is ready', () => {
    expect(resolveInstallAction(true, false)).toBe('android');
  });

  test('ios when Safari on iOS and no native prompt', () => {
    expect(resolveInstallAction(false, true)).toBe('ios');
  });

  test('unavailable when neither is offered', () => {
    expect(resolveInstallAction(false, false)).toBe('unavailable');
  });

  test('android takes precedence if both were somehow true', () => {
    expect(resolveInstallAction(true, true)).toBe('android');
  });
});
