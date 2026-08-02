import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

/**
 * The box, the Arc, the focus treatment and every state live in `.q-field`
 * (globals.css) — shared with Textarea, Select and SelectField so the four
 * cannot drift and a change to the shape language is one edit. Only what is
 * specific to a text input belongs here.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "q-field h-9 px-3 py-1",
        "placeholder:text-muted-foreground",
        "file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-caption file:font-medium file:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Input }
