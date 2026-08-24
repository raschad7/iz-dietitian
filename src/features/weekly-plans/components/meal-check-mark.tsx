import { Icon } from '@/components/ui/icon';

/**
 * The tick itself.
 *
 * Split out of `MealCheck` — the only caller left, now that a past day's plan
 * uses the same live button today does (`portal-meal-card.tsx`) — so the
 * drawing stays independent of the button around it if a second caller ever
 * needs the same face again.
 *
 * **No colour of its own.** The tick paints in `currentColor`, so the caller
 * decides — `MealCheck` sets `--meal-check-fill` directly. See that token's
 * comment in `globals.css` for why it replaced green-500 here.
 */
export function MealCheckMark({ checked }: { checked: boolean }) {
  return (
    /*
      `mealCheckMark` is a lucide stroke glyph, so the circle reads as a ring
      rather than a filled disc. The `bg-card` disc behind it keeps the ring
      interior matching the card even when the mark sits on a tinted shell, and
      it is deliberately smaller than the ring: the circle covers 20/24 of the
      glyph box, so a full-size disc behind a 28px icon showed as a 2px halo
      around the stroke. A 20px disc sits comfortably inside the ring 23.3px.
    */
    <span className="relative grid size-7 place-items-center">
      {checked ? (
        // Checked is a solid disc, not an outline glyph on a card-colour
        // backing: the whole circle fills with the tick's own colour so the
        // state reads at a glance, with the check itself in `bg-card` to sit
        // on top of it.
        <span className="grid size-6 place-items-center rounded-full bg-meal-check-fill">
          <Icon name="check" className="size-4 text-card" />
        </span>
      ) : (
        // Unchecked is an empty ring rather than a faint glyph: an outline reads
        // as "not yet", where a grey tick reads as a disabled one. 24px against
        // the checked circle's 23.3px, so the mark does not resize as it is
        // tapped.
        <span className="size-6 rounded-full border-2 border-muted-foreground/45 bg-card" />
      )}
    </span>
  );
}
