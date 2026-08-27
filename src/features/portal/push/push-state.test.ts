import { describe, expect, test } from 'bun:test';

import {
  encodeSubscriptionKey,
  isIosUserAgent,
  isPushToggleable,
  resolvePushState,
  urlBase64ToUint8Array,
  type PushEnvironment,
} from './push-state';

/** A capable, installed, permitted, unsubscribed browser — the ordinary case. */
function environment(overrides: Partial<PushEnvironment> = {}): PushEnvironment {
  return {
    capable: true,
    standalone: true,
    ios: false,
    permission: 'default',
    subscribed: false,
    ...overrides,
  };
}

describe('resolvePushState', () => {
  test('off when everything works and nothing is subscribed', () => {
    expect(resolvePushState(environment())).toBe('off');
  });

  test('on when the browser holds a subscription', () => {
    expect(resolvePushState(environment({ subscribed: true, permission: 'granted' }))).toBe('on');
  });

  test('blocked outranks a stale subscription', () => {
    // Permission revoked in system settings while the browser still holds a
    // subscription. Nothing would be delivered, so the switch must not say on.
    expect(resolvePushState(environment({ subscribed: true, permission: 'denied' }))).toBe('blocked');
  });

  test('iOS in a browser tab needs installing, not a capability message', () => {
    // The case the ordering exists for: Safari on iOS exposes no Push API at
    // all outside a Home Screen app, so a capability-first check would tell
    // every iPhone its phone cannot do this.
    expect(resolvePushState(environment({ ios: true, standalone: false, capable: false }))).toBe(
      'needs-install',
    );
  });

  test('an installed iOS app with no Push API is genuinely unsupported', () => {
    // Below 16.4.
    expect(resolvePushState(environment({ ios: true, standalone: true, capable: false }))).toBe(
      'unsupported',
    );
  });

  test('a desktop browser with no Push API is unsupported', () => {
    expect(resolvePushState(environment({ capable: false }))).toBe('unsupported');
  });

  test('a capable iOS app behaves like any other browser', () => {
    expect(resolvePushState(environment({ ios: true, standalone: true, subscribed: true }))).toBe('on');
  });
});

describe('isPushToggleable', () => {
  test('only the two states a switch can move between', () => {
    expect(isPushToggleable('on')).toBe(true);
    expect(isPushToggleable('off')).toBe(true);
    expect(isPushToggleable('blocked')).toBe(false);
    expect(isPushToggleable('needs-install')).toBe(false);
    expect(isPushToggleable('unsupported')).toBe(false);
  });
});

describe('urlBase64ToUint8Array', () => {
  /** A real VAPID public key: 65 bytes, uncompressed, base64url, unpadded. */
  const KEY = 'BJTSq0irnDi0YL6foOPC9WZq5PGv83irRfytHgzwYIe_XK2ofUgbcFvwOzVBWBPR2T4VF6x3smKvlW3DiMrooR0';

  test('decodes a base64url key to 65 raw bytes beginning 0x04', () => {
    const bytes = urlBase64ToUint8Array(KEY);

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(65);
    expect(bytes[0]).toBe(0x04);
  });

  test('handles the url-safe alphabet and missing padding', () => {
    // `-`, `_` and the absent `=` are the three things `atob` cannot read, and
    // a 65-byte key is never a multiple of three so the padding is always
    // missing. Round-tripped through a value that contains all of them.
    const bytes = new Uint8Array(65);
    bytes[0] = 0x04;
    bytes[1] = 0xfb;
    bytes[2] = 0xff;
    bytes[63] = 0xfb;
    bytes[64] = 0xff;

    const encoded = encodeSubscriptionKey(bytes.buffer as ArrayBuffer) ?? '';

    expect(encoded).toContain('_');
    expect(encoded).not.toContain('=');
    expect(urlBase64ToUint8Array(encoded)).toEqual(bytes);

    // The `+` → `-` half, on a value short enough to force one.
    expect(encodeSubscriptionKey(new Uint8Array([0xfb, 0xff]).buffer as ArrayBuffer)).toContain('-');
    expect(() => urlBase64ToUint8Array(KEY)).not.toThrow();
  });

  test('rejects a key of the wrong length rather than leaving the browser to', () => {
    // `subscribe()` answers a short key with a bare InvalidAccessError that
    // says nothing about why — this is the message that does.
    expect(() => urlBase64ToUint8Array('abcd')).toThrow(/VAPID/);
  });

  test('rejects a well-sized key that is not an uncompressed point', () => {
    const bytes = new Uint8Array(65);
    bytes[0] = 0x03;

    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);

    expect(() => urlBase64ToUint8Array(btoa(binary))).toThrow(/VAPID/);
  });
});

describe('encodeSubscriptionKey', () => {
  test('round-trips a key back to the base64url the server stores', () => {
    const original = 'BJTSq0irnDi0YL6foOPC9WZq5PGv83irRfytHgzwYIe_XK2ofUgbcFvwOzVBWBPR2T4VF6x3smKvlW3DiMrooR0';
    const bytes = urlBase64ToUint8Array(original);

    expect(encodeSubscriptionKey(bytes.buffer as ArrayBuffer)).toBe(original);
  });

  test('emits no padding and no standard-alphabet characters', () => {
    // 0xFB 0xFF encodes to `+/8` in standard base64 — both substitutions and
    // the padding in three bytes.
    const encoded = encodeSubscriptionKey(new Uint8Array([0xfb, 0xff]).buffer as ArrayBuffer);

    expect(encoded).toBe('-_8');
  });

  test('null for a key the browser did not provide', () => {
    expect(encodeSubscriptionKey(null)).toBeNull();
  });
});

describe('isIosUserAgent', () => {
  test('an iPhone', () => {
    expect(
      isIosUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
        5,
      ),
    ).toBe(true);
  });

  test('Chrome on iOS, which is WebKit and has the same install-first rule', () => {
    expect(
      isIosUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/122.0 Mobile/15E148 Safari/604.1',
        5,
      ),
    ).toBe(true);
  });

  test('an iPad claiming to be a Mac, told apart by touch points', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

    expect(isIosUserAgent(ua, 5)).toBe(true);
    // The same string from a real Mac, which reports no touch points.
    expect(isIosUserAgent(ua, 0)).toBe(false);
  });

  test('Android is not iOS', () => {
    expect(
      isIosUserAgent(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Mobile Safari/537.36',
        5,
      ),
    ).toBe(false);
  });
});
