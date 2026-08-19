import { INSTALL_PROMPT_EVENT, INSTALL_PROMPT_GLOBAL } from './install-prompt-globals';

/**
 * Catches Chromium's `beforeinstallprompt` before React exists.
 *
 * ## The bug this fixes
 *
 * `beforeinstallprompt` fires **once**, and it fires as soon as the browser has
 * fetched the manifest and decided the page is installable — which on a warm
 * cache is well before a Next.js document has hydrated. `useInstallPrompt`
 * attaches its listener from a `useEffect`, i.e. after hydration, so on most
 * real visits the event had already come and gone by the time anything was
 * listening. The captured prompt was therefore `null`, `installAction`
 * resolved to `'unavailable'`, and both install surfaces fell back to their
 * "not available right now" state on a browser that was in fact perfectly
 * ready to install. It looked like an installability failure and was actually
 * a timing failure.
 *
 * ## Why an inline script, and why it renders in the root layout's `<head>`
 *
 * The listener has to be attached during parse, before any bundle evaluates,
 * which rules out every strategy `next/script` can honour outside the root
 * layout. A plain inline `<script>` runs at exactly the right moment.
 *
 * It renders from the root locale layout's `<head>`, not from the app and
 * portal layouts where it used to sit. Those two re-render on the client
 * during client-side navigation, and a `<script>` created by a client render
 * is never executed — React logs "Encountered a script tag while rendering
 * React component" for exactly that reason. The root layout's `<head>` is
 * emitted by the server once and afterwards only hydrated against the DOM
 * that is already there, so the tag both runs and stays quiet.
 *
 * Both apps still get the capture they had before. The emitted script is
 * identical for either, and a given page load is one app or the other, never
 * both, so hoisting it to the shared root changes nothing about which event
 * ends up stashed.
 *
 * ## The handoff
 *
 * The event is stashed on `window` under {@link INSTALL_PROMPT_GLOBAL} and a
 * {@link INSTALL_PROMPT_EVENT} notification is dispatched. `useInstallPrompt`
 * reads the stash on mount (covering "fired before hydration") *and* listens
 * for both the notification and the native event (covering "fires after"), so
 * whichever order the two happen in, the prompt is found exactly once. The
 * stash is cleared on `appinstalled` so a consumed prompt is never re-offered.
 *
 * `preventDefault()` here rather than in the hook, because it has to happen
 * inside the original event dispatch to suppress Chrome's own mini-infobar —
 * doing it later, from a stored reference, is too late.
 */
export function InstallPromptCapture() {
  const script = `(function(){try{
var g=${JSON.stringify(INSTALL_PROMPT_GLOBAL)},e=${JSON.stringify(INSTALL_PROMPT_EVENT)};
window.addEventListener('beforeinstallprompt',function(v){v.preventDefault();window[g]=v;window.dispatchEvent(new Event(e));});
window.addEventListener('appinstalled',function(){window[g]=null;});
}catch(_){}})();`;

  /*
    `dangerouslySetInnerHTML` is the only way to emit an inline script from a
    server component; the content is a literal defined directly above with no
    interpolated user input, so there is nothing here to inject.
  */
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
