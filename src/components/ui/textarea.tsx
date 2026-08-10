import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * See Input — the box and all of its states come from `.q-field`.
 *
 * **`field-sizing-content` needs a ceiling.** It grows the box to fit whatever
 * has been typed, and without a maximum that is unbounded: a client's
 * medication list pushed the field past the bottom of the dialog holding it,
 * taking the footer's save button off screen with it. The registry's own
 * textarea has the same gap, so this is not something a swap would have fixed.
 *
 * `max-h-64` is roughly ten lines — past the point where a field is still being
 * read as a field, and short enough to leave a dialog its footer. The textarea
 * scrolls its own overflow from there, which is the browser default and needs
 * no `overflow` of its own.
 *
 * A caller that genuinely needs more can raise it; `max-h-*` from `className`
 * wins on tailwind-merge, so passing one replaces this rather than fighting it.
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "q-field field-sizing-content min-h-24 max-h-64 px-5 py-3",
        "placeholder:text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
