import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Shape: all four corners hold the 10px system radius. The control still sinks
 * 1px on press, but its geometry does not change under the pointer — a corner
 * that moves while you are reading the label is motion with nothing to say.
 *
 * Icon buttons are a plain circle, so round and rectangular buttons read as the
 * same family.
 */
const buttonVariants = cva(
  [
    // `max-w-80` + `whitespace-nowrap`: a label never wraps, so a button that
    // would need two lines is a label that needs rewriting.
    "group/button inline-flex max-w-80 shrink-0 items-center justify-center whitespace-nowrap select-none",
    "rounded-[10px] border bg-clip-padding text-body-md font-medium",
    "transition-all duration-200 ease-[cubic-bezier(.2,.6,.2,1)] outline-none",
    // `not-aria-[haspopup]` exempts menu triggers: a control that opens a
    // surface should not appear to sink under it.
    "active:not-aria-[haspopup]:translate-y-px",
    // Lime ring + olive-950 halo. Fields deliberately use a different focus
    // treatment — see the note in globals.css.
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-focus-halo",
    // n-500 on the sunken fill is 4.0:1.
    "disabled:pointer-events-none disabled:border-transparent disabled:bg-muted disabled:text-[var(--n-500)] disabled:shadow-none",
    "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        /** Primary — solid olive, white label. 5.46:1. */
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary-hover",

        /**
         * Secondary — white box, olive border and label, flipping to lime on
         * hover. The label darkens to olive-950 with it: olive-600 on lime-400
         * is 3.98:1 and fails, olive-950 is 12.04:1.
         */
        outline:
          "border-primary bg-card text-secondary-foreground hover:border-accent-lime hover:bg-accent-lime hover:text-on-accent aria-expanded:border-accent-lime aria-expanded:bg-accent-lime aria-expanded:text-on-accent",

        /** Tertiary — no box until you touch it, then a warm neutral flip. */
        ghost:
          "border-transparent text-secondary-foreground hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent aria-expanded:text-accent-foreground",

        /** Accent — the lime fill itself, for a completion action. */
        accent: "border-transparent bg-accent-lime text-on-accent hover:bg-[var(--lime-300)]",

        /**
         * Destructive — clay outline, never a solid red block. A delete is a
         * deliberate act, so it is legible rather than loud. 6.84:1 at rest,
         * 5.81:1 on the clay-100 hover fill.
         */
        destructive:
          "border-destructive bg-card text-destructive hover:bg-destructive-subtle focus-visible:ring-destructive",

        /**
         * Destructive, tertiary — `ghost`'s shape with `destructive`'s colour.
         * No box until you touch it, then the clay-100 fill; the label and glyph
         * are clay the whole time, so the control never hides what it does.
         *
         * For a destructive action sitting *among* other controls rather than
         * closing a decision: the rail's sign-out is stacked under a language
         * switcher, and an outlined box there read as one more destination while
         * everything around it was boxless. Where a destructive action is the
         * decision — a delete inside a confirm dialog — use `destructive`, which
         * carries the edge that says so.
         *
         * 6.84:1 at rest, 5.81:1 on the hover fill, same as `destructive`.
         */
        destructiveGhost:
          "border-transparent text-destructive hover:bg-destructive-subtle hover:text-destructive focus-visible:ring-destructive",

        /**
         * Secondary-subtle. Not one of the six named variants, but the brand
         * tint is what several dense surfaces already reach for, and having it
         * here keeps them off ad-hoc olive-50 classes.
         */
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-[var(--olive-100)]",

        /**
         * Inline text link. The one place `rounded-none` is legal, because a
         * link is a run of text, not a surface — it has no corners at all.
         */
        link: "rounded-none border-transparent text-secondary-foreground underline-offset-4 hover:underline",
      },
      /*
       * Two heights, and only two.
       *
       * `default` is 48px because that is the floor for a touch target, and a
       * control that is comfortable on a phone is not uncomfortable on a
       * desktop. `sm` is the 40px compact size and is **pointer-only** — it is
       * for toolbars and table rows, where a control sits inside a dense row
       * that is itself the target. Never reach for it to fit more onto a
       * screen; that is a layout problem, not a button problem.
       *
       * Icon buttons match: 48×48, or 40×40 under the same pointer-only rule.
       */
      size: {
        default: "h-12 gap-2 px-5",
        sm: "h-10 gap-2 px-5",
        icon: "size-12 rounded-full [&_svg:not([class*='size-'])]:size-5",
        "icon-sm": "size-10 rounded-full",
      },
    },
    compoundVariants: [
      /*
       * The icon button is a size *and* a skin — pale olive chip, olive-200
       * border, olive glyph — and CVA cannot express "this fill only when
       * round". A compound variant can.
       */
      ...(["icon", "icon-sm"] as const).map((size) => ({
        variant: "default" as const,
        size,
        class: "border-[var(--olive-200)] bg-[var(--olive-50)] text-primary hover:bg-[var(--olive-100)]",
      })),
      /*
       * Tertiary controls carry 12px of padding rather than 20px. A ghost
       * button has no box at rest, so the wider padding reads as a gap someone
       * forgot rather than as part of the control.
       *
       * `destructiveGhost` is in here for the same reason it is ghost-shaped at
       * all: it has no box either, and 20px would leave it sitting differently
       * from the tertiary controls it appears beside.
       */
      ...(["ghost", "destructiveGhost"] as const).flatMap((variant) =>
        (["default", "sm"] as const).map((size) => ({ variant, size, class: "px-3" })),
      ),
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
