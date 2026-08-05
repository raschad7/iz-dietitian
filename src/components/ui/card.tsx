import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { Icon, type IconName } from "@/components/ui/icon"
import { cn } from "@/lib/utils"

/**
 * Shape: a 16px radius on all four corners.
 *
 * A card is still one surface, which is why `listRow` exists as a variant
 * rather than as a Card inside a Card — nesting the real thing would stack two
 * fills, two rings and two shadows on the same row.
 */
const cardVariants = cva(
  "group/card relative flex flex-col gap-(--card-spacing) rounded-lg text-body-md [--card-spacing:--spacing(4)] sm:[--card-spacing:--spacing(5)]",
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
         * A row inside a group. Square and unshadowed — the group's container
         * owns the shape, and 20 rounded rows inside it would be 20 boxes
         * fighting the one that contains them. The last row rounds its
         * block-end corners so the stack ends flush with that container.
         */
        listRow:
          "gap-2 rounded-none border-b border-border bg-transparent py-3 last:border-b-0 last:rounded-b-lg",

        /**
         * An item inside a card, as its own surface: rounded, muted fill, no
         * ring and no shadow. The shape the dashboard's agenda has always drawn
         * by hand for an appointment — a card that reads as a card without
         * stacking a second ring and shadow on top of the one containing it.
         *
         * Use it where the items in a list are separate things you act on;
         * `listRow` is for a list that reads as one ruled column, and fills its
         * container edge to edge. The tile owns its own padding, so the header
         * and content inside it drop theirs — 16px, the same inset the card
         * around it uses, because a tile carrying its own controls needs the
         * air a ruled row does not.
         */
        tile: "gap-2 rounded-lg bg-muted/60 p-4",

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
       * **The edge colours, and the icon fills.** The hairline stays a
       * hairline and turns the brand colour, with the icon disc going olive and
       * its glyph inverting to white. Not a lift: a raised shadow reads as the
       * card leaving the page, which on a grid of peers makes the hovered one
       * look like it belongs to a different layer. Not a thicker ring either —
       * at 2px the edge grew into the gap between tiles and the row read as
       * jumpy; colour alone says "this one" while the geometry holds
       * completely still. `selected` keeps `ring-2`, because a persistent state
       * has to outrank a transient one.
       *
       * The card's geometry does **not** change with it. A corner that moves
       * under the pointer shifts the surface while you are reading it; the ring
       * says the same thing and the card stays still.
       *
       * A card that is *not* interactive answers with its icon alone — see
       * `CardTitle` below. Only a card you can click gets the edge.
       */
      interactive: {
        true: "cursor-pointer transition-all duration-200 ease-[cubic-bezier(.2,.6,.2,1)] hover:ring-1 hover:ring-primary active:scale-[.995]",
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
        "*:[img:first-child]:rounded-t-lg *:[img:last-child]:rounded-b-lg",
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
        "group-data-[variant=listRow]/card:px-0 group-data-[variant=tile]/card:px-0",
        className
      )}
      {...props}
    />
  )
}

/**
 * `icon` is a plain glyph beside the title — never a badge or a filled
 * circle. The card's own ring and fill already say "this is a surface"; a
 * second contained shape inside it reads as another surface again. The icon
 * just labels the section, the way a heading would in a document.
 *
 * **It is also the card's hover response.** Pointing at a card turns this one
 * glyph olive; on a card that draws its icon on a disc, the disc fills olive
 * and the glyph inverts to white instead. On a plain card that is the whole
 * response — the edge belongs to `interactive` above, and a card you cannot
 * click has no business promising otherwise. Any icon a card puts in its own
 * header should follow the same rule.
 */
function CardTitle({
  className,
  icon,
  children,
  ...props
}: React.ComponentProps<"div"> & { icon?: IconName }) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-heading text-heading-sm leading-snug font-semibold group-data-[size=sm]/card:text-body-md",
        icon && "flex items-center gap-2",
        className
      )}
      {...props}
    >
      {icon ? (
        <Icon
          name={icon}
          className="size-4 shrink-0 text-muted-foreground transition-colors group-hover/card:text-primary"
        />
      ) : null}
      {children}
    </div>
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

/**
 * One labelled value, stacked rather than in a row: the label is a small,
 * muted caption above; the value is full-strength text below it. This is the
 * shape a form's own label/field pairing already has, so a card that is
 * reading a record back keeps the same rhythm as the form that wrote it —
 * a `justify-between` row with the label on one side and the value flushed
 * to the other reads as a receipt, not a record.
 */
function CardField({
  label,
  value,
  dir,
  className,
}: {
  label: React.ReactNode
  value: React.ReactNode
  /** For a value whose script is fixed regardless of locale — a phone number, an email. */
  dir?: "ltr" | "rtl" | "auto"
  className?: string
}) {
  return (
    <div data-slot="card-field" className={cn("space-y-0.5", className)}>
      <p className="text-caption text-muted-foreground">{label}</p>
      <p className="text-body-md font-medium text-foreground" dir={dir}>
        {value}
      </p>
    </div>
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn(
        "px-(--card-spacing) group-data-[variant=listRow]/card:px-0 group-data-[variant=tile]/card:px-0",
        className
      )}
      {...props}
    />
  )
}

/**
 * An inset divider rather than a full-bleed rule: a hairline that stops short
 * of the inline-end edge, so it reads as separating two parts of one card
 * rather than as cutting the card in half. Use it where a card genuinely has
 * two parts; a plain `border-t` is fine elsewhere.
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
        "flex items-center gap-2 rounded-b-lg border-t bg-muted/50 p-(--card-spacing)",
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
        "flex flex-col gap-3 rounded-lg bg-card p-4 shadow-card ring-1 ring-foreground/10",
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
  CardField,
  CardDivider,
  CardSkeleton,
  cardVariants,
}
