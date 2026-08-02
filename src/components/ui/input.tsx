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
        // 48px and 20px of padding, matching the default button: a field and
        // the button that submits it sit in the same row and must be the same
        // height, and the touch-target floor applies to both.
        "q-field h-12 px-5 py-1",
        "placeholder:text-muted-foreground",
        "file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-caption file:font-medium file:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Input }
