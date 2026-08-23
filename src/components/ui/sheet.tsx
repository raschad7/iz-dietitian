"use client"

import * as React from "react"
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { SheetGrip, useSheetDrag } from "@/components/ui/dialog-drag"

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
  onDismiss,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: "top" | "bottom" | "inline-start" | "inline-end"
  showCloseButton?: boolean
  /** Non-modal workbench rails leave the underlying canvas available for drag/drop. */
  showOverlay?: boolean
  /**
   * Closes the sheet, and by supplying it a **bottom** sheet becomes draggable:
   * it grows a grip and can be pushed back down to the edge it rose from. See
   * `dialog-drag.tsx`, which is the same gesture `Dialog`'s own sheet placement
   * arms, so a reader learns it once.
   *
   * Opt-in rather than derived from `side`, because this component does not own
   * the open state — the caller's `Sheet` does, and only the caller can put it
   * back. A bottom sheet that omits this keeps the close button and the
   * backdrop and simply has no gesture.
   *
   * Ignored on the three other sides: the gesture is downward-only, which is
   * the only direction a sheet against the block-end edge has slack in.
   */
  onDismiss?: () => void
}) {
  /*
    The surface the gesture translates. Base UI forwards this to the popup
    element itself, which is the box carrying the `translate` the drag writes.
  */
  const popupRef = React.useRef<HTMLDivElement>(null)
  const canDrag = side === "bottom" && onDismiss !== undefined
  const dragProps = useSheetDrag(popupRef, {
    enabled: canDrag,
    // Never called while `enabled` is false — the hook returns no handler.
    onDismiss: onDismiss ?? (() => {}),
  })

  return (
    <SheetPortal>
      {showOverlay ? <SheetOverlay /> : null}
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        ref={popupRef}
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
        {/*
          First child, so the pill is the first row of this flex column and the
          header sits under it. Rendered only for a draggable bottom sheet, and
          `display: none` from `sm` up comes from `globals.css` — the same rule
          `Dialog`'s grip reads, so the two surfaces cannot drift apart.
        */}
        {canDrag ? <SheetGrip {...dragProps} /> : null}
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

/**
 * The sheet's scrolling region — everything between the header and the footer.
 *
 * The counterpart of `DialogBody`, and the same contract: **wrap the middle of
 * a sheet in this and it scrolls while the header and the footer stay.** The
 * geometry lives on the `data-slot` in `globals.css` beside the dialog frame,
 * so the two surfaces cannot drift apart.
 *
 * It is optional, and a sheet that omits it still cannot be cropped — the
 * ceiling applies either way and the sheet scrolls as a whole instead. Reach
 * for it wherever a sheet has an action a reader has to get back to.
 */
function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-body"
      className={cn("flex flex-col gap-3 p-4", className)}
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
  SheetBody,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
