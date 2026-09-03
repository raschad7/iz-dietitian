import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

import { localizedName } from '../food-display';
import { sideChipStyle } from '../side-kind';

/**
 * What is standing beside the meal, as one tinted glyph each.
 *
 * ## Why a picture and not the name
 *
 * The card used to carry `+ صحن سلطة` as a caption under the dish name, and the
 * caption was the honest first answer: before it existed the salad was in the
 * calories, in the printout and in the patient's list, and invisible on the one
 * surface a dietitian plans on.
 *
 * It is the wrong shape for a board of thirty-five cards, though. Each card has
 * room for exactly one line of words and the dish name has already spent it, so
 * a second line of Arabic underneath is something the eye has to read *past* on
 * every card in a column to get to the next dish. A glyph in the corner is read
 * without being read: the reader learns green-leaf-means-salad once and then
 * scans a week for it. The name is still one hover away, and is spelled out in
 * full in the meal panel, on the printout and in the client's own list.
 *
 * ## Why it sits opposite the calories
 *
 * The card's foot is one row with an end at each side: the figure the week is
 * planned against on the reading edge, and what else is on the plate on the
 * other. Logical properties, so in Arabic the calories are on the right and the
 * chips on the left, and in English the two swap — each stays where its script
 * puts "first".
 *
 * A meal carries at most two sides (`MAX_MEAL_SIDES`), so this is one chip or
 * two and never a row that has to wrap.
 */
export function MealSideChips({
  sides,
  locale,
  className,
}: {
  sides: readonly { id: string; nameAr: string; nameEn: string }[];
  locale: string;
  className?: string;
}) {
  if (sides.length === 0) return null;

  return (
    <span className={cn('flex shrink-0 items-center gap-1', className)}>
      {sides.map((side) => {
        const { icon, className: tone } = sideChipStyle(side);
        const name = localizedName(side, locale);

        return (
          /*
            `title` on the chip and the name in an `sr-only` span beside it.
            The tooltip answers the pointer; the span answers everything else —
            a card read aloud has to say what is on the plate, and a glyph with
            an `aria-label` inside a button that is already named by the dish
            would be announced as part of the button's own name in a way that
            reads as one run-on phrase. A separate span keeps the two facts
            separate.
          */
          <span
            key={side.id}
            title={name}
            className={cn('grid size-5 place-items-center rounded-md', tone)}
          >
            <Icon name={icon} className="size-3.5" />
            <span className="sr-only">{name}</span>
          </span>
        );
      })}
    </span>
  );
}
