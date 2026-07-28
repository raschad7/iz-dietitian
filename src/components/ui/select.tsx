import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * A native <select>. Deliberately not a JavaScript combobox: it is keyboard and
 * screen-reader correct for free, mirrors automatically in RTL, and ships no
 * client bundle. `bg-position` is left to the browser so the arrow follows the
 * document direction.
 */
function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30",
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
}

export { Select }
