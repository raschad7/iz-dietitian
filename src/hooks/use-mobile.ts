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
