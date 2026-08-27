'use client';

import { useCallback, useEffect, useState } from 'react';

import { VAPID_PUBLIC_KEY } from './public-key';
import { subscribeToPushAction, unsubscribeFromPushAction } from './actions';
import {
  encodeSubscriptionKey,
  isIosUserAgent,
  resolvePushState,
  urlBase64ToUint8Array,
  type PushPermission,
  type PushState,
} from './push-state';

/**
 * The browser half of Web Push: what state this device is in, and the two
 * actions that change it.
 *
 * ## Why this reads the browser rather than the server
 *
 * A push subscription is a fact about *this browser profile on this device*,
 * and `pushManager.getSubscription()` is the only thing that knows it. The
 * server's table is a list of every device the client has ever registered —
 * useful for sending, useless for drawing this switch, and capable of being
 * wrong in both directions: it can hold a row for a phone that has since
 * cleared its site data, and it can be missing one the browser still has if a
 * save failed. So the browser is the authority for the switch, and the server
 * is reconciled to it — `enable()` writes, `disable()` deletes, and the send
 * path prunes whatever is left over when a push service reports it gone.
 *
 * This is the same division `use-install-prompt.ts` makes, and the same one
 * `use-seen` in `portal-header.tsx` makes for the bell's read marks: a fact
 * about one browser is kept where that browser can see it.
 *
 * ## Why `useState` + `useEffect` and not `useSyncExternalStore`
 *
 * The neighbouring hooks use `useSyncExternalStore` because their sources are
 * synchronous (`localStorage`, a media query). Every source here is a promise —
 * `getRegistration()`, `getSubscription()`, `requestPermission()` — and
 * `getSnapshot` must return synchronously. So this reads once on mount into
 * state, and every mutation updates it in place.
 */

/** Nothing is known until the first read resolves — see `state` below. */
const INITIAL: PushState = 'off';

export type PushSubscriptionControls = {
  /** Which of the five states this device is in. See `resolvePushState`. */
  state: PushState;
  /** False until the first browser read has resolved. Keeps the row from flickering. */
  ready: boolean;
  /** True while a permission prompt or a round trip is in flight. */
  busy: boolean;
  /**
   * True when the deployment has no VAPID public key. The control is hidden
   * rather than shown broken — a client cannot fix an unset environment
   * variable, so offering them a switch that always fails is worse than
   * offering nothing.
   */
  unconfigured: boolean;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
};

function readPermission(): PushPermission {
  if (typeof Notification === 'undefined') return 'default';
  return Notification.permission as PushPermission;
}

/**
 * The portal's own registration, not `navigator.serviceWorker.ready`.
 *
 * `ready` resolves with whichever worker controls *this page*, which on a
 * locale-prefixed portal URL is the right one — but it also never rejects and
 * never times out, so a page that somehow has no controller would hang here
 * forever. `getRegistration()` with the portal's scope answers, or answers
 * `undefined`, and the caller can say something useful either way.
 *
 * The scope has to match what `ServiceWorkerRegister` registered with —
 * `/{locale}/portal/`, trailing slash included.
 */
async function portalRegistration(locale: string): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) return undefined;

  const scoped = await navigator.serviceWorker.getRegistration(`/${locale}/portal/`);
  if (scoped) return scoped;

  // A worker registered under a different locale still serves this origin, and
  // a client who switched language mid-session should not lose the control.
  return navigator.serviceWorker.ready;
}

