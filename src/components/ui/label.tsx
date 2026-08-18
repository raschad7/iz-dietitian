"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * `.q-label` (globals.css) shifts the label to the brand colour while its
 * field has focus and reverses it on blur in 140ms. That is driven by
 * `:focus-within` on the surrounding `Field`, so wrap the pair in one — a bare
 * Label still renders correctly, it just does not animate.
 */
/**
 * Marks the field required with a `*` after its name.
 *
 * `aria-hidden`, and deliberately: the asterisk is a sighted convention, and
 * the control itself carries `required` or `aria-required` for anyone reading
 * the form through it. Announcing both says "required" twice on every field.
 *
 * `text-destructive` is the same clay the invalid border and the error message
 * use — a field that is required, and a field that is required and empty, are
 * one thought and should not be two colours.
 */
/*
 * `-ms-1` pulls back most of the label's own `gap-2`, which is sized for a
 * leading icon rather than for punctuation. At the full 8px the asterisk read as
 * a separate mark floating beside the label instead of belonging to it.
 */
function RequiredMark() {
  return (
    <span aria-hidden="true" className="-ms-1 text-destructive">
      *
    </span>
  )
}

function Label({
  className,
  required,
  children,
  ...props
}: React.ComponentProps<"label"> & { required?: boolean }) {
  return (
    <label
      data-slot="label"
      className={cn(
        /*
          `text-body-md`, not the 12px `text-caption` this used to draw at.

          A field's label names the answer being asked for and the placeholder
          only illustrates it, so the label had been the smaller of the two —
          12px over a 16px hint — and the example read as the heading of the
          field it was standing in. The label now leads at 16px and the
          placeholder follows one step down; see `Input`.

          `leading-none` stays: the label is a single line stacked tight above
          its control by `Field`'s own gap, not a paragraph.
        */
        "q-label flex items-center gap-2 text-body-md leading-none font-medium select-none",
        "group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50",
        "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
      {required ? <RequiredMark /> : null}
    </label>
  )
}

export { Label }
