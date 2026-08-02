import * as React from "react"

import { cn } from "@/lib/utils"

import { Card, CardContent } from "./card"

/**
 * What a screen shows when there is genuinely nothing on it yet.
 *
 * Empty is the normal first state of a portal account, not a failure: a client
 * whose dietitian has not booked them in or written their plan yet should read a
 * sentence telling them what happens next, not a bare "no results". So this is
 * deliberately a card with a title and an explanation rather than a line of grey
 * text, and it carries no status colour — nothing has gone wrong.
 *
 * The icon sits in a circle, not a swept surface: `Card` already carries the one
 * tail this block is allowed (design-system.md, "one tail per surface").
 */
function EmptyState({
  icon: Icon,
  title,
  description,
  className,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  className?: string
  /** An optional action or hint below the copy. Most empty states have none. */
  children?: React.ReactNode
}) {
  return (
    <Card className={cn("bg-muted/40 shadow-none", className)}>
      <CardContent className="flex flex-col items-center gap-4 py-6 text-center">
        <span
          aria-hidden
          className="flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
        >
          <Icon className="size-5" />
        </span>

        <div className="space-y-1.5">
          <p className="font-heading text-base leading-snug font-medium">{title}</p>
          {description ? (
            <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>

        {children}
      </CardContent>
    </Card>
  )
}

export { EmptyState }
