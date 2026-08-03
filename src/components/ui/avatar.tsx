import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { initialsOf } from "@/lib/initials"
import { cn } from "@/lib/utils"

/**
 * The generated initials avatar.
 *
 * `color` is the client's own stored hex — genuinely per-record data, not a
 * brand token, which is why it arrives as an inline style rather than a class
 * (see "Arbitrary colour" in docs/design-system.md). The palette in
 * `src/lib/avatar-color.ts` was picked to carry white text at these sizes.
 *
 * A circle, deliberately: a rounded box is the shape this system gives controls
 * and surfaces, and an avatar is a person, not either of those.
 */
const avatarVariants = cva(
  "flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
  {
    variants: {
      size: {
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
    /** The record's stored hex. */
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
