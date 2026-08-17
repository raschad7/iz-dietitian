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
/*
  The disc is the client's *card*, and the glyph on it is their mark.

  `--tone-fill` is the exact colour their appointments are drawn in, so the
  avatar beside a name and the block on the calendar are the same colour rather
  than two shades of one hue — the style's own opaque white ground is stripped
  in `glyphAvatarSvg` precisely so this can show through.

  That is now true rather than aspirational: `--tone-avatar-fill` is deliberately
  declared nowhere, so this resolves to `--tone-fill` for every caller. It was a
  lighter, flatter step for a while, which made the disc a family member of the
  card's colour instead of the same colour, and cost the register a third of the
  palette's separation on the one surface with nothing else to carry it. The long
  note in `globals.css` has the measurements.

  It stays in the chain as the override point, and `AppointmentBlock` is the one
  caller that uses it: a disc drawn *on* a card of this colour sets it
  `transparent` so it follows the card through hover rather than sitting on top
  of it as a coin.

  The `white` fallback is for the callers outside a `.patient-tone` subtree — the
  component gallery, the weekly-plan rails — where neither variable is defined
  and the mark keeps the ground the style shipped with.
*/
const avatarVariants = cva(
  "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--tone-avatar-fill,var(--tone-fill,white))] [&>svg]:size-full",
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
        /*
          56px, for the one place the person *is* the heading: the planner's
          client bar, where the disc sits beside their name and the row of
          figures for the week being planned. At `lg` it read as an icon in
          front of a label; at the height of the fact tiles beside it, it reads
          as whose week this is.
        */
        planner: "size-14 text-body-md",
        /**
         * 64px — a portrait rather than a mark, for a panel whose subject *is*
         * the person: the visit record's summary rail, where the disc leads a
         * centred column with the name under it. `lg` is the size a disc takes
         * when it sits beside a heading; at the head of its own column that
         * reads as a bullet point with a name after it.
         */
        xl: "size-16 text-heading-sm",
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
