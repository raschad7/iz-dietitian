import * as React from "react"

const MOBILE_BREAKPOINT = 768
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

/**
 * Whether the viewport is narrower than the sidebar's breakpoint.
 *
 * Rewritten from the registry's `useState` + `useEffect` pair, which set state
 * synchronously inside the effect to seed the first real value — a cascading
 * render, and something this project's lint rules reject outright.
 *
 * `useSyncExternalStore` is what the pattern is for: the media query *is* an
 * external store, so React subscribes to it and reads it directly instead of
 * mirroring it into state. The third argument is the server snapshot; there is
 * no viewport during a render on the server, and `false` matches the registry's
 * own `!!isMobile` behaviour on the first client paint.
 */
function subscribe(onChange: () => void) {
  const query = window.matchMedia(QUERY)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  )
}

/**
 * The phone boundary the app's *modal surfaces* already break at: anything
 * narrower than `sm`.
 *
 * A third query rather than a reuse of `useIsMobile`, because it answers a
 * third question. 768px is where the shell stops being one column and where a
 * week of calendar starts to fit; 1024px is where the staff rail comes back.
 * 640px is neither — it is the line `Dialog` turns from a centred card into a
 * bottom sheet at (`sm:m-auto sm:rounded-lg` on the surface, and the `40rem`
 * media query in `globals.css` that swaps its entrance keyframe with it).
 *
 * Anything that rises from the bottom edge *beside a dialog* has to break at
 * that same width, or the two disagree: the notifications bell opened as a
 * sheet while the "see all" dialog it leads to was still a centred card, on
 * every tablet held upright.
 *
 * `40rem` rather than 640px, so it tracks the root font size the way the `sm`
 * breakpoint it mirrors does.
 */
const PHONE_QUERY = '(width < 40rem)'

function subscribePhone(onChange: () => void) {
  const query = window.matchMedia(PHONE_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

export function useIsPhone() {
  return React.useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  )
}

/**
 * The tablet-and-below boundary: anything narrower than `lg`.
 *
 * Separate from `useIsMobile` because they answer different questions. 768px is
 * where a phone becomes a tablet — where seven calendar columns start to fit and
 * where the shell stops being one column. 1024px is where a tablet becomes a
 * desktop, which is the line the staff rail is locked at: below it the rail is
 * icons and nothing else, above it the expanded column comes back.
 *
 * `64rem` rather than a pixel count, so it tracks the root font size the way the
 * `lg` breakpoint it mirrors does — a reader who has scaled their text up is on
 * a narrower screen in the only unit that matters.
 */
const COMPACT_QUERY = '(width < 64rem)'

function subscribeCompact(onChange: () => void) {
  const query = window.matchMedia(COMPACT_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

export function useIsCompact() {
  return React.useSyncExternalStore(
    subscribeCompact,
    () => window.matchMedia(COMPACT_QUERY).matches,
    () => false,
  )
}
