"use client"

<<<<<<< HEAD
import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * The label an icon-only control shows when you point at it.
 *
 * The reveal is CSS — the wrapper is a `group` and the bubble comes up on
 * `:hover`. The one thing CSS cannot express is the rule below, so this holds a
 * single boolean and nothing else; it is still safe to render from a server
 * component, as every call site does.
 *
 * **Pressing the control dismisses the hint.** Once you have clicked, you have
 * acted on the thing the hint was explaining, and a card still sitting over the
 * toolbar is describing a decision you already made — worse on a control you
 * press repeatedly, like a month step, where the pointer never leaves and the
 * card would hang there through every press. It comes back the next time you
 * arrive, because leaving the trigger clears the flag.
 *
 * `pointerdown` rather than `click`: the hint should go as the press begins,
 * not after it resolves.
 *
 * **The tooltip is never the accessible name.** It is `aria-hidden`, exactly
 * like `ChartTip`: the trigger inside carries its own `aria-label`, and a
 * screen reader that heard both would say everything twice. A control whose
 * only label is a tooltip is unusable by keyboard and touch alike, so the
 * `label` here is a *reminder* of the name, not the name itself — pass the
 * same string to both.
 *
 * Centred with a full-width flex row rather than `left-1/2 -translate-x-1/2`:
 * `left-*` is a physical property and would need mirroring in Arabic, while a
 * centred flex row is direction-agnostic and lets the bubble grow past the
 * trigger on either side.
 */
function Tooltip({
  label,
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & { label: React.ReactNode }) {
  const [pressed, setPressed] = React.useState(false)

  return (
    <span
      data-slot="tooltip"
      className={cn("group/tooltip relative inline-flex", className)}
      onPointerDown={() => setPressed(true)}
      // Cleared on the way out, so the next hover starts clean. `pointerleave`
      // fires for touch too, where the "hover" was a tap in the first place.
      onPointerLeave={() => setPressed(false)}
      {...props}
    >
      {children}

      <span
        aria-hidden
        className={cn(
          /*
            Sits above the trigger, out of the way of the row below it. The
            wrapper is `inline-flex` and this is `absolute`, so it takes the
            trigger's width as its centring line and no more.

            `z-50`, not `z-30`. The calendar's sticky day headers and its hour
            gutter both sit at `z-30`, and a hint that ties with the furniture
            it is drawn over loses to whichever painted last — which is how a
            tooltip on the toolbar ends up behind the grid instead of over it.
            Nothing in the app draws above 50 except a dialog, which is modal
            and has no hover behind it to hint about.
          */
          "pointer-events-none absolute inset-x-0 bottom-full z-50 mb-1.5 flex justify-center",
          /*
            `invisible` alongside `opacity-0` so the resting state is genuinely
            out of the picture — an element that is merely transparent still
            takes hit-testing and still counts as painted content for the
            layers above it.
          */
          "invisible translate-y-1 scale-95 opacity-0 transition-all duration-200 ease-[cubic-bezier(.2,.6,.2,1)]",
          /*
            The reveal is dropped entirely once the trigger has been pressed,
            rather than fought with a second rule that has to out-specify it.
            Two competing variants at equal specificity are decided by which one
            Tailwind happens to emit last, which is not something to depend on.

            `group-has-[:focus-visible]` and not `group-focus-within`: a mouse
            click focuses the button, so focus-within would put the card straight
            back up under the pointer that just dismissed it. `:focus-visible`
            is the browser's own answer to "did they arrive here by keyboard",
            which is exactly the case that still needs the hint.
          */
          !pressed && [
            "group-hover/tooltip:visible group-hover/tooltip:translate-y-0 group-hover/tooltip:scale-100 group-hover/tooltip:opacity-100",
            "group-has-[:focus-visible]/tooltip:visible group-has-[:focus-visible]/tooltip:translate-y-0 group-has-[:focus-visible]/tooltip:scale-100 group-has-[:focus-visible]/tooltip:opacity-100",
          ]
        )}
      >
        <span
          className={cn(
            /*
              A light card, not an inverted slab.

              It used to be `bg-foreground` with a `background`-coloured label —
              the same bubble `ChartTip` draws. Over a chart that is right: the
              tip lands on top of the plot and has to separate itself from
              whatever colour is under it. Over a toolbar it is a small black
              rectangle appearing on a cream page, which reads as an error state
              rather than as a hint. The sunken neutral with the ordinary text
              colour is the same surface every other transient panel here uses,
              and the hairline plus the shadow are what lift it off the page now
              that the fill no longer does that work on its own.
            */
            "w-max rounded-md border border-border bg-muted px-2.5 py-1.5",
            /*
              One line, always. These labels are two or three words — "الشهر
              السابق", "Previous month" — and a hint that wraps reads as a
              sentence someone has to stop and parse rather than as the name of
              the thing under the pointer. It is also unstable: the same bubble
              broke to two lines in Arabic and stayed on one in English, so the
              row it hovered over moved by a line height depending on the
              locale.

              The clamp stays as a ceiling for a caller that passes something
              longer than these — it keeps the bubble inside the window even
              when the text would rather not be.
            */
            "whitespace-nowrap max-w-[calc(100vw-2rem)]",
            "text-center text-label leading-tight text-foreground shadow-elevated"
          )}
        >
          {label}
        </span>
      </span>
    </span>
=======
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"

import { cn } from "@/lib/utils"

function TooltipProvider({
  delay = 0,
  ...props
}: TooltipPrimitive.Provider.Props) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delay={delay}
      {...props}
    />
>>>>>>> 46b01788670120b95bba6290cf81ba898193a4c1
  )
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<
    TooltipPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "z-50 inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs text-background has-data-[slot=kbd]:pe-1.5 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-start-2 data-[side=inline-start]:slide-in-from-end-2 data-[side=top]:slide-in-from-bottom-2 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground data-[side=bottom]:top-1 data-[side=inline-end]:top-1/2! data-[side=inline-end]:-start-1 data-[side=inline-end]:-translate-y-1/2 data-[side=inline-start]:top-1/2! data-[side=inline-start]:-end-1 data-[side=inline-start]:-translate-y-1/2 data-[side=top]:-bottom-2.5" />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
