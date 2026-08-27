/**
 * Pure logic for the "notifications on this device" control — split out from
 * `use-push-subscription.ts` so it can be unit tested without a DOM (`bun test`
 * has no browser environment; see `push-state.test.ts`), exactly as
 * `pwa/install-state.ts` is split from `use-install-prompt.ts`.
 *
 * Nothing here touches `window`. Every browser fact arrives as an argument.
 */

/**
 * What the switch should show, and it is five states rather than a boolean
 * because "off" has four different reasons and three of them need different
 * words.
 *
 * - `on` — this device is subscribed and the server has it.
 * - `off` — everything works, the client has simply not turned it on.
 * - `blocked` — the client (or the OS) refused notification permission. The
 *   browser will not ask twice, so the only way back is through system
 *   settings, and the row has to say so instead of offering a switch that
 *   silently does nothing.
 * - `needs-install` — iOS, in a browser tab. See {@link resolvePushState}.
 * - `unsupported` — no Push API here at all. A desktop Safari before 16.4, a
 *   privacy build with service workers off, an in-app browser.
 */
export type PushState = 'on' | 'off' | 'blocked' | 'needs-install' | 'unsupported';

/** The three values `Notification.permission` can take, without needing the DOM lib. */
export type PushPermission = 'default' | 'granted' | 'denied';

export type PushEnvironment = {
  /** `serviceWorker`, `PushManager` and `Notification` are all present. */
  capable: boolean;
  /** Running as an installed app rather than in a browser tab. */
  standalone: boolean;
  /** An iOS/iPadOS device, by user agent. */
  ios: boolean;
  permission: PushPermission;
  /** The browser is holding a push subscription for this origin. */
  subscribed: boolean;
};

/**
 * Which of the five states this browser is in.
 *
 * **The iOS check comes before the capability check, and that order is the
 * whole reason this function exists.** Safari on iOS has supported Web Push
 * since 16.4, but *only for a web app the client has added to the Home
 * Screen*: in an ordinary Safari tab `window.Notification` and `PushManager`
 * are not defined at all. Testing capability first would therefore report
 * `unsupported` to every iPhone user in the world — telling them their phone
 * cannot do this, when the truth is that they have not installed the app yet
 * and the portal already has a screen that walks them through it.
 *
 * An installed iOS app that still reports no capability falls through to
 * `unsupported`, which is correct: that is a device below 16.4.
 *
 * `blocked` outranks `subscribed` for the same "say the true thing" reason. A
 * browser can hold a stale subscription while permission has since been revoked
 * in system settings; nothing would be delivered, so the switch must not claim
 * to be on.
 */
export function resolvePushState(environment: PushEnvironment): PushState {
  if (environment.ios && !environment.standalone) return 'needs-install';
  if (!environment.capable) return 'unsupported';
  if (environment.permission === 'denied') return 'blocked';

  return environment.subscribed ? 'on' : 'off';
}

/** Whether the row should render a working switch at all. */
export function isPushToggleable(state: PushState): boolean {
  return state === 'on' || state === 'off';
}

/**
 * The VAPID public key, as `pushManager.subscribe` wants it.
 *
 * The key is distributed as base64url — the URL-safe alphabet, no padding —
 * because it travels in HTTP headers and env files. `atob` speaks only standard
 * base64, so the two substitutions and the padding have to be put back before
 * decoding, and the result has to be raw bytes rather than a string:
 * `applicationServerKey` takes a `BufferSource`.
 *
 * ⚠ A key that decodes to the wrong length is the classic cause of
 * `InvalidAccessError` from `subscribe()`, and the error says nothing about
 * why. An uncompressed P-256 point is 65 bytes and always begins `0x04`, so
 * that is checked here rather than left to the browser — a misconfigured
 * deployment should say "your VAPID key is malformed", not "notifications are
 * broken".
 */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const standard = padded.replace(/-/g, '+').replace(/_/g, '/');

  const binary = atob(standard);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  if (bytes.length !== 65 || bytes[0] !== 0x04) {
    throw new Error(
      `NEXT_PUBLIC_VAPID_PUBLIC_KEY is not a valid uncompressed P-256 public key (got ${bytes.length} bytes). Regenerate it with: bunx web-push generate-vapid-keys`,
    );
  }

  return bytes;
}

/**
 * One of the subscription's own keys, base64url, as the server stores it and
 * `web-push` expects it.
 *
 * The browser hands these back as raw `ArrayBuffer`s from
 * `PushSubscription.getKey()`. Going through `btoa` and stripping the padding
 * is the inverse of {@link urlBase64ToUint8Array} — `PushSubscription.toJSON()`
 * would produce the same strings, but its `keys` field is typed as an open
 * record, so reading them explicitly is what keeps this honest at the type
 * level as well as at runtime.
 */
export function encodeSubscriptionKey(buffer: ArrayBuffer | null): string | null {
  if (!buffer) return null;

  const bytes = new Uint8Array(buffer);
  let binary = '';

  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Whether a user agent is iOS or iPadOS.
 *
 * The `Macintosh` clause is not a mistake: an iPad on iPadOS 13+ reports a
 * desktop Safari user agent by default, and `maxTouchPoints` is the only thing
 * left that distinguishes it from a real Mac. `use-install-prompt.ts` makes the
 * identical test for the identical reason; it is restated here rather than
 * shared because that one additionally asks whether the browser is *Safari*,
 * which is exactly the part that must not be asked here — every browser on iOS
 * is WebKit underneath, so Chrome and Firefox on an iPhone have the same
 * install-first rule and the same Push API.
 */
export function isIosUserAgent(userAgent: string, maxTouchPoints: number): boolean {
  return /iPad|iPhone|iPod/.test(userAgent) || (userAgent.includes('Macintosh') && maxTouchPoints > 1);
}
