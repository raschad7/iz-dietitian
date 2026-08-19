import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * A placeholder for content that is still on its way.
 *
 * The look is §9.7's: a sunken fill under an green-tinted sweep, 1600ms. The
 * animation itself lives in `globals.css` as `.q-skeleton`, because it needs a
 * pseudo-element, a `:dir()` flip and a reduced-motion rule — none of which a
 * utility class can carry.
 *
 * Size it with utilities at the call site. A skeleton should trace the shape of
 * the thing it replaces, so that nothing jumps when the content lands; that
 * shape is the caller's knowledge, not this component's.
 *
 * `aria-hidden`, and the region announcing it should carry the `aria-busy`: a
 * screen reader gains nothing from a description of grey boxes.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("q-skeleton", className)}
      {...props}
    />
  )
}

export { Skeleton }
