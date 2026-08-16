"use client"

import { Progress as ProgressPrimitive } from "@base-ui/react/progress"

import { cn } from "@/lib/utils"

/**
 * What the filled part of the track means, and therefore what colour it takes.
 *
 * `brand` is olive, the app's action colour, and stays the default so every
 * existing call site is untouched.
 *
 * `measure` is for a bar that reports a *quantity* rather than the progress of
 * something the reader started — the clients register's adherence column is the
 * case it was added for. It exists because olive is explicitly not this
 * system's data colour (see the `viz-brand` note in `globals.css`: olive marks
 * what you can act on), and because the obvious alternative, amber, already
 * means "needs follow-up" — a register of nine amber bars would report every
 * client as a problem.
 */
const INDICATOR_TONE = {
  brand: "bg-primary",
  measure: "bg-viz-progress",
} as const

function Progress({
  className,
  children,
  value,
  tone = "brand",
  ...props
}: ProgressPrimitive.Root.Props & {
  /** Which meaning the fill carries. See {@link INDICATOR_TONE}. */
  tone?: keyof typeof INDICATOR_TONE
}) {
  return (
    <ProgressPrimitive.Root
      value={value}
      data-slot="progress"
      className={cn("flex flex-wrap gap-3", className)}
      {...props}
    >
      {children}
      <ProgressTrack>
        <ProgressIndicator className={INDICATOR_TONE[tone]} />
      </ProgressTrack>
    </ProgressPrimitive.Root>
  )
}

function ProgressTrack({ className, ...props }: ProgressPrimitive.Track.Props) {
  return (
    <ProgressPrimitive.Track
      className={cn(
        "relative flex h-1 w-full items-center overflow-x-hidden rounded-full bg-muted",
        className
      )}
      data-slot="progress-track"
      {...props}
    />
  )
}

function ProgressIndicator({
  className,
  ...props
}: ProgressPrimitive.Indicator.Props) {
  return (
    <ProgressPrimitive.Indicator
      data-slot="progress-indicator"
      className={cn("h-full bg-primary transition-all", className)}
      {...props}
    />
  )
}

function ProgressLabel({ className, ...props }: ProgressPrimitive.Label.Props) {
  return (
    <ProgressPrimitive.Label
      className={cn("text-sm font-medium", className)}
      data-slot="progress-label"
      {...props}
    />
  )
}

function ProgressValue({ className, ...props }: ProgressPrimitive.Value.Props) {
  return (
    <ProgressPrimitive.Value
      className={cn(
        "ms-auto text-sm text-muted-foreground tabular-nums",
        className
      )}
      data-slot="progress-value"
      {...props}
    />
  )
}

export {
  Progress,
  ProgressTrack,
  ProgressIndicator,
  ProgressLabel,
  ProgressValue,
}
