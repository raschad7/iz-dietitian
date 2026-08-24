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

  return (
    <ul className="flex flex-col gap-1.5 text-body-sm">
      {lines.map((line) => (
        <IngredientRow key={line.food.id} line={line} locale={locale} />
      ))}
    </ul>
  );
}

/**
 * One line: the food on the reading side, its amount on the other.
 *
 * `trailing` is where the editable list hangs its `−/+`. Sharing the row rather
 * than writing a second one is what keeps the staff panel and the patient portal
 * from drifting into two different renderings of the same fact — the amount is
 * formatted here, once, for both.
 */
export function IngredientRow({
  line,
  locale,
  trailing,
  emphasis = false,
}: {
  line: MealIngredientLine;
  locale: string;
  trailing?: React.ReactNode;
  /** Marks a line the dietitian adjusts, so the eye finds the controls' rows first. */
  emphasis?: boolean;
}) {
  const t = useTranslations('weeklyPlans');
  const amount = ingredientAmount(line, locale);

  return (
    <li className="flex items-center justify-between gap-3">
      <span
        className={cn(
          'min-w-0 flex-1 [overflow-wrap:anywhere]',
          emphasis ? 'font-medium text-foreground' : 'text-muted-foreground',
        )}
        dir="auto"
      >
        {localizedName(line.food, locale)}
      </span>

      {/* `shrink-0` and no wrapping: the amount is short in both languages and is
          what the eye runs down the column for. */}
      <span className="shrink-0 text-end font-medium tabular-nums" dir="auto">
        {amount.kind === 'grams' ? t('gramsShort', { value: amount.grams }) : amount.text}
      </span>

      {trailing}
    </li>
  );
}
