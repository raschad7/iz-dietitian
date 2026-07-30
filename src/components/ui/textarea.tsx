import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // Shape: "the Arc" (§9.3) — 10px base radius, 24px sweep on the block-end/inline-end corner.
        "q-field-arc field-sizing-content min-h-16 w-full rounded-[10px] rounded-ee-xl border border-input bg-transparent px-2.5 py-1.5 text-base transition-all duration-220 ease-[cubic-bezier(.2,.6,.2,1)] outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-field-focus-halo disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
