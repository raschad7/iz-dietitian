import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

/**
 * The tick itself, drawn without any opinion about whether it can be pressed.
 *
 * It exists because the same mark is now drawn two ways: as the face of a button
 * on today, and as a plain statement of record on a day that has already
 * happened. Those are different components — one ships to the browser, one never
 * does — and a meal a client ticked this morning must not look like a different
 * kind of tick tomorrow, so the drawing lives in one place and only its wrapper
 * changes.
 *
 * **No colour of its own.** The tick paints in `currentColor`, so the caller
 * decides — green-500, on every day this mark appears. `MealCheck` sets it
 * directly for today's live button; `PortalMealCard`'s `TICK_TONE` sets the
 * same class for a settled day's `SettledMealCheck`, now that every meal card
 * wears one shell regardless of standing — see the `--meal-*` note in
 * `globals.css` for the measured pair this protects.
 *
 * Deliberately **not** a client component, and there is no `'use client'` above:
 * a module without the directive can be imported from both sides, which is what
 * lets a past day's plan reach the phone as pure HTML.
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

/**
 * The same mark on a day that has already happened: a record, not a control.
 *
 * **`role="img"`, not a disabled checkbox.** A checkbox — even one marked
 * read-only — is a widget, and announcing one on a day nobody can change invites
 * the exact attempt the screen is refusing. This is a picture of what was
 * reported, so it says so in a sentence and takes no part in the tab order. The
 * label is the whole state in words, because the difference between a filled
 * circle and an empty one is the one thing a screen reader cannot infer.
 *
 * It keeps the button's 44px footprint even though nothing here is a target. The
 * tick leads every row at the inline-start precisely so a column of five can be
 * read straight down the margin, and a settled day whose marks sat 10px further
 * in would break that line the moment a client stepped back a day.
 *
 * No hover, no cursor, no focus ring — the three things that would make it look
 * pressable are all absent, which is the visual half of the same statement.
 */
export function SettledMealCheck({
  checked,
  label,
  className,
}: {
  checked: boolean;
  label: string;
  /** The tick's colour, which depends on the shell the card is wearing. */
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={label}
      className={cn('grid size-11 shrink-0 place-items-center', className)}
    >
      <MealCheckMark checked={checked} />
    </span>
  );
}
