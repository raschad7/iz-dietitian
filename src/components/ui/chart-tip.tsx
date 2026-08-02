import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * The little bubble a chart mark shows on hover.
 *
 * Only the bubble: positioning and the show/hide trigger belong to the chart,
 * because a column, a horizontal bar and a donut segment anchor their tip in
 * three different places. What is shared — and what this exists to keep from
 * drifting across three copies — is the shape, the fill and the type.
 *
 * Inverted (`--foreground` on `--background`, 16.6:1) so it reads as a layer
 * above the card rather than another card. It carries the Arc like any other
 * surface, and `pointer-events-none` so it can never eat the hover that
 * summoned it.
 *
 * **A tip never carries a value that is not already on the page.** Every chart
 * here prints its counts in text; the tip is a convenience, not the only way to
 * read the data, which is why it is `aria-hidden` — a screen reader would
 * otherwise hear each number twice.
 */
function ChartTip({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="chart-tip"
      aria-hidden
      className={cn(
        "pointer-events-none w-max max-w-44 rounded-md rounded-ee-xl bg-foreground px-2.5 py-1.5",
        "text-center text-label leading-tight text-background shadow-elevated",
        className
      )}
      {...props}
    />
  )
}

export { ChartTip }
