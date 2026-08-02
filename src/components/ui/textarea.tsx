import * as React from "react"

import { cn } from "@/lib/utils"

/** See Input — the box and all of its states come from `.q-field`. */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "q-field field-sizing-content min-h-24 px-5 py-3",
        "placeholder:text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
