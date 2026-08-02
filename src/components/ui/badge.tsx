import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Chips and badges are the one shape in this system that stays a plain pill —
 * no sweep. The Arc marks surfaces you can act on; a badge is a label.
 *
 * Status variants are deliberately not a traffic light. `incomplete` is
 * neutral, never red — a missed day is information, not a failure. `medical`
 * (clay) is the only true alarm colour; don't reach for `destructive` on a
 * badge to mean "bad", reach for the status that actually describes it.
 */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-micro font-medium whitespace-nowrap transition-colors [&_svg]:pointer-events-none [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-secondary text-secondary-foreground",
        muted: "border-transparent bg-muted text-muted-foreground",
        outline: "border-border text-foreground",
        /** The lime chip. One per screen, same rule as the accent button. */
        accent: "border-transparent bg-accent-lime text-on-accent",
        onTrack: "border-transparent bg-status-on-track-bg text-status-on-track-fg",
        attention: "border-transparent bg-status-attention-bg text-status-attention-fg",
        /*
         * Dashed, because "incomplete" is an absence rather than an event. The
         * fill and text stay neutral.
         */
        incomplete:
          "border-dashed border-status-incomplete-fg/40 bg-status-incomplete-bg text-status-incomplete-fg",
        medical: "border-transparent bg-status-medical-bg text-status-medical-fg",
        rest: "border-transparent bg-status-rest-bg text-status-rest-fg",
      },
      size: {
        default: "px-2.5 py-0.5 text-micro",
        sm: "px-2 py-0 text-micro",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Badge({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant, size }), className)} {...props} />
  )
}

/**
 * The 10px status dot a card header can carry instead of a full chip, for when
 * the label is already in the title next to it.
 */
function StatusDot({
  status,
  className,
  ...props
}: React.ComponentProps<"span"> & {
  status: "onTrack" | "attention" | "incomplete" | "medical" | "rest"
}) {
  const fill = {
    onTrack: "bg-status-on-track-fg",
    attention: "bg-status-attention-fg",
    incomplete: "bg-status-incomplete-fg",
    medical: "bg-status-medical-fg",
    rest: "bg-status-rest-fg",
  }[status]

  return <span aria-hidden className={cn("size-2.5 rounded-full", fill, className)} {...props} />
}

export { Badge, StatusDot, badgeVariants }
