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
  /**
   * Paints controlled text in an ordinary text layer while retaining the
   * native input for focus, selection, keyboard input and accessibility.
   *
   * Almarai contains Arabic glyph ink below the descent declared in its font
   * metrics. Chromium clips that ink inside native inputs, which can remove
   * the lower dots from letters such as ي. Enable this only for affected
   * Arabic text/search fields and mirror the field's inline padding through
   * `unclippedTextClassName`.
   */
  unclippedText?: boolean
  unclippedTextClassName?: string
  unclippedTextDirection?: React.HTMLAttributes<HTMLSpanElement>["dir"]
}

function Input({
  className,
  type,
  icon,
  unclippedText = false,
  unclippedTextClassName,
  unclippedTextDirection = "auto",
  style,
  value,
  placeholder,
  ...props
}: InputProps) {
  const visibleText = value === undefined || value === "" ? placeholder : String(value)
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
        unclippedText && "placeholder:text-transparent",
        className
      )}
      style={
        unclippedText
          ? {
              ...style,
              color: "transparent",
              WebkitTextFillColor: "transparent",
              caretColor: style?.caretColor ?? "var(--foreground)",
            }
          : style
      }
      value={value}
      placeholder={placeholder}
      {...props}
    />
  )

  if (!icon && !unclippedText) return field

  /*
    ⚠ **With an `icon` or `unclippedText`, the field is no longer the outer
    element — and `className` still goes to the inner `<input>`.**

    That is right for anything describing the *field*: padding, text, state
    overrides. It is wrong for anything describing its *box* in a parent's
    layout. `.q-field` pins the input to `width: 100%`, so the input measures
    100% of this span while the span measures itself from the input — and in a
    flex or grid parent, where `width: auto` means shrink-to-fit rather than
    fill, that resolves to the input's intrinsic ~20 characters. A `w-full`,
    `flex-1` or `min-w-*` passed here lands on the wrong box and silently does
    nothing.

    Put layout on a wrapper around this component instead. `DishFilters` is the
    call site that hit it and carries the worked example; `dish-catalog.tsx` is
    unaffected because its parent is a block, where `display: block` already
    fills the line.
  */
  return (
    <span className="relative block">
      {icon ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 start-0 flex w-12 items-center justify-center text-muted-foreground"
        >
          <Icon name={icon} className="size-5" />
        </span>
      ) : null}
      {field}
      {unclippedText ? (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 start-0 end-0 flex min-w-0 items-center overflow-visible whitespace-nowrap",
            icon ? "ps-12 pe-5" : "px-5",
            unclippedTextClassName,
          )}
        >
          <span
            dir={unclippedTextDirection}
            className="min-w-0 flex-1 truncate text-start"
          >
            {visibleText}
          </span>
        </span>
      ) : null}
    </span>
  )
}

export { Input }
