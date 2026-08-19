'use client';

import { useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '@/components/ui/table';
import { toast } from '@/components/ui/toast';
import { useRouter } from '@/i18n/navigation';
import { membersOf } from '@/lib/enum';
import { cn } from '@/lib/utils';
import { NUTRIENT_UNITS } from '@/features/weekly-plans/nutrition';

import { loadDishForEditAction } from '../catalog-actions';
import { localizedName } from '../food-display';
import { dishTagDotClasses, highProteinDotClasses } from '../meal-tag-tone';
import type { DishEditData } from '../queries';
import { DISH_TAGS, MEAL_TYPES, type MealType } from '../schema';

import { DishDetails } from './dish-details';
import { DishEditorDialog } from './dish-editor-dialog';
import { DishRowActions } from './dish-row-actions';

/** The summary one catalog row renders — the recipe stays out until the drawer. */
export type DishCardData = {
  id: string;
  nameAr: string;
  nameEn: string;
  mealTypes: string[];
  tags: string[];
  kcal: number;
  carbs: number;
  protein: number;
  /** Computed from the recipe, never stored — see `nutritionCategory()`. */
  highProtein: boolean;
  /** Shared/built-in dish — read-only. */
  isSystem: boolean;
  hidden: boolean;
};

/** How many tags a row prints before it folds the rest into a `+n`. */
const TAG_LIMIT = 3;

/** The category's own glyph — the same one the planner draws for that meal. */
const MEAL_ICON: Record<MealType, IconName> = {
  breakfast: 'mealBreakfast',
  lunch: 'mealLunch',
  dinner: 'mealDinner',
  snack: 'mealSnack',
};

/**
 * The catalog, as a real table.
 *
 * ## Why columns
 *
 * This was a divided list where a row ran "name / meal · tag · tag / 443 kcal ·
 * 12.8g protein" as three runs of prose. Every value was present and none of
 * them were *comparable*: to answer "which of these is the high-protein one" you
 * read twenty sentences instead of scanning one column. A catalog is tabular
 * data — same fields, every row — so it gets a table, with named column heads
 * that say what each figure is, and each nutrient in its own aligned column.
 *
 * ## The three tiers of a row
 *
 * 1. **What it is** — the Arabic name, with a quiet ownership line beneath it.
 *    The English name is deliberately absent; it lives in the detail drawer.
 * 2. **How it is classified** — the meal category (a *category*: which meal of
 *    the day this belongs to, at most a few, single-valued in practice) and then
 *    the tags (*qualities*: quick, economical, vegetarian). These are two
 *    different kinds of fact and used to be run together into one dotted
 *    sentence, which is what made both unreadable. Separate columns, separate
 *    treatments.
 * 3. **What it costs** — energy, carbs, protein, aligned and tabular.
 *
 * ## The tag colours are load-bearing
 *
 * Each tag carries the dot from `dishTagDotClass`, which is the same token the
 * planner's meal card paints its top rule with. So a dish tagged `quick` shows
 * the flame dot here and lands in the week as a card ruled in flame — one
 * colour, one meaning, across two screens. Changing a hue here without changing
 * it there breaks the only thing that makes the rule on a meal card mean
 * anything.
 *
 * The add/edit flow lives here rather than in each row so one editor sheet serves
 * every entry point — a row's overflow menu, the drawer's Edit button, and the
 * empty state's "add" prompt — and none of them can drift.
 */
export function DishList({
  locale,
  items,
  filtered,
}: {
  locale: string;
  items: DishCardData[];
  filtered: boolean;
}) {
  const t = useTranslations('dishes');
  const router = useRouter();

  const [detailId, setDetailId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editData, setEditData] = useState<DishEditData | undefined>(undefined);
  const [loadingEditId, setLoadingEditId] = useState<string | null>(null);

  function openAdd() {
    setEditData(undefined);
    setEditorOpen(true);
  }

  async function startEdit(dishId: string) {
    setLoadingEditId(dishId);
    try {
      const data = await loadDishForEditAction(locale, dishId);
      if (data) {
        setDetailId(null);
        setEditData(data);
        setEditorOpen(true);
      } else {
        toast.error(t('rowActions.editFailed'));
      }
    } catch {
      toast.error(t('rowActions.editFailed'));
    } finally {
      setLoadingEditId(null);
    }
  }

  function handleSaved() {
    setEditorOpen(false);
    // The catalog is server-rendered; the change shows once it re-fetches.
    router.refresh();
  }

  if (!items.length) {
    return (
      <>
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-14 text-center">
          <p className="text-body-md font-medium">{filtered ? t('emptyFiltered') : t('empty')}</p>
          <p className="max-w-sm text-body-sm text-muted-foreground">
            {filtered ? t('notFoundPrompt') : t('emptyHint')}
          </p>
          <Button type="button" size="sm" className="mt-1" onClick={openAdd}>
            <Icon name="add" />
            {t('addDish')}
          </Button>
        </div>

        <DishEditorDialog
          locale={locale}
          open={editorOpen}
          onOpenChange={setEditorOpen}
          dish={editData}
          onSaved={handleSaved}
        />
      </>
    );
  }

  return (
    <>
      {/*
        The frame scrolls vertically inside the page on `md` and up, which is
        what makes the sticky header worth having.

        It used to scroll *horizontally* on a phone as well, on the grounds that
        seven columns do not compress to 375px and a sideways table beats one
        whose numbers wrap. Both halves of that are true and the conclusion was
        still wrong: it is the bottom rung of the Rearrange → Stack →
        Internal-scroll ladder, and in practice it meant looking at half a row
        and swiping for the rest. So the phone rearranges instead — see the
        column heads below — and `overflow-x-auto` stays only as the floor under
        a case the rearrangement cannot absorb.
      */}
      <TableRoot data-guide="dishes-list" className="md:min-h-0 md:flex-1 md:overflow-y-auto">
        <Table>
          <TableHeader sticky>
            {/*
              Which columns a width can afford, in two steps.

              Under `sm` a row is the name, the energy and the row menu: the
              subject, the figure being budgeted against, and the only way to
              act on either. `sm` buys back the two macros. `md` buys back the
              two classification columns.

              Nothing that stands down is the only way to read its fact. The
              classifications fold into the name cell as the glyph and the dots
              they already are, and the macros are one tap away in the detail
              drawer the name opens.

              ⚠ Every `hidden … table-cell` here has a twin on the matching cell
              in `DishRow`. A head that stands down while its cell does not
              shifts every column after it by one.
            */}
            <TableRow>
              {/* `w-full max-w-0` is what lets the name truncate at all: an
                  auto-layout table sizes a column to its content, so without a
                  cell that claims the leftover width and caps its own, a long
                  dish name widens the table instead of eliding — which is the
                  sideways scroll coming back in through the one column that
                  cannot stand down. */}
              <TableHead className="w-full max-w-0">{t('columns.name')}</TableHead>
              <TableHead className="hidden md:table-cell">{t('columns.mealTypes')}</TableHead>
              <TableHead className="hidden md:table-cell">{t('columns.tags')}</TableHead>
              <TableHead numeric className="text-end">
                {t('columns.kcal')}
              </TableHead>
              <TableHead numeric className="hidden text-end sm:table-cell">
                {t('columns.carbs')}
              </TableHead>
              <TableHead numeric className="hidden text-end sm:table-cell">
                {t('columns.protein')}
              </TableHead>
              {/* The actions column is named for a screen reader only — a visible
                  head over a menu button is a label for a thing that has one. */}
              <TableHead className="w-px">
                <span className="sr-only">{t('columns.actions')}</span>
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {items.map((dish) => (
              <DishRow
                key={dish.id}
                dish={dish}
                locale={locale}
                editing={loadingEditId === dish.id}
                onOpen={() => setDetailId(dish.id)}
                onEdit={() => startEdit(dish.id)}
              />
            ))}
          </TableBody>
        </Table>
      </TableRoot>

      <DishDetails locale={locale} dishId={detailId} onClose={() => setDetailId(null)} onEdit={startEdit} />

      <DishEditorDialog
        locale={locale}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        dish={editData}
        onSaved={handleSaved}
      />
    </>
  );
}

function DishRow({
  dish,
  locale,
  editing,
  onOpen,
  onEdit,
}: {
  dish: DishCardData;
  locale: string;
  editing: boolean;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const t = useTranslations('dishes');
  // `format.list` and not a hardcoded '، ': that separator is an Arabic comma,
  // so the English build was joining its own tag names with it too. Same repair
  // as `ClientNutrition`.
  const format = useFormatter();

  const mealTypes = membersOf(MEAL_TYPES, dish.mealTypes);
  const tags = membersOf(DISH_TAGS, dish.tags);
  const shownTags = tags.slice(0, TAG_LIMIT);
  const overflow = tags.length - shownTags.length;

  return (
    <TableRow linked className={cn(dish.hidden && '[&>td]:opacity-60')}>
      <TableCell className="w-full max-w-0">
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-2">
            {/*
              `after:absolute after:inset-0` stretches this button over the whole
              row — see the `linked` prop on TableRow. A button rather than a
              link because the destination is a drawer on this page, not a URL.
            */}
            <button
              type="button"
              onClick={onOpen}
              aria-label={t('detail.open', { name: localizedName(dish, locale) })}
              dir="auto"
              className={cn(
                /* `font-medium`, not `font-semibold`. Every row in this column
                   is a dish name, so the weight was not distinguishing anything
                   — it was twenty lines of bold in a row, which reads as heavy
                   rather than as emphasis. Medium is still clearly the subject
                   of its row against the caption under it and the muted meta
                   beside it. */
                'min-w-0 truncate rounded-sm text-start font-heading text-body-md font-medium',
                'after:absolute after:inset-0 after:content-[""]',
                'focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2',
              )}
            >
              {localizedName(dish, locale)}
            </button>

            {dish.hidden && (
              <Badge variant="outline" size="sm" className="shrink-0 text-muted-foreground">
                {t('hiddenBadge')}
              </Badge>
            )}
          </div>

          {/* Who owns the dish is a property of the dish, so it hangs under the
              name rather than taking a column of its own — it is read once, when
              deciding whether this row can be edited, not scanned down. */}
          <span className="text-caption text-muted-foreground">
            {t(dish.isSystem ? 'ownership.system' : 'ownership.clinic')}
          </span>

          {/*
            What the two classification columns say, at the widths where they
            are not there to say it.

            Not a summary of the row and not a second rendering of it: the meal
            category keeps its own glyph and the qualities keep their own dots,
            which is the whole vocabulary those columns use. What gets dropped
            is the words beside them — a 295px row has no space for them, and
            the glyph and the colour are the parts that are scanned anyway.

            `shownTags`, so a heavily tagged dish folds to the same three marks
            its own column would have printed rather than to a run of dots that
            crowds the name above it.
          */}
          {(mealTypes.length > 0 || dish.highProtein || shownTags.length > 0) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 md:hidden">
              {mealTypes.map((type) => (
                <Icon
                  key={type}
                  name={MEAL_ICON[type]}
                  label={t(`mealTypes.${type}`)}
                  className="size-4 text-muted-foreground"
                />
              ))}

              {(dish.highProtein || shownTags.length > 0) && (
                <span
                  className="flex items-center gap-1"
                  title={format.list([
                    ...(dish.highProtein ? [t('nutritionFilters.high_protein')] : []),
                    ...shownTags.map((tag) => t(`tags.${tag}`)),
                  ])}
                >
                  {dish.highProtein && <span aria-hidden className={highProteinDotClasses()} />}
                  {shownTags.map((tag) => (
                    <span key={tag} aria-hidden className={dishTagDotClasses(tag)} />
                  ))}
                </span>
              )}
            </div>
          )}
        </div>
      </TableCell>

      {/* Category, not quality: which meal of the day this belongs to. Given its
          own glyph so the column is scannable without reading a word of it. */}
      <TableCell className="hidden md:table-cell">
        {mealTypes.length === 0 ? (
          <Empty />
        ) : (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {mealTypes.map((type) => (
              <span
                key={type}
                className="inline-flex items-center gap-1.5 whitespace-nowrap text-body-sm text-muted-foreground"
              >
                <Icon name={MEAL_ICON[type]} className="size-4 shrink-0 text-muted-foreground" />
                {t(`mealTypes.${type}`)}
              </span>
            ))}
          </div>
        )}
      </TableCell>

      {/*
        Qualities. The dot is the dish's colour everywhere in the app.

        High protein leads the run when the dish earns it — it is the one label
        here derived from the food rather than from someone's judgement, and it
        is the one a dietitian is most often scanning for, so it goes where the
        eye enters the cell rather than after three tags about shopping and
        effort.
      */}
      <TableCell className="hidden md:table-cell">
        {!dish.highProtein && tags.length === 0 ? (
          <Empty />
        ) : (
          <div className="flex flex-wrap items-center gap-1">
            {dish.highProtein && (
              <TagChip dot={highProteinDotClasses()} label={t('nutritionFilters.high_protein')} />
            )}
            {shownTags.map((tag) => (
              <TagChip key={tag} dot={dishTagDotClasses(tag)} label={t(`tags.${tag}`)} />
            ))}
            {overflow > 0 && (
              <span
                className="text-caption text-muted-foreground tabular-nums"
                dir="ltr"
                title={format.list(tags.slice(TAG_LIMIT).map((tag) => t(`tags.${tag}`)))}
              >
                {t('moreTags', { count: overflow })}
              </span>
            )}
          </div>
        )}
      </TableCell>

      {/* One nutrient per column, so a column can be compared down its length.
          The unit rides with the value rather than only in the head: a figure
          scrolled away from its header still has to say what it is. */}
      <NutrientCell value={dish.kcal} unit={NUTRIENT_UNITS.kcal} lead />
      <NutrientCell value={dish.carbs} unit={NUTRIENT_UNITS.carbs} className="hidden sm:table-cell" />
      <NutrientCell
        value={dish.protein}
        unit={NUTRIENT_UNITS.protein}
        className="hidden sm:table-cell"
      />

      {/* `relative` lifts the menu above the stretched button in the first cell,
          so it captures its own clicks. */}
      <TableCell className="relative w-px pe-2 text-end">
        {editing ? (
          <span className="flex size-8 items-center justify-center">
            <Spinner />
          </span>
        ) : (
          <DishRowActions
            locale={locale}
            dish={{ id: dish.id, name: localizedName(dish, locale), isSystem: dish.isSystem, hidden: dish.hidden }}
            onEdit={onEdit}
          />
        )}
      </TableCell>
    </TableRow>
  );
}

/** One tag in the qualities column: its colour dot, then its name. */
function TagChip({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-caption font-medium text-foreground">
      <span aria-hidden className={dot} />
      {label}
    </span>
  );
}

/**
 * One nutrient figure.
 *
 * `lead` is energy: it is the number a dietitian is actually budgeting against,
 * so it carries the row's weight and the macros beside it stay quiet.
 */
function NutrientCell({
  value,
  unit,
  lead,
  className,
}: {
  value: number;
  unit: string;
  lead?: boolean;
  /** The width this figure stands down at, if it stands down at all. */
  className?: string;
}) {
  return (
    <TableCell numeric className={cn('whitespace-nowrap text-end', className)}>
      <span className={cn('text-body-sm', lead ? 'font-semibold' : 'text-foreground')}>{value}</span>
      <span className="ms-0.5 text-caption text-muted-foreground">{unit}</span>
    </TableCell>
  );
}

/** A field this dish does not fill in. An em dash, never a blank cell. */
function Empty() {
  return (
    <span aria-hidden className="text-body-sm text-muted-foreground/60">
      —
    </span>
  );
}
