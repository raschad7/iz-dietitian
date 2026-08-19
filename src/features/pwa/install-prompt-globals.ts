/**
 * The two names the pre-hydration capture script and the React hook have to
 * agree on, defined once so they cannot drift.
 *
 * `install-prompt-capture.tsx` emits a string of JavaScript and
 * `use-install-prompt.ts` is ordinary module code — they share no imports at
 * runtime, only these values, which the script interpolates via
 * `JSON.stringify`. A rename here changes both sides at once; a rename in
 * either file alone would silently break the handoff and put the install
 * surfaces back on their "unavailable" state.
 */

/** Where the captured `BeforeInstallPromptEvent` is parked on `window`. */
export const INSTALL_PROMPT_GLOBAL = '__izPortalInstallPrompt';

/** Dispatched on `window` once the stash above has been filled. */
export const INSTALL_PROMPT_EVENT = 'iz:portal-install-prompt';
