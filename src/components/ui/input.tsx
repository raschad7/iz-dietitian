import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { Icon, type IconName } from "@/components/ui/icon"
import { cn } from "@/lib/utils"

/**
 * The box, the shape, the focus treatment and every state live in `.q-field`
 * (globals.css) — shared with Textarea, Select and SelectField so the four
 * cannot drift and a change to the shape language is one edit. Only what is
 * specific to a text input belongs here.
 */
type InputProps = React.ComponentProps<"input"> & {
  /**
   * A leading glyph inside the box, at the field's inline-start. The auth
   * screens put one on every field; three of them were hand-rolling the same
   * `relative` wrapper and absolute span, which is how a design system drifts.
   *
   * It is decorative — the `Label` above carries the name of the field, and an
   * icon announced beside it would say everything twice.
   */
  icon?: IconName
}

function Input({ className, type, icon, ...props }: InputProps) {
  const field = (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        // 48px and 20px of padding, matching the default button: a field and
        // the button that submits it sit in the same row and must be the same
        // height, and the touch-target floor applies to both.
        "q-field h-12 px-5 py-1",
        /*
          One step under the value it stands in for, and under the `Label`
          above it. The placeholder is an example, not the answer and not the
          name of the field: at the same 16px as both it competed with them,
          and an empty form read as a column of filled-in boxes.
        */
        "placeholder:text-body-sm placeholder:text-placeholder",
        "file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-caption file:font-medium file:text-foreground",
        // The well below is 48px, so the text starts where a field with no icon
        // would have its 20px of padding, plus the glyph and a gap.
        icon && "ps-12",
        className
      )}
      {...props}
    />
  )

  if (!icon) return field

  return (
    <span className="relative block">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 start-0 flex w-12 items-center justify-center text-muted-foreground"
      >
        <Icon name={icon} className="size-5" />
      </span>
      {field}
    </span>
  )
}

export { Input }
