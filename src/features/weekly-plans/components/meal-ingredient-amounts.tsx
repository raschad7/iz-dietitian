import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

import { localizedName } from '../food-display';
import type { MealIngredientLine } from '../meal-ingredients';
import { ingredientAmount } from '../meal-quantity';

/**
 * What a meal contains, each line in the unit it is counted in — 150 غ of labneh,
 * 1 رغيف of bread, 6 ملاعق of rice, 2 حبة of egg.
 *
 * Deliberately **not** a `'use client'` module. The staff panel that renders it is
 * a client component and pulls it into the bundle; the patient portal's meal card
 * is a server component and keeps it on the server, where the week's recipes stay
 * out of the browser. Written once so a dietitian and their client cannot end up
 * reading two different sentences for the same meal.
 *
 * The lines arriving here are already resolved and already absolute — see
 * `meal-ingredients.ts`. Nothing in this file multiplies, and nothing decides
 * between a recipe and a hand-set amount; by the time a line is on screen that
 * question has been answered once, upstream.
 *
 * `dir="auto"` on both columns rather than a fixed direction: a food name or a
 * unit can be Arabic on an English plan and the other way round, and the first
 * strong character is the only thing that reliably knows which way the line runs.
 */
export function MealIngredientAmounts({
  lines,
  locale,
}: {
  lines: readonly MealIngredientLine[];
  locale: string;
}) {
  if (!lines.length) return null;

  const { main, sides } = groupBySide(lines);

  return (
    <div className="flex flex-col gap-2">
      {main.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-body-sm">
          {main.map((line) => (
            <IngredientRow key={lineKey(line)} line={line} locale={locale} />
          ))}
        </ul>
      )}

      {/* A side is named, then its own lines beneath it. Without the heading a
          client reads loose lettuce and tomato where a dietitian wrote
          "صحن سلطة", and a plate stops looking like a plate. */}
      {sides.map((side) => (
        <div key={side.id} className="border-t border-border pt-2">
          <p className="mb-1 text-body-sm font-medium" dir="auto">
            {localizedName(side, locale)}
          </p>
          <ul className="flex flex-col gap-1.5 text-body-sm">
            {side.lines.map((line) => (
              <IngredientRow key={lineKey(line)} line={line} locale={locale} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * A line's identity for React.
 *
 * The food id alone is not unique any more: a salad standing beside a maqluba
 * brings its own olive oil, and two rows keyed on the same food is a silently
 * dropped line rather than a warning anyone reads.
 */
function lineKey(line: MealIngredientLine): string {
  return `${line.side?.id ?? 'main'}:${line.food.id}`;
}

/** The main's lines, then each side with its own, in the order they were attached. */
export function groupBySide(lines: readonly MealIngredientLine[]): {
  main: MealIngredientLine[];
  sides: { id: string; nameAr: string; nameEn: string; lines: MealIngredientLine[] }[];
} {
  const main: MealIngredientLine[] = [];
  const sides: { id: string; nameAr: string; nameEn: string; lines: MealIngredientLine[] }[] = [];

  for (const line of lines) {
    if (!line.side) {
      main.push(line);
      continue;
    }

    const group = sides.find((side) => side.id === line.side?.id);
    if (group) group.lines.push(line);
    else {
      sides.push({
        id: line.side.id,
        nameAr: line.side.nameAr,
        nameEn: line.side.nameEn,
        lines: [line],
      });
    }
  }

  return { main, sides };
}

/**
 * One line: the food on the reading side, its amount on the other.
 *
 * A read-only row, and only that. It used to take a `trailing` slot and an
 * `emphasis` flag so the editable list could hang its `−/+` off the end of one —
 * which is how the stepper ended up two elements away from the number it moves.
 * The editable list draws its own row now and shares `IngredientAmount` instead,
 * so the two surfaces still cannot disagree about how a quantity is spelled
 * without either one pretending to be the other's layout.
 */
function IngredientRow({ line, locale }: { line: MealIngredientLine; locale: string }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="min-w-0 flex-1 text-muted-foreground [overflow-wrap:anywhere]" dir="auto">
        {localizedName(line.food, locale)}
      </span>

      {/* `shrink-0` and no wrapping: the amount is short in both languages and is
          what the eye runs down the column for. */}
      <IngredientAmount line={line} locale={locale} className="shrink-0 text-end font-medium" />
    </li>
  );
}

/**
 * The amount itself — "150 غ", "6 ملاعق", "1 رغيف" — and nothing around it.
 *
 * Split out of the row so the editable list can set it *between* its two
 * buttons rather than off at the end of the line, without either surface
 * formatting a quantity of its own. There is one place that decides how an
 * amount is spelled, and it is here.
 *
 * `dir="auto"`: the unit can be Arabic on an English plan and the other way
 * round, and the first strong character is what knows which way it runs.
 */
export function IngredientAmount({
  line,
  locale,
  className,
}: {
  line: MealIngredientLine;
  locale: string;
  className?: string;
}) {
  const t = useTranslations('weeklyPlans');
  const amount = ingredientAmount(line, locale);

  return (
    <span className={cn('tabular-nums', className)} dir="auto">
      {amount.kind === 'grams' ? t('gramsShort', { value: amount.grams }) : amount.text}
    </span>
  );
}
