import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '@/components/ui/table';
import { roundForDisplay } from '@/features/weekly-plans/nutrition';
import { membersOf } from '@/lib/enum';

import type { DishListResult } from '../queries';
import { ALLERGENS, DISH_TAGS, MEAL_TYPES } from '../schema';

/**
 * The read-only catalog browser.
 *
 * Exists to answer "what was the AI choosing from", which is the first question
 * anyone asks when a generated plan looks wrong. The numbers here come from the
 * same loader a plan uses, so what this page shows is what a plan would compute.
 *
 * There is no dish editor in this cut. Adding one is a whole feature — form,
 * validation, actions, tests — and it sits between the dietitian and seeing a
 * plan.
 *
 * ## What the rows are shaped for
 *
 * Meal times, tags and allergens are chips rather than comma-joined runs of
 * text. Joined, all three columns were the same grey sentence at the same size,
 * and telling a meal time from a tag meant reading the header above it; as
 * chips the eye sorts them by shape before it reads a word — and allergens keep
 * the medical status, because they are the one thing on the row that is a
 * clinical fact rather than a label.
 *
 * The ingredients column is clamped to two lines. It used to print every
 * ingredient on its own line, which let a single ten-ingredient dish set the
 * height of a row whose neighbours needed one line, and a page of twenty of
 * those is not a table you can scan. The full list stays reachable in the
 * cell's `title`.
 */

/** How many tags a row prints before it counts the rest. */
const TAG_LIMIT = 3;

