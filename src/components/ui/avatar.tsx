import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { initialsOf } from "@/lib/initials"
import { cn } from "@/lib/utils"

/**
 * The generated initials avatar.
 *
 * `color` is per-record data, not a brand token, which is why it arrives as an
 * inline style rather than a class (see "Arbitrary colour" in
 * docs/design-system.md). Two things supply it: the client's stored hex from
 * `src/lib/avatar-color.ts`, and the calendar's `--tone-mark`, the deep step of
 * the patient's own hue. Both are chosen to carry white text at these sizes.
 *
 * A circle, deliberately: a rounded box is the shape this system gives controls
 * and surfaces, and an avatar is a person, not either of those.
 */
const avatarVariants = cva(
  "flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
  {
    variants: {
      size: {
        /*
          20px, for a mark riding beside a line of text rather than heading a
          record: the calendar block and the agenda row, where a 28px disc next
          to a 14px name reads as the disc being the subject. Two initials at
          10px is the floor this stays legible at, which is why there is nothing
          below it.
        */
        xs: "size-5 text-[0.625rem]",
        sm: "size-7 text-label",
        default: "size-9 text-caption",
        lg: "size-11 text-body-md",
      },
    },
    defaultVariants: { size: "default" },
  }
)

type AvatarProps = Omit<React.ComponentProps<"span">, "color" | "children"> &
  VariantProps<typeof avatarVariants> & {
    name: string
    /** Any CSS colour: the record's stored hex, or a `var()` the caller sets. */
    color: string
  }

function Avatar({ name, color, size, className, ...props }: AvatarProps) {
  return (
    <span
      data-slot="avatar"
      // Decorative: the name it stands for is always rendered next to it, and
      // announcing both makes a screen reader say the person twice.
      aria-hidden
      className={cn(avatarVariants({ size }), className)}
      style={{ background: color }}
      {...props}
    >
      {initialsOf(name)}
    </span>
  )
}

export { Avatar, avatarVariants }
