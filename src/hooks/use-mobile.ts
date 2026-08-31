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
 * `40rem` — the phone, and nothing else. Same line `Dialog` turns from a
 * centred card into a sheet at, and the same line the popup-sheet block in
 * `globals.css` is keyed on, so the component's belief and the stylesheet's
 * drawing agree at every width.
 *
 * ⚠ **This deliberately no longer asks about the pointer.** It was briefly
 * `(width < 40rem), (pointer: coarse)`, which docked every one of these
 * surfaces on a tablet: an iPad is 810–1366 CSS px, it has the room an anchored
 * popup was designed for, and a sheet there covers a page that had no need to
 * be covered. The tablet face is the desktop face. Touch *sizing* still tracks
 * the pointer — see the `(pointer: coarse)` block in `globals.css` — because
 * row height is a question about the finger and this is a question about the
 * screen.
 *
 * It is consequently the same query as `useIsPhone`, and kept separate on
 * purpose: `useIsPhone` is asked by layout, this is asked by overlay surfaces,
 * and the two have moved apart once already.
 */
const SHEET_SURFACE_QUERY = '(width < 40rem)'

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
 *
 * ── The second clause: the same tablet, turned on its side ──
 *
 * Width alone only catches a tablet held upright. Turned landscape the same
 * device is 1024–1366px wide and reads as a desktop to the first clause, so the
 * rail there went back to being a column that shoves the page aside — one
 * device answering two different ways depending on which way up it is held.
 *
 * So the band asks the *other* dimension too. A screen whose block size is a
 * tablet's is a tablet whatever its inline size says, and the pointer is what
 * separates it from a short desktop window: `64rem` of height is an ordinary
 * laptop with a browser that is not maximised, and nothing about that reader
 * wants the tablet's shape. A coarse pointer and a block size within a tablet's
 * is a tablet, in either orientation.
 *
 * `<=` rather than `<` on the height, unlike the width. The width is a
 * boundary — `lg` starts *at* 64rem — while the height is naming a device:
 * a 12.9" tablet in landscape is exactly 1024px tall, and a rule that excluded
 * the largest tablet would miss the one this clause exists for.
 */
const COMPACT_QUERY = '(width < 64rem), (pointer: coarse) and (height <= 64rem)'

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

/**
 * Whether the primary pointer is a finger.
 *
 * ⚠ **A width question must not be asked here, and this must not be asked of
 * width.** The note on `useIsSheetSurface` above is the other half of this one:
 * a tablet has a desktop's *room*, so what it should look like is a question
 * about the screen — while how big a target must be, and what a drag across a
 * list means, are questions about the finger. This is the second kind. It
 * mirrors the `(pointer: coarse)` block in `globals.css`, which sizes touch
 * targets off exactly this query.
 *
 * `pointer` reports the **primary** input, so a laptop with a touchscreen and a
 * trackpad answers `fine` — correct, because its reader is on the trackpad. A
 * tablet with a mouse paired answers `fine` too, and also correctly: nothing
 * here is about the hardware, only about what is being pointed with.
 *
 * `false` on the server. There is no pointer during a server render, and a
 * first paint that assumes a mouse degrades to "hover selection works", which
 * is the state every desktop stays in anyway.
 */
const COARSE_POINTER_QUERY = '(pointer: coarse)'

function subscribeCoarsePointer(onChange: () => void) {
  const query = window.matchMedia(COARSE_POINTER_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

export function useIsCoarsePointer() {
  return React.useSyncExternalStore(
    subscribeCoarsePointer,
    () => window.matchMedia(COARSE_POINTER_QUERY).matches,
    () => false,
  )
}
