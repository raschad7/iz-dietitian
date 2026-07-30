import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Shape: "the Arc" (docs/Qiwam Design System.html §9.1–9.2). Three corners
 * hold the plain 10px control radius; the block-end/inline-end corner
 * (`rounded-ee-*`, logical — mirrors in RTL for free) sweeps out to 24px,
 * the Q tail. It grows to 30px on hover and pulls in to 18px on press, so
 * the button appears to lean into the pointer. Icon buttons invert the
 * idea: a circle with one swept corner, sized so round and rectangular
 * buttons read as the same family.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-[10px] rounded-ee-xl border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all duration-200 ease-[cubic-bezier(.2,.6,.2,1)] outline-none select-none hover:rounded-ee-[30px] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-focus-halo active:not-aria-[haspopup]:translate-y-px active:not-aria-[haspopup]:rounded-ee-[18px] disabled:pointer-events-none disabled:opacity-50 disabled:hover:rounded-ee-xl aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        /**
         * The one lime element a screen is allowed — completion actions only.
         * Never use for a second button on the same screen; see design-system.md.
         */
        accent: "bg-accent-lime text-on-accent hover:bg-accent-lime/90",
        link: "rounded-none text-primary underline-offset-4 hover:underline hover:rounded-none",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pe-2 has-data-[icon=inline-start]:ps-2",
        xs: "h-6 gap-1 rounded-[6px] rounded-ee-[14px] px-2 text-xs hover:rounded-ee-[18px] active:not-aria-[haspopup]:rounded-ee-[10px] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pe-1.5 has-data-[icon=inline-start]:ps-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[8px] rounded-ee-[18px] px-2.5 text-[0.8rem] hover:rounded-ee-[22px] active:not-aria-[haspopup]:rounded-ee-[13px] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pe-1.5 has-data-[icon=inline-start]:ps-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pe-2 has-data-[icon=inline-start]:ps-2",
        icon: "size-8 rounded-full rounded-ee-[9px] hover:rounded-ee-[12px] active:not-aria-[haspopup]:rounded-ee-[6px]",
        "icon-xs":
          "size-6 rounded-full rounded-ee-[6px] hover:rounded-ee-[8px] active:not-aria-[haspopup]:rounded-ee-[4px] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-full rounded-ee-[7px] hover:rounded-ee-[9px] active:not-aria-[haspopup]:rounded-ee-[5px] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9 rounded-full rounded-ee-[10px] hover:rounded-ee-[13px] active:not-aria-[haspopup]:rounded-ee-[7px]",
      },
    },
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
