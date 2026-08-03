import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Shape: "the Arc" — 16px base radius, 32px sweep on the block-end/inline-end
 * corner, growing to 36px when the card is interactive and hovered.
 *
 * **One tail per surface.** A card already carries the sweep, so nothing
 * nested inside it may sweep again — that is why `list-row` exists as a
 * variant rather than as a Card inside a Card.
 */
const cardVariants = cva(
  "group/card relative flex flex-col gap-(--card-spacing) rounded-lg rounded-ee-4xl text-body-md [--card-spacing:--spacing(4)] sm:[--card-spacing:--spacing(5)]",
  {
    variants: {
      variant: {
        /** The default surface: white, hairline ring, olive-tinted shadow. */
        default: "overflow-hidden bg-card py-(--card-spacing) text-card-foreground shadow-card ring-1 ring-foreground/10",

        /** Brand-tinted. For a plan or a summary that belongs to the clinic. */
        tinted:
          "overflow-hidden bg-secondary py-(--card-spacing) text-secondary-foreground shadow-card ring-1 ring-primary/15",

        /**
         * Empty state — a dashed olive-300 outline, no fill and no shadow.
         * Reads as a space waiting to be filled rather than a failed load.
         */
        empty:
          "border border-dashed border-[var(--olive-300)] bg-transparent py-(--card-spacing) text-muted-foreground",

        /**
         * A row inside a group. No shadow and no sweep — the group's container
         * owns the tail, and 20 swept rows would be 20 competing tails.
         * `group-*:last:` restores it on the final row so the stack still ends
         * in the brand shape.
         */
        listRow:
          "gap-2 rounded-none rounded-ee-none border-b border-border bg-transparent py-3 last:border-b-0 last:rounded-b-lg last:rounded-ee-4xl",

        /**
         * Archived / disabled. Sunken fill, secondary text, no elevation —
         * present, readable, plainly not live.
         */
        archived:
          "overflow-hidden bg-muted py-(--card-spacing) text-muted-foreground ring-1 ring-border",
      },
      size: {
        default: "",
        sm: "[--card-spacing:--spacing(3)] sm:[--card-spacing:--spacing(4)]",
      },
      /**
       * Opt-in interactivity. A card that answers the pointer is promising it
       * does something when clicked, so this is a prop rather than a default.
       *
       * The answer is the **edge thickening**, not a lift: `ring-2` in the
       * brand colour, with the tail growing on the system's one curve. A raised
       * shadow reads as the card leaving the page, which on a grid of four
       * peers makes the hovered one look like it belongs to a different layer;
       * a thicker edge says "this one" while the card stays where it is. It is
       * also the same language `selected` already speaks — the edge, never the
       * fill.
       */
      interactive: {
        true: "cursor-pointer transition-all duration-200 ease-[cubic-bezier(.2,.6,.2,1)] hover:rounded-ee-[2.25rem] hover:ring-2 hover:ring-primary active:scale-[.995]",
        false: "",
      },
      /** Selected — the olive edge thickens rather than the card changing colour. */
      selected: {
        true: "ring-2 ring-primary",
        false: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      interactive: false,
      selected: false,
    },
  }
)

type CardProps = React.ComponentProps<"div"> &
  VariantProps<typeof cardVariants> & {
    /**
     * A medical flag. Renders a clay marker in the block-start/inline-end
     * corner — never a red card. The flag is one fact about the client, not a
     * verdict on the whole record.
     */
    flagged?: boolean
  }

function Card({
  className,
  variant,
  size = "default",
  interactive,
  selected,
  flagged,
  children,
  ...props
}: CardProps) {
  return (
    <div
      data-slot="card"
      data-size={size}
      data-variant={variant ?? "default"}
      className={cn(
        cardVariants({ variant, size, interactive, selected }),
        "has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0",
        "*:[img:first-child]:rounded-t-lg *:[img:last-child]:rounded-b-lg *:[img:last-child]:rounded-ee-4xl",
        className
      )}
      {...props}
    >
      {flagged ? (
        <span
          aria-hidden
          className="absolute top-3 end-3 size-2.5 rounded-full bg-status-medical-fg"
        />
      ) : null}
      {children}
    </div>
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-lg px-(--card-spacing)",
        "has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto]",
        "[.border-b]:pb-(--card-spacing)",
        "group-data-[variant=listRow]/card:px-0",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-heading text-heading-sm leading-snug font-semibold group-data-[size=sm]/card:text-body-md",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-caption text-muted-foreground", className)}
      {...props}
    />
  )
}

/** The inline-end marker in a header row: status chip, avatar, icon, or dot. */
function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-(--card-spacing) group-data-[variant=listRow]/card:px-0", className)}
      {...props}
    />
  )
}

/**
 * An arc divider rather than a straight rule: a hairline that stops short of
 * the inline-end edge so it does not collide with the tail below it. Use it
 * where a card genuinely has two parts; a plain `border-t` is fine elsewhere.
 *
 * `me-*` rather than a gradient, because CSS gradients take angles and have no
 * logical direction keyword — a `to right` fade would run the wrong way in
 * Arabic and the bug would be invisible in the English build.
 */
function CardDivider({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-divider"
      aria-hidden
      className={cn("ms-(--card-spacing) me-10 h-px bg-border", className)}
      {...props}
    />
  )
}

/** Metadata inline-start, action inline-end. */
function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center gap-2 rounded-b-lg rounded-ee-4xl border-t bg-muted/50 p-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

/**
 * The skeleton a card shows while its data loads. Same shape, same footprint,
 * so nothing jumps when the content arrives.
 */
function CardSkeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-skeleton"
      aria-hidden
      className={cn(
        "flex flex-col gap-3 rounded-lg rounded-ee-4xl bg-card p-4 shadow-card ring-1 ring-foreground/10",
        className
      )}
      {...props}
    >
      <div className="h-4 w-1/3 rounded-sm bg-muted motion-safe:animate-pulse" />
      <div className="h-3 w-2/3 rounded-sm bg-muted motion-safe:animate-pulse" />
      <div className="h-3 w-1/2 rounded-sm bg-muted motion-safe:animate-pulse" />
    </div>
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
  CardDivider,
  CardSkeleton,
  cardVariants,
}
