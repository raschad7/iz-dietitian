import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Chips and badges are a pill rather than a rounded box, so a label never reads
 * as a control someone forgot to make clickable.
 *
 * Status variants are deliberately not a traffic light. `incomplete` is
 * neutral, never red — a missed day is information, not a failure. `medical`
 * (clay) is the only true alarm colour; don't reach for `destructive` on a
 * badge to mean "bad", reach for the status that actually describes it.
 */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-label font-medium whitespace-nowrap transition-colors [&_svg]:pointer-events-none [&_svg]:size-3",
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
        /*
         * A blank that somebody should fill — the client portal's `غير مسجل`
         * on a record field nobody has written yet.
         *
         * `incomplete`'s dashed edge, because it is still an absence, over
         * `attention`'s amber, because unlike a missed day this one is owed to
         * someone: an allergy list with nothing in it is a question the clinic
         * has not answered. Amber is §Status's "needs follow-up" and it is the
         * warmest this scale goes before clay.
         *
         * ⚠ **Not clay, and this is the one place that matters most.** Clay is
         * the system's only true alarm colour and §Status reserves it for a real
         * allergy, condition or contraindication — so a clay chip on the
         * *allergies* row would state the opposite of what "not recorded" means.
         * Amber says the field is waiting; clay would say the client has one.
         */
        unrecorded:
          "border-dashed border-status-attention-fg/40 bg-status-attention-bg text-status-attention-fg",
        medical: "border-transparent bg-status-medical-bg text-status-medical-fg",
        rest: "border-transparent bg-status-rest-bg text-status-rest-fg",
      },
      size: {
        default: "px-2.5 py-0.5 text-label",
        sm: "px-2 py-0 text-label",
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