export function DishTable({ result, filtered }: { result: DishListResult; filtered: boolean }) {
  const t = useTranslations('dishes');

  if (!result.items.length) {
    return (
      /*
        An empty list with no way out is a dead end — and the way out of this
        one is the "Clear filters" button in the toolbar directly above, which
        is on screen for exactly the same condition that makes this card say
        `emptyFiltered`. So the card names what happened and what to try; a
        second button repeating the word "Clear filters" two rows under the
        first would be the noisier half of one control.
      */
      <Card variant="empty" className="items-center gap-2 p-8 text-center">
        <p>{filtered ? t('emptyFiltered') : t('empty')}</p>
        <p className="text-body-sm text-muted-foreground">
          {filtered ? t('emptyFilteredHint') : t('emptyHint')}
        </p>
      </Card>
    );
  }

  return (
    /*
      From `md` up this is the only part of the page that scrolls: the page
      hands it a bounded height and the rows move inside it, so the heading, the
      toolbar and the pager stay where the reader left them. Below that the page
      scrolls as one — see the page component — and the sticky header simply
      pins itself to the top of the app shell instead.

      ## The catalog sheds columns rather than scrolling sideways

      Six columns at `min-w-3xl` — 768px — was the whole table at every width,
      with `TableRoot` scrolling to reach the rest of it. Nothing on a screen
      narrower than that fits: a tablet gives this page about 712px and a phone
      about 295px (the staff rail is locked to its 56px icon column at every
      width), so the catalog was 56px past the edge on a tablet and nearly two
      and a half screens wide on a phone — with no visible scrollbar to say so,
      because `globals.css` takes the bars off every scroller in the app.

      So each column arrives at the width that can hold it, and the floor with
      the last of them:

      - **Phone** — the dish and its energy. What a catalog is scanned for is
        "what is in here and what does it cost", and those are the two.
      - **`md`** — the meal times and the protein. A tablet has room for four
        columns without either of the wide ones.
      - **`lg`** — the tags.
      - **`xl`** — the ingredients, which is the widest column on the row
        (`max-w-xs`), and with it the `min-w-3xl` floor. By `xl` the page has
        ~984px, so the floor never actually engages; it is there to keep the six
        columns at their designed widths if the shell ever hands the page less.

      **The two that matter most do not shed at all.** The meal-time chips fold
      under the dish name on a phone rather than disappearing, and the allergens
      are under the name at every width because they are the one thing on the row
      that is a clinical fact rather than a label.

      ⚠ The tags and the ingredients are genuinely gone below their breakpoints,
      and there is nowhere else on a phone to read them — this table is read
      only, the rows do not link anywhere, and the ingredients' `title` is a
      hover affordance that touch hardware never fires. That is the cost of the
      trade, and it is the right way round: a tag nobody can see beats a name
      column nobody can read. If they turn out to be wanted on a phone, the row
      wants to become an expandable card rather than a wider table.
    */
    <TableRoot className="md:min-h-0 md:flex-1 md:overflow-y-auto">
      <Table className="xl:min-w-3xl">
        <TableHeader sticky>
          <TableRow>
            <TableHead>{t('columns.name')}</TableHead>
            <TableHead className="hidden md:table-cell">{t('columns.mealTypes')}</TableHead>
            <TableHead className="hidden lg:table-cell">{t('columns.tags')}</TableHead>
            <TableHead numeric className="text-end">
              {t('columns.kcal')}
            </TableHead>
            <TableHead numeric className="hidden text-end md:table-cell">
              {t('columns.protein')}
            </TableHead>
            <TableHead className="hidden xl:table-cell">{t('columns.ingredients')}</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {result.items.map((dish) => {
            const tags = membersOf(DISH_TAGS, dish.tags);
            const shownTags = tags.slice(0, TAG_LIMIT);
            const restTags = tags.slice(TAG_LIMIT);

            const ingredients = dish.ingredients.map(
              (ingredient) =>
                `${roundForDisplay('protein', ingredient.quantityGrams)} g · ${ingredient.food.description}`,
            );

            return (
              <TableRow key={dish.id} className="align-top">
                <TableCell>
                  {/* `dir="auto"`: a dish named in Arabic and one named in
                      English sit in the same column, and each should run the
                      way its own script does. */}
                  <span className="block font-medium" dir="auto">
                    {dish.nameAr}
                  </span>
                  <span className="block text-caption text-muted-foreground" dir="auto">
                    {dish.nameEn}
                  </span>

                  {dish.allergenTags.length > 0 && (
                    <span className="mt-1.5 flex flex-wrap gap-1">
                      {membersOf(ALLERGENS, dish.allergenTags).map((tag) => (
                        <Badge key={tag} variant="medical" size="sm">
                          {t(`allergens.${tag}`)}
                        </Badge>
                      ))}
                    </span>
                  )}

                  {/*
                    The meal times, folded under the name on a phone — where
                    their own column has stood down. A dish is "what can I serve
                    and when", and dropping the "when" would leave half a
                    catalog entry. Two renderings of one fact, one hidden in CSS,
                    for the same reason the rest of this app does it: the page is
                    server-rendered and a width read on the client would flash
                    the wrong one on first paint.
                  */}
                  <span className="mt-1.5 flex flex-wrap gap-1 md:hidden">
                    {membersOf(MEAL_TYPES, dish.mealTypes).map((type) => (
                      <Badge key={type} variant="muted" size="sm">
                        {t(`mealTypes.${type}`)}
                      </Badge>
                    ))}
                  </span>
                </TableCell>

                <TableCell className="hidden md:table-cell">
                  <span className="flex flex-wrap gap-1">
                    {membersOf(MEAL_TYPES, dish.mealTypes).map((type) => (
                      <Badge key={type} variant="muted" size="sm">
                        {t(`mealTypes.${type}`)}
                      </Badge>
                    ))}
                  </span>
                </TableCell>

                <TableCell className="hidden lg:table-cell">
                  <span className="flex flex-wrap gap-1">
                    {shownTags.map((tag) => (
                      <Badge key={tag} variant="outline" size="sm">
                        {t(`tags.${tag}`)}
                      </Badge>
                    ))}

                    {/* The overflow counts rather than wraps: four tags on one
                        dish would otherwise set the height of the whole row.
                        The names it stands for are in the `title`. */}
                    {restTags.length > 0 && (
                      <Badge
                        variant="outline"
                        size="sm"
                        className="text-muted-foreground"
                        title={restTags.map((tag) => t(`tags.${tag}`)).join('، ')}
                      >
                        {t('moreTags', { count: restTags.length })}
                      </Badge>
                    )}
                  </span>
                </TableCell>

                <TableCell numeric className="text-end font-medium">
                  {roundForDisplay('kcal', dish.baseKcal)}
                </TableCell>

                <TableCell numeric className="hidden text-end md:table-cell">
                  {roundForDisplay('protein', dish.totals.protein.value)}
                </TableCell>

                <TableCell
                  className="hidden max-w-xs text-caption text-muted-foreground xl:table-cell"
                  title={ingredients.join(' · ')}
                >
                  <span className="line-clamp-2">{ingredients.join(' · ')}</span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableRoot>
  );
}
