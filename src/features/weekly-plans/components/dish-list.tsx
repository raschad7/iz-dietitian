'use client';

import { useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';

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
import { TooltipHint } from '@/components/ui/tooltip-hint';
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

/** How many qualities a row prints before it folds the rest into a `+n`. */
const PROPERTY_LIMIT = 2;

/**
 * The empty optimistic set, hoisted so the reset below is a no-op re-render
 * rather than a new object every time the page re-fetches.
 */
const NONE_LEAVING: ReadonlySet<string> = new Set();

/**
 * The nutrition block, measured rather than left to `table-fixed`'s even split.
 *
 * Six equal columns gave three two-to-five-character numbers the same 220px a
 * dish name gets, so energy, carbs and protein sat a third of the table apart
 * and had to be read one at a time — the exact comparison the columns exist to
 * make. Sized to their own content instead, the three read as one block the eye
 * takes in at once, and the ~350px that frees goes back to the name, the meal
 * category and the qualities, which are the columns that were being truncated.
 *
 * The floor is the *column head*, not the figure: `TableHead` is `nowrap`, and
 * Arabic's "الكربوهيدرات" is wider than any carbs value will ever be. Anything
 * narrower than this and the head overflows its track into its neighbour.
 */
const KCAL_COL = 'w-24 px-2';
const MACRO_COL = 'w-[6.5rem] px-2';

/**
 * One predictable scan line per dish.
 *
 * The compact row needs one extra step for the classification marks folded
 * under the name. From `md` those marks move into their own columns, so the
 * row can tighten without letting a tag-heavy dish change the rhythm of the
 * whole register.
 */
const ROW_HEIGHT = 'h-22 md:h-18';

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

  /*
    Rows the reader has hidden (or brought back) and the server has not yet
    confirmed. See `left` below for why this belongs to the table rather than to
    the row that raised it.
  */
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(NONE_LEAVING);

  /*
    New server data is the end of every optimistic guess in the set — it is the
    real answer to all of them, whether it agrees or not.

    Adjusted **during render** rather than in an effect. React documents this as
    the way to reset state when a prop changes, and it is the pattern
    `DishFilters` already uses to mirror the URL back into its search field: the
    re-render happens before anything paints, so no frame is drawn showing rows
    that the server has just spoken about. An effect would run after the paint,
    which is a visible flash of the stale list, and it is what the
    `react-hooks/set-state-in-effect` rule is pointing at.

    Keyed on `items`, which is a fresh array on each render of the *page* but not
    of this component: a state change here re-renders with the same prop identity
    and leaves the set alone. A `router.refresh()` landing is what produces a new
    one.
  */
  const [lastItems, setLastItems] = useState(items);
  if (items !== lastItems) {
    setLastItems(items);
    setLeaving(NONE_LEAVING);
  }

  function markLeaving(dishId: string) {
    setLeaving((current) => new Set(current).add(dishId));
  }

  function unmarkLeaving(dishId: string) {
    setLeaving((current) => {
      const next = new Set(current);
      next.delete(dishId);
      return next;
    });
  }

  /*
    What the table shows: the server's rows, less the ones on their way out.

    Removal rather than a dimmed row, because both lists this table renders hold
    exactly one kind of dish — the catalog holds what is visible, the hidden
    shelf holds what is not — so a dish that has just been hidden does not belong
    in either view it could have been hidden from. Leaving it behind greyed out
    would be showing a row that the next refresh is about to take away anyway.
  */
  const shown = leaving.size ? items.filter((dish) => !leaving.has(dish.id)) : items;

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

  if (!shown.length) {
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
      <TableRoot data-guide="dishes-list" scrollY className="md:min-h-0 md:flex-1">
        {/*
          Fixed layout is the distribution rule: a column is as wide as it is
          declared to be, and whatever is left over is shared by the columns
          that declare nothing. The old auto-layout name track claimed every
          spare pixel (`w-full`), leaving the other five facts compressed
          together at the opposite edge of a wide screen.

          What declares a width: the action well (48px) and the three nutrient
          columns (`KCAL_COL` / `MACRO_COL`, sized to their own content). What
          does not: the name, the meal category and the qualities — the three
          columns that hold prose and therefore absorb the remainder.

          The responsive `hidden … table-cell` pairs below still remove their
          tracks at smaller widths, so the remaining columns redistribute that
          space instead of preserving empty desktop gaps.
        */}
        <Table className="table-fixed">
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
              <TableHead>{t('columns.name')}</TableHead>
              <TableHead className="hidden md:table-cell">{t('columns.mealTypes')}</TableHead>
              <TableHead className="hidden md:table-cell">{t('columns.tags')}</TableHead>
              <TableHead numeric className={cn('text-end', KCAL_COL)}>
                {t('columns.kcal')}
              </TableHead>
              <TableHead numeric className={cn('hidden text-end sm:table-cell', MACRO_COL)}>
                {t('columns.carbs')}
              </TableHead>
              <TableHead numeric className={cn('hidden text-end sm:table-cell', MACRO_COL)}>
                {t('columns.protein')}
              </TableHead>
              {/* The actions column is named for a screen reader only — a visible
                  head over a menu button is a label for a thing that has one. */}
              <TableHead className="w-12 ps-2 pe-2">
                <span className="sr-only">{t('columns.actions')}</span>
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {shown.map((dish) => (
              <DishRow
                key={dish.id}
                dish={dish}
                locale={locale}
                editing={loadingEditId === dish.id}
                onOpen={() => setDetailId(dish.id)}
                onEdit={() => startEdit(dish.id)}
                onLeave={() => markLeaving(dish.id)}
                onLeaveFailed={() => unmarkLeaving(dish.id)}
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
  onLeave,
  onLeaveFailed,
}: {
  dish: DishCardData;
  locale: string;
  editing: boolean;
  onOpen: () => void;
  onEdit: () => void;
  /** Hidden, or brought back — either way this row leaves the list it is in. */
  onLeave: () => void;
  /** The write failed; the row belongs back where it was. */
  onLeaveFailed: () => void;
}) {
  const t = useTranslations('dishes');
  // `format.list` and not a hardcoded '، ': that separator is an Arabic comma,
  // so the English build was joining its own tag names with it too. Same repair
  // as `ClientNutrition`.
  const format = useFormatter();

  const mealTypes = membersOf(MEAL_TYPES, dish.mealTypes);
  const tags = membersOf(DISH_TAGS, dish.tags);
  const properties = [
    ...(dish.highProtein
      ? [
          {
            key: 'high-protein',
            dot: highProteinDotClasses(),
            label: t('nutritionFilters.high_protein'),
          },
        ]
      : []),
    ...tags.map((tag) => ({
      key: tag,
      dot: dishTagDotClasses(tag),
      label: t(`tags.${tag}`),
    })),
  ];
  const shownProperties = properties.slice(0, PROPERTY_LIMIT);
  const hiddenProperties = properties.slice(PROPERTY_LIMIT);
  const hiddenPropertyLabels = format.list(hiddenProperties.map((property) => property.label));

  return (
    /*
      No dimming, and no badge under the name.

      Both existed to pick the hidden dishes out of a list that also held visible
      ones, and that list is gone: `hiddenOnly` made the hidden shelf a view of
      its own, so every row here is hidden or none of them is. Dimming all of
      them is a table nobody can read to say something the toolbar's own chip
      already says, and a badge repeated on every row is furniture.

      `dish.hidden` still matters — it is what tells the row's action well to
      offer Unhide rather than Hide.
    */
    <TableRow linked className={ROW_HEIGHT}>
      <TableCell>
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

            The first two qualities stay as marks and the remainder folds into
            the same `+n` count as the full column, so a heavily tagged dish
            cannot crowd the name above it.
          */}
          {(mealTypes.length > 0 || properties.length > 0) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 md:hidden">
              {mealTypes.map((type) => (
                <Icon
                  key={type}
                  name={MEAL_ICON[type]}
                  label={t(`mealTypes.${type}`)}
                  className="size-4 text-muted-foreground"
                />
              ))}

              {properties.length > 0 && (
                <span
                  className="flex items-center gap-1"
                  title={format.list(properties.map((property) => property.label))}
                >
                  {shownProperties.map((property) => (
                    <span key={property.key} aria-hidden className={property.dot} />
                  ))}
                  {hiddenProperties.length > 0 && (
                    <span className="text-caption text-muted-foreground tabular-nums" dir="ltr">
                      {t('moreTags', { count: hiddenProperties.length })}
                    </span>
                  )}
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
          <div className="flex min-w-0 flex-nowrap items-center gap-2 overflow-hidden">
            {mealTypes.map((type) => (
              <span
                key={type}
                title={t(`mealTypes.${type}`)}
                className="inline-flex min-w-0 items-center gap-1.5 text-body-sm text-muted-foreground"
              >
                <Icon name={MEAL_ICON[type]} className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{t(`mealTypes.${type}`)}</span>
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
      <TableCell className="relative hidden md:table-cell">
        {properties.length === 0 ? (
          <Empty />
        ) : (
          <div className="flex min-w-0 flex-nowrap items-center gap-1 overflow-hidden">
            {shownProperties.map((property) => (
              <TagChip key={property.key} dot={property.dot} label={property.label} />
            ))}
            {hiddenProperties.length > 0 && (
              <PropertyOverflow
                count={hiddenProperties.length}
                label={hiddenPropertyLabels}
                moreLabel={t('moreTags', { count: hiddenProperties.length })}
              />
            )}
          </div>
        )}
      </TableCell>

      {/* One nutrient per column, so a column can be compared down its length.
          The unit rides with the value rather than only in the head: a figure
          scrolled away from its header still has to say what it is. */}
      <NutrientCell value={dish.kcal} unit={NUTRIENT_UNITS.kcal} lead className={KCAL_COL} />
      <NutrientCell
        value={dish.carbs}
        unit={NUTRIENT_UNITS.carbs}
        className={cn('hidden sm:table-cell', MACRO_COL)}
      />
      <NutrientCell
        value={dish.protein}
        unit={NUTRIENT_UNITS.protein}
        className={cn('hidden sm:table-cell', MACRO_COL)}
      />

      {/* `relative` lifts the menu above the stretched button in the first cell,
          so it captures its own clicks. */}
      <TableCell className="relative w-12 ps-2 pe-2 text-end">
        {editing ? (
          <span className="flex size-8 items-center justify-center">
            <Spinner />
          </span>
        ) : (
          <DishRowActions
            locale={locale}
            dish={{ id: dish.id, name: localizedName(dish, locale), isSystem: dish.isSystem, hidden: dish.hidden }}
            onEdit={onEdit}
            onLeave={onLeave}
            onLeaveFailed={onLeaveFailed}
          />
        )}
      </TableCell>
    </TableRow>
  );
}

/** One tag in the qualities column: its colour dot, then its name. */
function TagChip({ dot, label }: { dot: string; label: string }) {
  return (
    <TooltipHint label={<span dir="auto">{label}</span>} className="relative min-w-0 shrink">
      <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-caption font-medium text-foreground">
        <span aria-hidden className={cn('shrink-0', dot)} />
        <span className="truncate">{label}</span>
      </span>
    </TooltipHint>
  );
}

/** The qualities that do not fit in the two-chip scan line. */
function PropertyOverflow({
  count,
  label,
  moreLabel,
}: {
  count: number;
  label: string;
  moreLabel: string;
}) {
  return (
    <TooltipHint label={<span dir="auto">{label}</span>} className="relative shrink-0">
      <button
        type="button"
        aria-label={`${moreLabel}: ${label}`}
        className="shrink-0 rounded-sm px-1 text-caption text-muted-foreground tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span aria-hidden dir="ltr">
          +{count}
        </span>
      </button>
    </TooltipHint>
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
  /** The column's measured width, plus the width it stands down at (if any). */
  className?: string;
}) {
  return (
    <TableCell numeric className={cn('whitespace-nowrap text-end', className)}>
      <span className={cn('text-body-md', lead ? 'font-semibold' : 'text-foreground')}>{value}</span>
      <span className="ms-0.5 text-body-sm text-muted-foreground">{unit}</span>
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
