"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"

import { useDialogContainer } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { cn } from "@/lib/utils"

/**
 * The app's one select, on Base UI.
 *
 * It replaces two things at once: the native `<select>` this file used to hold,
 * which could not be styled past its own box and rendered the operating
 * system's menu on top of an otherwise designed form, and `select-menu.tsx`,
 * which drew its own list and positioned it by hand.
 *
 * The positioning is the reason. The hand-rolled list measured its trigger once
 * on open and placed itself `fixed` at those coordinates, with no flip when
 * there was no room below, no shift to stay on screen, no clamp to the space
 * available and no re-measure on scroll. Base UI's positioner does all four,
 * and reads its direction from the `DirectionProvider` in the locale layout, so
 * `align` resolves to the right edge in Arabic without a second code path.
 *
 * Styling is the project's own: the trigger is `.q-field`, the same box Input
 * and Textarea use, and the list keeps the row height, highlight and check mark
 * the old menu had. The registry's defaults are what the icons and the spacing
 * were adapted *from*, not what shipped.
 */
const Select = SelectPrimitive.Root

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn("scroll-my-1 p-1", className)}
      {...props}
    />
  )
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("flex flex-1 truncate text-start", className)}
      {...props}
    />
  )
}

/**
 * `.q-field` carries the box, the 2px focus edge, the invalid treatment and the
 * disabled state, so none of that is restated here — the trigger is the same
 * control Input is, wearing a chevron.
 *
 * That inheritance now includes having no hover state, which is a real choice
 * rather than an oversight: this trigger *is* clickable in a way a text input
 * is not, but it shares a row with text inputs in every form in the app, and a
 * select that lit up while the fields beside it stayed flat read as the odd one
 * out rather than as the interactive one. The chevron is what says it opens.
 */
function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: "sm" | "default"
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "q-field flex cursor-pointer items-center justify-between gap-2 ps-5 pe-4 text-start",
        "data-[size=default]:h-12 data-[size=sm]:h-10",
        "data-placeholder:text-placeholder",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      )}
      {...props}
    >
      {children}
      {/*
        `Icon` as a child, never as `render`. The primitive's `render` prop
        clones the element it is given and passes children into it, and `Icon`
        fills itself with `dangerouslySetInnerHTML` — React refuses to accept
        both, and the whole route 500s with "Can only set one of `children` or
        `props.dangerouslySetInnerHTML`". The same applies to every registry
        component adapted to this icon set.
      */}
      <SelectPrimitive.Icon className="flex shrink-0">
        <Icon name="chevronDown" className="size-4 text-muted-foreground" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "start",
  alignOffset = 0,
  /*
   * `false`, against the registry's default.
   *
   * `alignItemWithTrigger` is Base UI imitating a native macOS `<select>`: the
   * list opens *over* the trigger with the current row under the pointer, and
   * it is driven by pointer capture — press, drag to a row, release. A plain
   * click on a row is not how that control is meant to be operated, so a value
   * could only be changed by holding the mouse down.
   *
   * It also puts the list on top of the trigger, which inside a dialog means on
   * top of the dialog's own surface. A press that landed between rows went to
   * the dialog underneath, and the dialog reads a click on itself as a click on
   * its backdrop — so choosing from a select closed the whole dialog.
   *
   * `false` is an ordinary dropdown: anchored below the trigger, chosen with a
   * click.
   */
  alignItemWithTrigger = false,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset" | "alignItemWithTrigger"
  >) {
  /*
   * Inside a dialog the list has to be portaled into it, not into `body` —
   * `useDialogContainer` explains why. `undefined` everywhere else, which is
   * Base UI's own default.
   */
  const container = useDialogContainer()

  return (
    <SelectPrimitive.Portal container={container ?? undefined}>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        /*
         * Portalled into the dialog means parented by it, and the dialog clips
         * its own overflow — so an absolutely positioned popup is cut off at
         * the dialog's edge. Fixed positioning takes the viewport as the
         * containing block instead, which is what makes
         * `max-h-(--available-height)` below measure the room that actually
         * exists. Same rule as `popover.tsx` and `combobox.tsx`.
         */
        positionMethod={container ? "fixed" : undefined}
        className="isolate z-50"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          data-align-trigger={alignItemWithTrigger}
          className={cn(
            /*
             * `max-h-(--available-height)` is the clamp the old list never had:
             * the popup is capped at the room the positioner actually found,
             * rather than a fixed 15rem that could still run off the bottom.
             */
            "relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto",
            "rounded-[10px] border border-border bg-popover p-1 text-popover-foreground shadow-elevated",
            "duration-100 data-[align-trigger=true]:animate-none",
            "data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-start-2 data-[side=inline-start]:slide-in-from-end-2 data-[side=top]:slide-in-from-bottom-2",
            "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
            className
          )}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn("px-3 py-1 text-label text-muted-foreground", className)}
      {...props}
    />
  )
}

/**
 * `data-highlighted` and `focus` both paint the same fill: the pointer and the
 * arrow keys must never disagree about which row is next, which is the one
 * thing the old menu got right and is worth keeping.
 */
function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-md px-3 text-body-sm outline-hidden select-none",
        "focus:bg-secondary focus:text-secondary-foreground data-highlighted:bg-secondary data-highlighted:text-secondary-foreground",
        "data-selected:font-semibold",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="truncate" dir="auto">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        render={<span className="pointer-events-none flex size-4 shrink-0 items-center justify-center" />}
      >
        <Icon name="check" className="size-4 text-primary" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "top-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1",
        className
      )}
      {...props}
    >
      <Icon name="chevronUp" className="size-4 text-muted-foreground" />
    </SelectPrimitive.ScrollUpArrow>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "bottom-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1",
        className
      )}
      {...props}
    >
      <Icon name="chevronDown" className="size-4 text-muted-foreground" />
    </SelectPrimitive.ScrollDownArrow>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
