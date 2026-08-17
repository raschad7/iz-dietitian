"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"

import { useDialogContainer } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  align = "center",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  container,
  positionMethod,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset" | "positionMethod"
  > &
  Pick<PopoverPrimitive.Portal.Props, "container">) {
  /*
   * `container` is this file's one addition to the shadcn component, and it
   * exists for the native `<dialog>`.
   *
   * A modal `<dialog>` renders in the browser's *top layer*, above everything
   * in the normal document — including a popup portalled to `<body>`, which is
   * where this one goes by default. A date picker opened inside one of the
   * app's dialogs would therefore be painted behind its own backdrop. Handing
   * the portal the dialog element instead puts the popup in the top layer with
   * it. See `DatePicker`, which finds that element itself.
   *
   * **Inside a container, the popup positions itself `fixed`.** Being a child
   * of the dialog also means being clipped by it: the app's dialogs carry
   * `overflow-hidden` — they have rounded corners, an internally scrolling
   * body and, on the client card, an animated width — so an absolutely
   * positioned popup, whose containing block is that dialog, was cut off at
   * its edge exactly where a month grid wider than a 30rem card needs to
   * spill. A fixed popup's containing block is the viewport instead, so the
   * dialog's clip no longer applies to it, and Base UI measures the anchor
   * with `getBoundingClientRect` either way. Still overridable per call.
   *
   * **It now defaults to the dialog rather than waiting to be handed one.**
   * Every caller inside a dialog needed this and each had to find the element
   * for itself; `useDialogContainer` publishes it from the dialog that owns the
   * subtree, so a popover added tomorrow gets it without knowing to ask. An
   * explicit `container` still wins.
   */
  const dialogContainer = useDialogContainer()
  const resolvedContainer = container ?? dialogContainer ?? undefined

  return (
    <PopoverPrimitive.Portal container={resolvedContainer}>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        positionMethod={positionMethod ?? (resolvedContainer ? "fixed" : undefined)}
        className="isolate z-50"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "z-50 flex w-72 origin-(--transform-origin) flex-col gap-2.5 rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-start-2 data-[side=inline-start]:slide-in-from-end-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            /*
              Never larger than the room the positioner measured.

              `w-72` and every per-call `w-80` are *ideal* widths, and a popup
              is `position: fixed` — nothing scrolls the page to recover what
              falls outside it. On a 320px screen a 320px popup is already wider
              than the 310px the positioner has after its collision padding, so
              its inline-end edge — the Apply button on the register's filter,
              the notes column in the planner's context panel — was simply off
              the screen. On a short viewport the same was true downwards: the
              date picker's month grid opened below its trigger inside a dialog
              and its last fortnight was unreachable.

              `--available-width` and `--available-height` are what Base UI's
              positioner exposes for exactly this. Clamping to them turns every
              per-call width into "this wide if it fits", and `overflow-y-auto`
              gives the block axis somewhere to put the remainder instead of
              dropping it.

              Declared before `className` so a call site can still override
              either, and it is the reason the fix belongs here rather than in
              the six popovers that had learnt to work around it: `combobox.tsx`
              had already grown its own `max-w-(--available-width)`, which is the
              same repair applied one call site at a time.

            ⚠ A caller that passes its own `overflow-*` **replaces both axes
              here**, because tailwind-merge treats `overflow` as one group with
              `overflow-x`/`overflow-y` — while the `max-h` above survives, since
              that is a different group. So `overflow-hidden` at a call site
              turns into "capped and clipped", which is how the notification
              inbox lost its last rows and its footer link the first time this
              clamp went in. That caller now says `overflow-x-hidden
              overflow-y-auto` for exactly this reason; any new one that wants
              clipping has to spell both axes too.
            */
            "max-h-(--available-height) max-w-(--available-width) overflow-x-hidden overflow-y-auto overscroll-contain",
            className
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-0.5 text-sm", className)}
      {...props}
    />
  )
}

function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn("font-medium", className)}
      {...props}
    />
  )
}

function PopoverDescription({
  className,
  ...props
}: PopoverPrimitive.Description.Props) {
  return (
    <PopoverPrimitive.Description
      data-slot="popover-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
}
