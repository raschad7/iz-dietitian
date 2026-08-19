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
 * Whether a surface that *can* be a bottom sheet should be one.
 *
 * Two questions in one query, because either alone gets a real device wrong.
 * **Width** (`40rem`) catches the phone, the same line `Dialog` turns from a
 * centred card into a sheet at. **Pointer** catches the tablet that is wide
 * enough for a floating panel and still should not get one: an iPad in
 * landscape is 1024–1366 CSS px, which is desktop territory by every
 * breakpoint in this codebase, and a popup anchored to a bell in the top
 * corner there is a popup a thumb cannot reach.
 *
 * A comma is `or` in a media query list, so a coarse pointer docks the surface
 * at any width. This is deliberately the **same test** as the guided tour's
 * `DOCKED_QUERY` (`user-guide/guide-overlay.tsx`) and the `(pointer: coarse)`
 * block in `globals.css` that turns select/combobox/dropdown positioners into
 * sheets — three places asking "is this a touch surface?" have to agree, or a
 * tablet gets a tour card docked at the edge next to a popup hanging off a
 * trigger.
 *
 * ⚠ **Prefer this over `useIsPhone` for anything that becomes a sheet.**
 * `useIsPhone` asks only about width, so on a tablet it answers `false` and
 * leaves the component rendering an anchored popup — which `globals.css` then
 * overrides into sheet *shape* with `!important`. That left two mechanisms
 * describing one surface: the component believed it was a popover, the
 * stylesheet drew a sheet, and anything that depended on knowing which
 * (measurement, the entrance keyframe, the close affordance) had to be right
 * in both. Answering the question once, here, is what lets a component render
 * the real `Sheet` and stop relying on the override at all.
 */
const SHEET_SURFACE_QUERY = '(width < 40rem), (pointer: coarse)'

function subscribeSheetSurface(onChange: () => void) {
  const query = window.matchMedia(SHEET_SURFACE_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

export function useIsSheetSurface() {
  return React.useSyncExternalStore(
    subscribeSheetSurface,
    () => window.matchMedia(SHEET_SURFACE_QUERY).matches,
    /*
      `false` on the server, unlike the tour's `true`. The popover is what this
      app's shells have always shipped in their first paint, and a closed
      popup's markup is what is being decided here — nothing the reader can see
      moves when the swap happens on the first client pass.
    */
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