export function usePushSubscription(locale: string): PushSubscriptionControls {
  const [state, setState] = useState<PushState>(INITIAL);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const unconfigured = VAPID_PUBLIC_KEY === '';

  /*
    One read on mount, into state.

    `cancelled` guards the async gap: the settings screen can be navigated away
    from while `getSubscription()` is still resolving, and setting state on an
    unmounted component is a warning at best and a leak at worst.
  */
  useEffect(() => {
    let cancelled = false;

    const read = async () => {
      const capable =
        typeof window !== 'undefined' &&
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        typeof Notification !== 'undefined';

      const ios = isIosUserAgent(navigator.userAgent, navigator.maxTouchPoints);
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;

      let subscribed = false;

      if (capable) {
        try {
          const registration = await portalRegistration(locale);
          subscribed = Boolean(await registration?.pushManager.getSubscription());
        } catch {
          // A worker that will not resolve is a device that cannot subscribe.
          // `capable` stays true, so the row offers the switch and the failure
          // — if the client presses it — is reported there rather than here.
          subscribed = false;
        }
      }

      if (cancelled) return;

      setState(resolvePushState({ capable, standalone, ios, permission: readPermission(), subscribed }));
      setReady(true);
    };

    void read();

    return () => {
      cancelled = true;
    };
  }, [locale]);

  /**
   * Ask for permission, subscribe, and register the device.
   *
   * ⚠ **This must be called from a user gesture.** Safari — on iOS especially —
   * refuses `Notification.requestPermission()` outside one, and Chrome will
   * ignore a prompt from a page the client has not interacted with. That is why
   * the control is a switch the client presses and not something that happens
   * on arrival, and it is why no effect anywhere in this feature calls it.
   */
  const enable = useCallback(async () => {
    setBusy(true);

    try {
      const permission = await Notification.requestPermission();

      if (permission !== 'granted') {
        // 'denied' is terminal for this browser; 'default' means they dismissed
        // the prompt without choosing, which leaves the switch off and lets
        // them try again.
        setState(permission === 'denied' ? 'blocked' : 'off');
        return;
      }

      const registration = await portalRegistration(locale);
      if (!registration) {
        setState('unsupported');
        return;
      }

      /*
        `userVisibleOnly: true` is not optional in any shipping browser: the
        contract is that every push produces a notification the client can see,
        and Chrome rejects `subscribe()` outright without it. The service
        worker keeps its end of that bargain by always calling
        `showNotification`, even for a payload it could not parse — see
        `portal-sw.js`.
      */
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
        }));

      const p256dh = encodeSubscriptionKey(subscription.getKey('p256dh'));
      const auth = encodeSubscriptionKey(subscription.getKey('auth'));

      if (!p256dh || !auth) {
        // A subscription with no keys cannot be encrypted to. Undo it rather
        // than storing a row that could never receive anything.
        await subscription.unsubscribe().catch(() => undefined);
        setState('off');
        return;
      }

      const result = await subscribeToPushAction({
        locale,
        endpoint: subscription.endpoint,
        p256dh,
        auth,
        userAgent: navigator.userAgent,
      });

      if (!result.ok) {
        /*
          The browser is subscribed and the server does not know. Rolling the
          browser back is what keeps the two from disagreeing: a client left in
          that state would see the switch on and never receive anything, with
          no way to fix it except clearing site data.
        */
        await subscription.unsubscribe().catch(() => undefined);
        setState('off');
        return;
      }

      setState('on');
    } catch (error) {
      console.error('[push] enabling notifications failed', error);
      setState(readPermission() === 'denied' ? 'blocked' : 'off');
    } finally {
      setBusy(false);
    }
  }, [locale]);

  /** Unsubscribe here first, then forget the row — see `unsubscribeFromPushAction`. */
  const disable = useCallback(async () => {
    setBusy(true);

    try {
      const registration = await portalRegistration(locale);
      const subscription = await registration?.pushManager.getSubscription();

      if (!subscription) {
        setState('off');
        return;
      }

      const { endpoint } = subscription;

      await subscription.unsubscribe();
      await unsubscribeFromPushAction({ locale, endpoint });

      setState('off');
    } catch (error) {
      console.error('[push] disabling notifications failed', error);
    } finally {
      setBusy(false);
    }
  }, [locale]);

  return { state, ready, busy, unconfigured, enable, disable };
}
