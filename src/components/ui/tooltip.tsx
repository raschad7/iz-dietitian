import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * The label an icon-only control shows when you point at it.
 *
 * Pure CSS — it wraps its trigger in a `group` and reveals the bubble on
 * `:hover` or `:focus-within`, so it works inside a server component and adds
 * nothing to the client bundle. The dashboard's charts already reveal their
 * tips the same way; this is that pattern with the positioning built in,
 * because every caller anchors a tooltip in the same place and a chart mark
 * does not.
 *
 * **The tooltip is never the accessible name.** It is `aria-hidden`, exactly
 * like `ChartTip`: the trigger inside carries its own `aria-label`, and a
 * screen reader that heard both would say everything twice. A control whose
 * only label is a tooltip is unusable by keyboard and touch alike, so the
 * `label` here is a *reminder* of the name, not the name itself — pass the
 * same string to both.
 *
 * Centred with a full-width flex row rather than `left-1/2 -translate-x-1/2`:
 * `left-*` is a physical property and would need mirroring in Arabic, while a
 * centred flex row is direction-agnostic and lets the bubble grow past the
 * trigger on either side.
 */
function Tooltip({
  label,
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & { label: React.ReactNode }) {
  return (
    <span
      data-slot="tooltip"
      className={cn("group/tooltip relative inline-flex", className)}
      {...props}
    >
      {children}

      <span
        aria-hidden
        className={cn(
          // Sits above the trigger, out of the way of the row below it. The
          // wrapper is `inline-flex` and this is `absolute`, so it takes the
          // trigger's width as its centring line and no more.
          "pointer-events-none absolute inset-x-0 bottom-full z-30 mb-1.5 flex justify-center",
          "translate-y-1 scale-95 opacity-0 transition-all duration-200 ease-[cubic-bezier(.2,.6,.2,1)]",
          "group-hover/tooltip:translate-y-0 group-hover/tooltip:scale-100 group-hover/tooltip:opacity-100",
          "group-focus-within/tooltip:translate-y-0 group-focus-within/tooltip:scale-100 group-focus-within/tooltip:opacity-100"
        )}
      >
        <span
          className={cn(
            // Same bubble as ChartTip — inverted, Arc-shaped, elevated — so a
            // hint over a table button and a hint over a chart mark read as
            // one thing.
            "w-max max-w-44 rounded-md rounded-ee-xl bg-foreground px-2.5 py-1.5",
            "text-center text-label leading-tight text-background shadow-elevated"
          )}
        >
          {label}
        </span>
      </span>
    </span>
  )
}

export { Tooltip }
