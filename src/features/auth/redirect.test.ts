import { describe, expect, test } from 'bun:test';

import { areaHomePath, resolveSafeRedirect, toUserRole } from './redirect';

describe('resolveSafeRedirect', () => {
  test('accepts a path inside the staff area for the current locale', () => {
    expect(resolveSafeRedirect('/ar/app/clients', 'ar', 'staff')).toBe('/ar/app/clients');
  });

  test('accepts a path inside the portal for a client', () => {
    expect(resolveSafeRedirect('/en/portal', 'en', 'client')).toBe('/en/portal');
  });

  test('falls back to the area home when nothing was requested', () => {
    expect(resolveSafeRedirect(null, 'ar', 'staff')).toBe('/ar/app');
    expect(resolveSafeRedirect(null, 'en', 'client')).toBe('/en/portal');
  });

  test('rejects an absolute URL', () => {
    expect(resolveSafeRedirect('https://evil.test/ar/app', 'ar', 'staff')).toBe('/ar/app');
  });

  test('rejects a protocol-relative URL, which a naive startsWith("/") check would allow', () => {
    expect(resolveSafeRedirect('//evil.test', 'ar', 'staff')).toBe('/ar/app');
    expect(resolveSafeRedirect('//evil.test/ar/app', 'ar', 'staff')).toBe('/ar/app');
  });

  test('rejects a backslash-prefixed URL, which some browsers normalise to //', () => {
    expect(resolveSafeRedirect('\\\\evil.test', 'ar', 'staff')).toBe('/ar/app');
    expect(resolveSafeRedirect('/\\evil.test', 'ar', 'staff')).toBe('/ar/app');
  });

  test('rejects another locale, so a redirect cannot silently switch language', () => {
    expect(resolveSafeRedirect('/en/app/clients', 'ar', 'staff')).toBe('/ar/app');
  });

  test('rejects the other role’s area', () => {
    expect(resolveSafeRedirect('/ar/portal', 'ar', 'staff')).toBe('/ar/app');
    expect(resolveSafeRedirect('/ar/app/clients', 'ar', 'client')).toBe('/ar/portal');
  });

  test('rejects a sibling path that merely shares the prefix', () => {
    expect(resolveSafeRedirect('/ar/apple', 'ar', 'staff')).toBe('/ar/app');
  });

  test('accepts the area root exactly', () => {
    expect(resolveSafeRedirect('/ar/app', 'ar', 'staff')).toBe('/ar/app');
  });

  test('strips a query string and hash rather than trusting them through', () => {
    expect(resolveSafeRedirect('/ar/app/clients?q=x#y', 'ar', 'staff')).toBe('/ar/app/clients');
  });
});

describe('areaHomePath', () => {
  test('points each role at its own area, on the locale asked for', () => {
    expect(areaHomePath('ar', 'staff')).toBe('/ar/app');
    expect(areaHomePath('en', 'staff')).toBe('/en/app');
    expect(areaHomePath('ar', 'client')).toBe('/ar/portal');
    expect(areaHomePath('en', 'client')).toBe('/en/portal');
  });

  test('agrees with the fallback resolveSafeRedirect uses', () => {
    // The same mapping, reached two ways. If these ever disagree, the locale
    // root and a rejected `?redirect=` would send the same person to different
    // places.
    expect(resolveSafeRedirect(null, 'ar', 'client')).toBe(areaHomePath('ar', 'client'));
    expect(resolveSafeRedirect('/ar/portal', 'ar', 'staff')).toBe(areaHomePath('ar', 'staff'));
  });
});

/**
 * Better Auth widens every additional field, so the role arrives typed
 * `string | null | undefined` however tight the column is. See the note on the
 * function for why the fallback is safe.
 */
describe('toUserRole', () => {
  test('passes the two real values through', () => {
    expect(toUserRole('staff')).toBe('staff');
    expect(toUserRole('client')).toBe('client');
  });

  test('falls back to the column default for anything else', () => {
    expect(toUserRole(null)).toBe('staff');
    expect(toUserRole(undefined)).toBe('staff');
    expect(toUserRole('')).toBe('staff');
    expect(toUserRole('admin')).toBe('staff');
  });

  test('is exact about `client` — no trimming, no case folding', () => {
    // A near-miss must not be read as the client role. It resolves to staff,
    // where `requireStaffSession` will turn it around; the reverse would aim a
    // real client at a guard that bounces them back, which is a longer way to
    // the same place.
    expect(toUserRole('Client')).toBe('staff');
    expect(toUserRole(' client')).toBe('staff');
  });
});
