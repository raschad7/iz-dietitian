import { describe, expect, test } from 'bun:test';

import { resolveSafeRedirect } from './redirect';

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
