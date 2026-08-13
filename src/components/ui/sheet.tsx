"use client"

import * as React from "react"
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"

function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-[var(--overlay)] [backdrop-filter:blur(4px)] transition-opacity duration-(--duration-reverse) ease-(--ease-sweep) data-ending-style:opacity-0 data-starting-style:opacity-0",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "inline-end",
  showCloseButton = true,
  showOverlay = true,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: "top" | "bottom" | "inline-start" | "inline-end"
  showCloseButton?: boolean
  /** Non-modal workbench rails leave the underlying canvas available for drag/drop. */
  showOverlay?: boolean
}) {
  return (
    <SheetPortal>
      {showOverlay ? <SheetOverlay /> : null}
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          /*
           * Logical sides, not the registry's `left`/`right`.
           *
           * The registry names its two horizontal sides physically and then
           * undoes each one with an `rtl:` counter-translate. This app renders
           * Arabic and English from the same markup and has a lint rule
           * forbidding physical inset properties for exactly that reason, so
           * the sides are `inline-start` and `inline-end` and the insets and
           * borders follow the document direction on their own.
           *
           * The slide still needs both directions spelled out: `translate` has
           * no logical form, so the start-side sheet moves negatively in LTR
           * and positively in RTL, and the end-side sheet the other way.
           */
          "fixed z-50 flex flex-col bg-popover bg-clip-padding text-sm text-popover-foreground shadow-overlay ring-1 ring-foreground/10 transition duration-(--duration-sweep) ease-(--ease-sweep) data-ending-style:opacity-0 data-starting-style:opacity-0 " +
            "data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=top]:data-ending-style:-translate-y-10 data-[side=top]:data-starting-style:-translate-y-10 " +
            "data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=bottom]:data-ending-style:translate-y-10 data-[side=bottom]:data-starting-style:translate-y-10 " +
            "data-[side=inline-start]:inset-y-0 data-[side=inline-start]:start-0 data-[side=inline-start]:h-full data-[side=inline-start]:w-3/4 data-[side=inline-start]:border-e data-[side=inline-start]:sm:max-w-sm " +
            "data-[side=inline-start]:data-ending-style:-translate-x-10 data-[side=inline-start]:data-starting-style:-translate-x-10 " +
            "rtl:data-[side=inline-start]:data-ending-style:translate-x-10 rtl:data-[side=inline-start]:data-starting-style:translate-x-10 " +
            "data-[side=inline-end]:inset-y-0 data-[side=inline-end]:end-0 data-[side=inline-end]:h-full data-[side=inline-end]:w-3/4 data-[side=inline-end]:border-s data-[side=inline-end]:sm:max-w-sm " +
            "data-[side=inline-end]:data-ending-style:translate-x-10 data-[side=inline-end]:data-starting-style:translate-x-10 " +
            "rtl:data-[side=inline-end]:data-ending-style:-translate-x-10 rtl:data-[side=inline-end]:data-starting-style:-translate-x-10",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-3 end-3"
                size="icon-sm"
              />
            }
          >
            <Icon name="close" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-0.5 p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "font-heading text-base font-medium text-foreground",
        className
      )}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
