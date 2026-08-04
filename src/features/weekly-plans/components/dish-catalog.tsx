'use client';

import { useMemo, useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { useDraggable } from '@dnd-kit/core';
import { useTranslations } from 'next-intl';

import { Button, buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { membersOf } from '@/lib/enum';
import { cn } from '@/lib/utils';

import { roundForDisplay } from '@/features/weekly-plans/nutrition';

import {
  availableOptions as optionsFor,
  CATALOG_OPTIONS,
  filterCatalog,
  type CatalogContext,
  type CatalogOption,
} from '../catalog-filter';
import type { CatalogEntry } from '../queries';
import { ALLERGENS, DISH_TAGS, mealTypeForSlot, type DishTag } from '../schema';
import { bestServings } from '../similar';
import { PLANNER_THEME } from '../theme';
import type { RecentUse } from '../usage';

/**
 * The dish catalog, as the rail's third tab.
 *
 * Filters default to the slot the dietitian has open — its meal type, ranked by
 * how close each dish lands to that slot's budget — because the question being
 * asked is almost always "what else fits here", not "what exists".
 *
 * Dishes carrying one of the client's allergens are shown, disabled, and labelled
 * with the allergen. Hiding them produces the worse failure: searching for a dish
 * you know exists, finding nothing, and concluding the catalog is broken. The
 * `allergenSafe` option lets the dietitian hide them on purpose, which is a
 * different thing from the panel deciding to.
 */

export function DishCatalog({
  catalog,
  usage,
  slot,
  editable,
}: {
  catalog: readonly CatalogEntry[];
  /** How recently this client had each dish, keyed by dish id. */
  usage: Record<string, RecentUse>;
  /** The open meal, if there is one. Drives the default filter and the portions. */
  slot: { slotKey: string; budgetKcal: number } | null;
  editable: boolean;
}) {
  const t = useTranslations('weeklyPlans');
  const [query, setQuery] = useState('');
  // Plural. One tag at a time made the panel unable to answer the question it
  // exists for — "something vegetarian that is also quick" — and there was no
  // way to tell, from the closed popover, which single tag was even on.
  // `DishTag`, not `string`: next-intl only accepts message keys it can see, so
  // a widened element type here makes `t('tags.' + entry)` unresolvable.
  const [tags, setTags] = useState<readonly DishTag[]>([]);
  const [options, setOptions] = useState<readonly CatalogOption[]>([]);
  const [allMealTypes, setAllMealTypes] = useState(false);

  const mealType = slot ? mealTypeForSlot(slot.slotKey) : null;
  const activeMealType = mealType && !allMealTypes ? mealType : null;
  const needle = query.trim().toLowerCase();
  const budgetKcal = slot && slot.budgetKcal > 0 ? slot.budgetKcal : null;

  const context = useMemo<CatalogContext>(() => ({ usage, budgetKcal }), [usage, budgetKcal]);

  const availableOptions = useMemo(() => optionsFor(catalog, context), [catalog, context]);

  const shown = useMemo(() => {
    const matches = filterCatalog(
      catalog,
      { needle, mealType: activeMealType, tags, options },
      context,
    );

    // With a slot open, nearest-to-budget first: the top of the list becomes the
    // answer rather than the alphabet.
    if (budgetKcal === null) return matches;

    return [...matches].sort((a, b) => {
      const fit = (dish: CatalogEntry) =>
        Math.abs((bestServings(dish.baseKcal, budgetKcal) ?? 1) * dish.baseKcal - budgetKcal);

      return fit(a) - fit(b);
    });
  }, [catalog, needle, activeMealType, tags, options, context, budgetKcal]);

  /**
   * How many dishes each chip would leave, given everything already chosen.
   *
   * A filter that silently returns nothing is the whole reason one feels
   * broken — you press a chip, the list empties, and there is no way to know
   * whether the catalog is thin or the combination is impossible. Printing the
   * count on the chip answers that before it is pressed, and a chip that would
   * return nothing is disabled rather than left as a trap.
   *
   * Cheap enough to do on every keystroke: the catalog is already in memory and
   * this is nine passes over a few hundred rows.
   */
  const counts = useMemo(() => {
    const byChip: Record<string, number> = {};
    const base = { needle, mealType: activeMealType, tags, options };

    for (const entry of DISH_TAGS) {
      const next = tags.includes(entry) ? tags : [...tags, entry];
      byChip[entry] = filterCatalog(catalog, { ...base, tags: next }, context).length;
    }

    for (const entry of CATALOG_OPTIONS) {
      const next = options.includes(entry) ? options : [...options, entry];
      byChip[entry] = filterCatalog(catalog, { ...base, options: next }, context).length;
    }

    return byChip;
  }, [catalog, needle, activeMealType, tags, options, context]);

  const activeCount = tags.length + options.length + (activeMealType ? 1 : 0);

  function clearFilters(): void {
    setTags([]);
    setOptions([]);
    setAllMealTypes(true);
  }

  function toggleOption(entry: CatalogOption): void {
    setOptions((current) =>
      current.includes(entry) ? current.filter((value) => value !== entry) : [...current, entry],
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="relative shrink-0 border-b border-border pb-3">
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('searchDishes')}
        />

        {/*
          What is filtering the list stays *on* the panel, not behind the
          popover that set it. A closed popover with a filter still applied is
          a list that has quietly stopped showing you things, with the reason
          one click out of sight — and that is what made this feel broken.
          Every active filter is a chip here, and pressing a chip removes it.
        */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {mealType && (
            <FilterChip
              active={!allMealTypes}
              onClick={() => setAllMealTypes((value) => !value)}
              title={allMealTypes ? undefined : t('allMealTypes')}
            >
              {t(`mealTypes.${mealType}`)}
              {!allMealTypes && <Icon name="close" className="size-3.5" />}
            </FilterChip>
          )}

          {tags.map((entry) => (
            <FilterChip
              key={entry}
              active
              onClick={() => setTags((current) => current.filter((value) => value !== entry))}
            >
              {t(`tags.${entry}`)}
              <Icon name="close" className="size-3.5" />
            </FilterChip>
          ))}

          {options.map((entry) => (
            <FilterChip key={entry} active onClick={() => toggleOption(entry)}>
              {t(`dishOptions.${entry}`)}
              <Icon name="close" className="size-3.5" />
            </FilterChip>
          ))}

          <Popover.Root>
            <Popover.Trigger
              className={buttonVariants({ variant: 'outline', size: 'sm', className: 'px-3 text-label' })}
            >
              <Icon name="filter" />
              {t('dishFilters')}
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
                <Popover.Popup className={cn(PLANNER_THEME, "w-72 origin-(--transform-origin) rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-overlay transition-[transform,opacity] duration-150 ease-[cubic-bezier(.2,.6,.2,1)] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0")}>
                  <Popover.Title className="pb-2 text-label font-semibold">{t('dishFilters')}</Popover.Title>

                  {/* Two groups, because they answer different questions. The
                      tags describe the dish; the options describe whether it
                      belongs in *this* slot for *this* client. Run together in
                      one wrap they read as nine interchangeable switches. */}
                  {availableOptions.length > 0 && (
                    <FilterGroup label={t('filterForThisSlot')}>
                      {availableOptions.map((entry) => {
                        const selected = options.includes(entry);
                        const count = counts[entry] ?? 0;

                        return (
                          <FilterChip
                            key={entry}
                            active={selected}
                            disabled={!selected && count === 0}
                            onClick={() => toggleOption(entry)}
                          >
                            {t(`dishOptions.${entry}`)}
                            <ChipCount value={count} />
                          </FilterChip>
                        );
                      })}
                    </FilterGroup>
                  )}

                  <FilterGroup label={t('filterTags')}>
                    {DISH_TAGS.map((entry) => {
                      const selected = tags.includes(entry);
                      const count = counts[entry] ?? 0;

                      return (
                        <FilterChip
                          key={entry}
                          active={selected}
                          disabled={!selected && count === 0}
                          onClick={() =>
                            setTags((current) =>
                              current.includes(entry)
                                ? current.filter((value) => value !== entry)
                                : [...current, entry],
                            )
                          }
                        >
                          {t(`tags.${entry}`)}
                          <ChipCount value={count} />
                        </FilterChip>
                      );
                    })}
                  </FilterGroup>
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </Popover.Root>

          {activeCount > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
              {t('clearFilters')}
            </Button>
          )}
        </div>

        {slot && slot.budgetKcal > 0 && (
          <div className="mt-2 flex items-center justify-between gap-2 text-caption">
            <strong className="text-primary">{t('bestMatches', { value: slot.budgetKcal })}</strong>
            <span className="text-muted-foreground">{shown.length}</span>
          </div>
        )}
      </div>

      {shown.length === 0 ? (
        /* An empty list is only a dead end if the thing that emptied it is out
           of reach. The way back is in the same place the eye lands. */
        <div className="pt-6 text-center">
          <p className="text-body-sm text-muted-foreground">{t('noDishes')}</p>
          {activeCount > 0 && (
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={clearFilters}>
              {t('clearFilters')}
            </Button>
          )}
        </div>
      ) : (
        <ul className="no-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          {shown.map((dish) => (
            <li key={dish.id}>
              <CatalogRow
                dish={dish}
                usage={usage[dish.id]}
                servings={slot ? (bestServings(dish.baseKcal, slot.budgetKcal) ?? 1) : 1}
                budgetKcal={slot?.budgetKcal ?? null}
                draggable={editable && dish.blockedBy.length === 0}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A titled run of chips inside the filter popover. */
function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="pt-2 first-of-type:pt-0">
      <h4 className="pb-1.5 text-caption text-muted-foreground">{label}</h4>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </section>
  );
}

/**
 * How many rows a chip would leave.
 *
 * `dir="ltr"` because it is a figure inside Arabic text, and `tabular-nums` so
 * a column of chips does not shuffle as the counts change under a search.
 */
function ChipCount({ value }: { value: number }) {
  return (
    <span className="tabular-nums opacity-70" dir="ltr">
      {value}
    </span>
  );
}

function FilterChip({
  active,
  disabled,
  onClick,
  title,
  children,
}: {
  active: boolean;
  /** A chip whose combination would return nothing. Shown, not hidden. */
  disabled?: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      className={cn(
        /* A pill, per the shape rules: a chip is a label, not a control
           surface, and `rounded-md` had it reading as a small button.

           40px, the system's floor for anything you can press. It was 24px,
           which fitted more chips into the rail by making each of them a worse
           target — and below `xl` this panel is a bottom sheet, so it is being
           pressed with a thumb. Wrapping onto a third row is the cost. */
        'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1 text-caption transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border text-muted-foreground hover:bg-accent',
        // Dimmed and inert rather than removed. A tag that vanishes when it
        // stops matching teaches the dietitian the catalog is missing things.
        disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent',
      )}
    >
      {children}
    </button>
  );
}

/**
 * One dish, draggable onto the board.
 *
 * The portion travels with the drag: whatever multiplier lands closest to the open
 * slot's budget, so a dropped dish arrives already sized rather than at one
 * serving the dietitian then has to correct.
 */
function CatalogRow({
  dish,
  usage,
  servings,
  budgetKcal,
  draggable,
}: {
  dish: CatalogEntry;
  usage: RecentUse | undefined;
  servings: number;
  budgetKcal: number | null;
  draggable: boolean;
}) {
  const t = useTranslations('weeklyPlans');

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `dish:${dish.id}`,
    disabled: !draggable,
    data: { kind: 'dish', dish, servings },
  });

  const blocked = dish.blockedBy.length > 0;
  const kcal = roundForDisplay('kcal', dish.baseKcal * servings);
  const delta = budgetKcal === null ? null : kcal - budgetKcal;
  const deltaLabel = delta === null ? null : `${delta > 0 ? '+' : ''}${delta}`;

  return (
    <div
      ref={setNodeRef}
      {...(draggable ? listeners : {})}
      {...(draggable ? attributes : {})}
      aria-disabled={blocked || undefined}
      className={cn(
        'grid min-h-16 grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-2 border-b border-border py-2.5 text-start transition-colors',
        draggable && 'cursor-grab hover:bg-accent/50',
        blocked && 'bg-muted/50 opacity-70',
        isDragging && 'opacity-40',
      )}
    >
      <Icon name="dragHandle" className="size-4 text-muted-foreground" />
      <span className="min-w-0">
        <span className="block truncate font-heading text-body-sm font-semibold" dir="auto">
          {dish.nameAr}
        </span>
        <span className="mt-0.5 block text-caption text-muted-foreground">
          {blocked ? (
            <span className="text-status-medical-fg">
              {t('blockedByAllergen', {
                // Narrowed against the enum rather than interpolated as a string:
                // next-intl only accepts keys it can see, and a `text[]` column is
                // not proof that its contents are still valid allergen names.
                allergens: membersOf(ALLERGENS, dish.blockedBy)
                  .map((tag) => t(`allergens.${tag}`))
                  .join('، '),
              })}
            </span>
          ) : (
            <>
              {t('portionShort', { servings })}
              {deltaLabel && (
                <>
                  <span aria-hidden> · </span>
                  <span dir="ltr">{t('targetDifference', { value: deltaLabel })}</span>
                </>
              )}
              {usage && (
                <>
                  {' '}·{' '}
                  {usage.weeksAgo === 0
                    ? t('usedThisWeek')
                    : t('usedWeeksAgo', { count: usage.weeksAgo })}
                </>
              )}
            </>
          )}
        </span>
      </span>
      <span className="text-label font-semibold tabular-nums" dir="ltr">
        {kcal}
      </span>
    </div>
  );
}
