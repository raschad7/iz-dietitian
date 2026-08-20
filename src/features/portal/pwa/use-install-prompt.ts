'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import {
  canShowInstallBanner,
  isInstalled,
  parseInstallState,
  resolveInstallAction,
  type InstallAction,
  type InstallStateRecord,
} from './install-state';

const STORAGE_KEY = 'iz.portal.pwa.install.v1';
const listeners = new Set<() => void>();

let cachedRaw: string | null = null;
let cachedState = parseInstallState(null);
let fallbackState: InstallStateRecord | null = null;

function readState(): InstallStateRecord {
  if (fallbackState) return fallbackState;

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return cachedState;
  }

  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedState = parseInstallState(raw);
  }

  return cachedState;
}

function getServerInstallState(): InstallStateRecord {
  return parseInstallState(null);
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function writeState(next: InstallStateRecord) {
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

/*
  Two more read-only external values — whether the app is already running
  standalone, and whether this is iOS Safari — read the same way as
  `readState` above rather than in the hook body directly:
  `useSyncExternalStore`'s `getSnapshot`/`getServerSnapshot` are the
  sanctioned place to read something impure (a browser API). Subscribing to
  nothing is deliberate for both — neither needs a live update mid-session; a
  fresh read on the next render (a dismiss, a navigation) is enough.

  ⚠ `Date.now()` used to be a third of these (`getNowSnapshot`), and that was
  a bug, not a style choice: `useSyncExternalStore` calls `getSnapshot` again
  after every render to check whether it changed, and `Date.now()` is never
  equal to the value it returned a moment ago — so React saw a "change" on
  every single check and re-rendered forever ("Maximum update depth
  exceeded"). "Now" is captured once per mount instead, via `useState`'s lazy
  initializer below — a cooldown measured in days does not need
  millisecond-live tracking, only a value that does not move on every render.
*/
function subscribeToNothing() {
  return () => {};
}

/** Chrome/Android's `beforeinstallprompt` event — not yet in `lib.dom.d.ts`. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function getStandaloneSnapshot(): boolean {
  // The standard signal, and Safari's own pre-standard one (`navigator.standalone`
  // is not in `lib.dom.d.ts`, hence the cast) — iOS never fires
  // `beforeinstallprompt` and never matches the media query either.
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function getStandaloneServerSnapshot(): boolean {
  return false;
}

function getIosSafariSnapshot(): boolean {
  const ua = navigator.userAgent;
  const isIosDevice = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);

  return isIosDevice && isSafari;
}

function getIosSafariServerSnapshot(): boolean {
  return false;
}

/**
 * Drives both of the portal's install surfaces — the dismissible home banner
 * (`install-app-banner.tsx`) and the always-available settings row
 * (`install-app-settings-row.tsx`) — from one shared state machine: captures
 * Android/Chrome's native install prompt, recognizes iOS Safari (which never
 * fires one, so it gets its own instructions instead), and tracks
 * install/dismissal so neither surface keeps interrupting or offering a dead
 * control once installed.
 *
 * State lives in the same `useSyncExternalStore` + `localStorage` shape as
 * `use-seen` and `use-browser-notification-state` elsewhere in the portal —
 * see those for why: "installed"/"dismissed" are facts about this browser,
 * not the server, so there is nothing to keep them in sync with.
 *
 * `installed` and `installAction` are the two fields each surface actually
 * branches on: `installed` hides the control outright (both surfaces),
 * `installAction` (`'android' | 'ios' | 'unavailable'`) decides what tapping
 * it does. The banner additionally gates on `bannerVisible`, which folds in
 * the cooldown and never offers the `'unavailable'` action at all — see the
 * settings row for why it is the one surface that still shows something in
 * that case.
 */
export function useInstallPrompt() {
  const persisted = useSyncExternalStore(subscribe, readState, getServerInstallState);
  const standalone = useSyncExternalStore(subscribeToNothing, getStandaloneSnapshot, getStandaloneServerSnapshot);
  const iosSafari = useSyncExternalStore(subscribeToNothing, getIosSafariSnapshot, getIosSafariServerSnapshot);

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  // Captured once per mount, not read live — see the note above `subscribeToNothing`.
  const [now] = useState(() => Date.now());

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setDeferredPrompt(null);
      writeState({ ...readState(), installed: true });
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  /*
    Writes `installed: true` back to the persisted record the moment this tab
    is found running standalone, even if it got there without ever firing our
    own `appinstalled` handler above — a client who used the browser's own
    menu to install, on a build that shipped before this hook existed, or on
    a browser that never fires `appinstalled` at all. Without this, `standalone`
    (a fact about *this tab, right now*) would correctly hide the settings row
    today but say nothing once the client closes the installed app and comes
    back to an ordinary browser tab — `persisted.installed` is what the
    banner's cooldown logic and the settings row both read to hide
    *permanently*, and only a write makes that true here.

    Guarded so it fires at most once per browser: once `persisted.installed`
    is already true the condition is false on every subsequent run, so this
    is a one-time correction, not a loop.
  */
  useEffect(() => {
    if (standalone && !persisted.installed) {
      writeState({ ...readState(), installed: true });
    }
  }, [standalone, persisted.installed]);

  const dismiss = useCallback(() => {
    writeState({ ...readState(), dismissedAt: Date.now() });
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);

    if (outcome === 'accepted') {
      writeState({ ...readState(), installed: true });
    }
  }, [deferredPrompt]);

  const canInstallAndroid = deferredPrompt !== null;
  const installed = isInstalled(standalone, persisted);
  const installAction: InstallAction = resolveInstallAction(canInstallAndroid, iosSafari);

  // The home banner is the eager offer: it only ever appears when there is a
  // real install path (a native prompt, or iOS's manual steps) and goes away
  // permanently once installed — `canShowInstallBanner` reads `persisted`, and
  // `!installed` also covers `standalone` directly, for the one render where
  // a freshly standalone tab has not yet round-tripped through the write-back
  // effect above.
  const bannerVisible = !installed && installAction !== 'unavailable' && canShowInstallBanner(persisted, now);

  return {
    /** True once installed, by either signal — hides every install control. */
    installed,
    /** Android/Chrome only: a captured native prompt is ready to fire. */
    canInstallAndroid,
    /** iOS Safari: no native prompt exists, show manual instructions instead. */
    iosSafari,
    /** `'android' | 'ios' | 'unavailable'` — which action the UI should offer. */
    installAction,
    /** Whether the dismissible home banner should render right now. */
    bannerVisible,
    promptInstall,
    dismiss,
  };
}
