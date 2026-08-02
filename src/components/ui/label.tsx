"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * `.q-label` (globals.css) shifts the label to the brand colour while its
 * field has focus and reverses it on blur in 140ms. That is driven by
 * `:focus-within` on the surrounding `Field`, so wrap the pair in one — a bare
 * Label still renders correctly, it just does not animate.
 */
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "q-label flex items-center gap-2 text-caption leading-none font-medium select-none",
        "group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50",
        "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }
