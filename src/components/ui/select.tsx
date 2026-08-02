import * as React from "react"

import { Icon } from "@/components/ui/icon"
import { cn } from "@/lib/utils"

/**
 * A native `<select>` with a chevron this app draws itself.
 *
 * Deliberately not a JavaScript combobox: keyboard behaviour, screen-reader
 * semantics and the mobile native picker all come for free, it mirrors in RTL
 * without a direction prop, and it ships no client bundle.
 *
 * The browser's own arrow is suppressed because Chrome pins it to the border
 * and ignores `padding-inline-end` on a `<select>` — any attempt to give long
 * option text room to breathe is silently dropped and the value runs into the
 * arrow. `appearance: none` plus our own Solar chevron fixes it once, here.
 *
 * The chevron is positioned with `end-*` and the padding with `pe-*`, so both
 * follow the document direction. The box itself is `.q-field` — shared with
 * Input and Textarea, see globals.css.
 */
function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative w-full">
      <select
        data-slot="select"
        className={cn("q-field h-9 appearance-none py-1 ps-3 pe-9", className)}
        {...props}
      >
        {children}
      </select>

      {/*
        `pointer-events-none` so clicking the chevron still opens the select —
        the icon sits on top of the control that owns the interaction.
      */}
      <Icon
        name="chevronDown"
        className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
}

export { Select }
