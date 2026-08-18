/**
 * Pure logic for the install banner's dismiss/cooldown behavior — split out
 * from `use-install-prompt.ts` so it can be unit tested without a DOM
 * (`bun test` has no browser environment; see `install-state.test.ts`).
 */

/** How long a dismissal silences the banner before it may reappear. */
export const DISMISS_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export type InstallStateRecord = {
  /** Epoch ms of the most recent "Not now" tap, or `null` if never dismissed. */
  dismissedAt: number | null;
  /** Set once the `appinstalled` event fires — permanent, never cleared. */
  installed: boolean;
};

export const DEFAULT_INSTALL_STATE: InstallStateRecord = {
  dismissedAt: null,
  installed: false,
};

/**
 * Parses whatever was read out of `localStorage`. Never throws — a missing,
 * corrupted, or foreign value all fall back to the default (unshown, not
 * installed), the same "safe reading" rule `use-seen`'s parser follows: never
 * let a storage read crash the banner.
 */
export function parseInstallState(raw: string | null): InstallStateRecord {
  if (!raw) return DEFAULT_INSTALL_STATE;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_INSTALL_STATE;

    const record = parsed as Record<string, unknown>;
    const dismissedAt = typeof record.dismissedAt === 'number' ? record.dismissedAt : null;
    const installed = record.installed === true;

    return { dismissedAt, installed };
  } catch {
    return DEFAULT_INSTALL_STATE;
  }
}

/**
 * Whether the install banner may be shown right now, given the persisted
 * state and the current time (passed in rather than read internally, so this
 * stays a pure function to test).
 *
 * Never shown once installed. Otherwise silenced for `DISMISS_COOLDOWN_MS`
 * after the most recent dismissal, so declining once does not mean declining
 * forever, but also never becomes a repeated interruption.
 */
export function canShowInstallBanner(state: InstallStateRecord, now: number): boolean {
  if (state.installed) return false;
  if (state.dismissedAt === null) return true;

  return now - state.dismissedAt >= DISMISS_COOLDOWN_MS;
}

/**
 * Whether the app should be treated as installed, combining the two signals
 * that each catch a case the other misses: `standalone` is true the instant
 * this tab is running as the installed app, even on a browser profile that
 * never went through our own prompt; `persisted.installed` survives after the
 * client closes the installed app and comes back to an ordinary browser tab,
 * which `standalone` alone cannot see.
 */
export function isInstalled(standalone: boolean, persisted: InstallStateRecord): boolean {
  return standalone || persisted.installed;
}

/** Which install action the settings row (and the banner) should offer. */
export type InstallAction = 'android' | 'ios' | 'unavailable';

/**
 * Chooses the install action for the current browser. `canInstallAndroid`
 * wins when both are somehow true — it is the direct, one-tap path, and no
 * real browser reports both at once (`beforeinstallprompt` is Chromium-only,
 * `iosSafari` is Safari-only) — the precedence only matters for this
 * function's own tests.
 */
export function resolveInstallAction(canInstallAndroid: boolean, iosSafari: boolean): InstallAction {
  if (canInstallAndroid) return 'android';
  if (iosSafari) return 'ios';
  return 'unavailable';
}
