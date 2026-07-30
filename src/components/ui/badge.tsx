import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Status variants come straight from the Qiwam status table (§06): status is
 * deliberately not a traffic light. `incomplete` is neutral grey, never red —
 * a missed day is information, not a failure. `medical` (clay) is the only
 * true alarm colour in the system; don't reach for `destructive` on a badge
 * to mean "bad", reach for the status that actually describes it.
 */
const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/10 text-primary",
        muted: "border-transparent bg-muted text-muted-foreground",
        outline: "border-border text-foreground",
        onTrack: "border-transparent bg-status-on-track-bg text-status-on-track-fg",
        attention: "border-transparent bg-status-attention-bg text-status-attention-fg",
        incomplete: "border-dashed border-status-incomplete-fg/40 bg-status-incomplete-bg text-status-incomplete-fg",
        medical: "border-transparent bg-status-medical-bg text-status-medical-fg",
        rest: "border-transparent bg-status-rest-bg text-status-rest-fg",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
