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
 *
 * **No drag handle.** A textarea is resizable by default, and with
 * `field-sizing-content` above that grabber has nothing left to do — the box
 * already grows as it is typed into, between the floor and the ceiling this
 * component sets. What it does instead is let someone drag the field out of the
 * layout it belongs to: past the edge of the dialog holding it, or taller than
 * the `max-h` that exists to keep a footer on screen, which the handle overrides
 * outright. The corner notch is also the one piece of unstyled browser chrome
 * left on `.q-field`, sitting inside a rounded box it does not match.
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "q-field field-sizing-content min-h-24 max-h-64 resize-none px-5 py-3",
        "placeholder:text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
