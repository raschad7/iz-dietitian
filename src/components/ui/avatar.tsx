import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { glyphAvatarSvg } from "@/lib/glyph-avatar"
import { cn } from "@/lib/utils"

/**
 * The generated avatar: an abstract glyph, one per person.
 *
 * It drew two initials until recently. See `src/lib/glyph-avatar.ts` for why a
 * shape identifies better than letters here, and for the licence the style
 * carries.
 *
 * `color` is per-record data, not a brand token, which is why it arrives as an
 * inline style rather than a class (see "Arbitrary colour" in
 * docs/design-system.md). It sets `currentColor`, which is what the mark's wash
 * and stroke are painted with — so passing `var(--tone-mark)` puts the glyph in
 * the same hue as the appointment card the client's bookings are drawn in.
 *
 * A circle, deliberately: a rounded box is the shape this system gives controls
 * and surfaces, and an avatar is a person, not either of those. The glyph is
 * square, so the circle has to clip it.
 */
const avatarVariants = cva(
  "flex shrink-0 items-center justify-center overflow-hidden rounded-full [&>svg]:size-full",
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
    /** Chooses the glyph, and is never drawn — see `glyphAvatarSvg`. */
    name: string
    /** Any CSS colour: what the glyph's wash and stroke are painted with. */
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
      style={{ color }}
      {...props}
      /*
        Safe because the mark contains nothing of the seed: Glyphs draws no
        text, so a client's name only ever picks a shape. `glyphAvatarSvg` says
        so at more length, and it is the assumption to re-check before pointing
        this at a style that renders letters.

        Last, so a caller cannot pass children that would silently lose to it.
      */
      dangerouslySetInnerHTML={{ __html: glyphAvatarSvg(name) }}
    />
  )
}

export { Avatar, avatarVariants }
