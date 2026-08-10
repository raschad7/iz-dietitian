import * as React from "react"

import { cn } from "@/lib/utils"

import { Card, CardContent } from "./card"
import { Icon, type IconName } from "./icon"

/**
 * What a screen shows when there is genuinely nothing on it yet.
 *
 * Empty is the normal first state of a portal account, not a failure: a client
 * whose dietitian has not booked them in or written their plan yet should read a
 * sentence telling them what happens next, not a bare "no results". So this is
 * deliberately a card with a title and an explanation rather than a line of grey
 * text, and it carries no status colour — nothing has gone wrong.
 *
 * The icon sits in a circle rather than in a rounded box, so it reads as a mark
 * inside the card rather than as a second card nested in the first.
 *
 * ## Two layouts
 *
 * `stacked` is the screen-filling one above: centred, icon on top, the shape a
 * page takes when there is nothing on it at all.
 *
 * `row` is the same card laid on its side — copy at the inline-start, the mark
 * at the inline-end — for the smaller job of *ending* a list that does have
 * things in it. The portal's appointments page closes its upcoming list with
 * one, saying there are no more after these. A stacked card there would be a
 * second empty state under a populated list and would read as a failure; on its
 * side it reads as the list finishing, which is what it is. The mark moves to
 * the far end because it is decoration on this one — the sentence is doing the
 * work, and a glyph in front of it would make it look like a status message.
 */
function EmptyState({
  icon,
  title,
  description,
  layout = "stacked",
  className,
  children,
}: {
  icon: IconName
  title: string
  description?: string
  /** `row` for a list terminator; `stacked` (the default) for a whole screen. */
  layout?: "stacked" | "row"
  className?: string
  /** An optional action or hint below the copy. Most empty states have none. */
  children?: React.ReactNode
}) {
  const row = layout === "row"

  return (
    <Card className={cn("bg-muted/40 shadow-none", className)}>
      <CardContent
        className={cn(
          "flex gap-4 py-6",
          // `flex-row-reverse` rather than reordering the JSX: it reverses
          // against the writing direction, so the mark lands at the inline-end
          // in Arabic and in English from the one declaration, and the icon
          // stays first in the DOM where it is already `aria-hidden`.
          row ? "flex-row-reverse items-center text-start" : "flex-col items-center text-center"
        )}
      >
        <span
          className={cn(
            "flex items-center justify-center rounded-full bg-secondary text-secondary-foreground",
            row ? "size-11 shrink-0" : "size-12"
          )}
        >
          {/* `Icon` is aria-hidden unless given a label; the title says it. */}
          <Icon name={icon} className="size-5" />
        </span>

        <div className={cn("space-y-1.5", row && "min-w-0 flex-1")}>
          <p className="font-heading text-base leading-snug font-medium">{title}</p>
          {description ? (
            <p
              className={cn(
                "text-sm leading-relaxed text-muted-foreground",
                !row && "mx-auto max-w-sm"
              )}
            >
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
