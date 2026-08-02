import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Shape: "the Arc". Three corners hold the 10px system radius; the
 * block-end/inline-end corner opens into a 24px sweep — the Q's tail. It grows
 * to 30px on hover so the button appears to lean into the pointer, and pulls
 * in to 18px on press while the whole control sinks 1px.
 *
 * `rounded-ee-*` is a logical property, so the tail mirrors to bottom-left in
 * Arabic with no direction prop and no override.
 *
 * Icon buttons invert the idea: a circle with one swept corner, sized so round
 * and rectangular buttons read as the same family.
 */
const buttonVariants = cva(
  [
    "group/button inline-flex shrink-0 items-center justify-center whitespace-nowrap select-none",
    "rounded-[10px] rounded-ee-[24px] border bg-clip-padding text-body font-medium",
    "transition-all duration-200 ease-[cubic-bezier(.2,.6,.2,1)] outline-none",
    "hover:rounded-ee-[30px]",
    // `not-aria-[haspopup]` exempts menu triggers: a control that opens a
    // surface should not appear to sink under it.
    "active:not-aria-[haspopup]:translate-y-px active:not-aria-[haspopup]:rounded-ee-[18px]",
    // Lime ring + olive-950 halo. Fields deliberately use a different focus
    // treatment — see the note in globals.css.
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-focus-halo",
    // Disabled keeps the resting tail: a control that still animates reads as
    // available. n-500 on the sunken fill is 4.0:1.
    "disabled:pointer-events-none disabled:border-transparent disabled:bg-muted disabled:text-[var(--n-500)] disabled:shadow-none disabled:hover:rounded-ee-[24px]",
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

        /** Tertiary — no box until you touch it, then the same lime flip. */
        ghost:
          "border-transparent text-secondary-foreground hover:bg-accent-lime hover:text-on-accent aria-expanded:bg-accent-lime aria-expanded:text-on-accent",

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
         * Secondary-subtle. Not one of the six named variants, but the brand
         * tint is what several dense surfaces already reach for, and having it
         * here keeps them off ad-hoc olive-50 classes.
         */
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-[var(--olive-100)]",

        /**
         * Inline text link. The one place `rounded-none` is legal, because a
         * link is a run of text, not a surface — it has no corners to sweep.
         */
        link: "rounded-none border-transparent text-secondary-foreground underline-offset-4 hover:rounded-none hover:underline",
      },
      size: {
        default: "h-9 gap-1.5 px-3.5",
        xs: "h-6 gap-1 rounded-[6px] rounded-ee-[14px] px-2 text-micro hover:rounded-ee-[18px] active:not-aria-[haspopup]:rounded-ee-[10px] disabled:hover:rounded-ee-[14px] [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1 rounded-[8px] rounded-ee-[18px] px-3 text-caption hover:rounded-ee-[22px] active:not-aria-[haspopup]:rounded-ee-[13px] disabled:hover:rounded-ee-[18px] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 gap-2 px-5 text-h4",
        /*
         * Icon sizes: a circle with one corner opened to ~29% of the button,
         * the same proportion the 24px tail has on a rectangular button. That
         * ratio is what makes both shapes read as one family.
         */
        icon: "size-9 rounded-full rounded-ee-[11px] hover:rounded-ee-[14px] active:not-aria-[haspopup]:rounded-ee-[7px] disabled:hover:rounded-ee-[11px]",
        "icon-xs":
          "size-6 rounded-full rounded-ee-[7px] hover:rounded-ee-[9px] active:not-aria-[haspopup]:rounded-ee-[5px] disabled:hover:rounded-ee-[7px] [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-8 rounded-full rounded-ee-[9px] hover:rounded-ee-[12px] active:not-aria-[haspopup]:rounded-ee-[6px] disabled:hover:rounded-ee-[9px] [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg":
          "size-11 rounded-full rounded-ee-[13px] hover:rounded-ee-[17px] active:not-aria-[haspopup]:rounded-ee-[9px] disabled:hover:rounded-ee-[13px] [&_svg:not([class*='size-'])]:size-5",
      },
    },
    /*
     * The icon button is a size *and* a skin — pale olive chip, olive-200
     * border, olive glyph — and CVA cannot express "this fill only when
     * round". A compound variant can.
     */
    compoundVariants: (["icon", "icon-xs", "icon-sm", "icon-lg"] as const).map((size) => ({
      variant: "default" as const,
      size,
      class:
        "border-[var(--olive-200)] bg-[var(--olive-50)] text-primary hover:bg-[var(--olive-100)]",
    })),
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
