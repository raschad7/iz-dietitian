'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { usePathname, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { type OwnerFilter } from '@/features/weekly-plans/catalog-ownership';
import { dishTagDotClasses, highProteinDotClasses } from '@/features/weekly-plans/meal-tag-tone';
import { DISH_TAGS, MEAL_TYPES, type DishTag, type MealType } from '@/features/weekly-plans/schema';

/** How long to let someone keep typing before the catalog re-queries. */
const SEARCH_DEBOUNCE_MS = 300;

/** Meal categories in the order a day runs, not the order the enum happens to be in. */
const MEAL_TAB_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'].filter(
  (value): value is MealType => (MEAL_TYPES as readonly string[]).includes(value),
);

/** The category's own glyph, so the list reads as meals rather than as four more chips. */
const MEAL_ICON: Record<MealType, IconName> = {
  breakfast: 'mealBreakfast',
  lunch: 'mealLunch',
  dinner: 'mealDinner',
  snack: 'mealSnack',
};

/** The ownership filter's three choices — `all` clears the URL param. */
const OWNER_OPTIONS = ['all', 'system', 'clinic'] as const;

/**
 * The catalog's toolbar.
 *
 * ## One control, not four
 *
 * This row used to carry a search box, a three-way ownership switch, a Filters
 * popover *and* a second row of five meal tabs. Four controls of three different
 * shapes, none of which said which of them was currently narrowing the list —
 * so the honest answer to "why am I seeing 79 dishes" was somewhere in a row you
 * had to reconstruct by eye.
 *
 * Now there are exactly two things above the table: **search**, because it is
 * typed on nearly every visit and is not a filter but a lookup, and **Filters**,
 * which owns every narrowing choice in one popover, grouped by the question each
 * group answers:
 *
 * 1. *Meal category* — which meal of the day. A category, not a quality: single
 *    select, with the meal's own icon.
 * 2. *Who added it* — shared library vs. this clinic's own.
 * 3. *Dish qualities* — the practical tags. Multi-select, AND. Each carries the
 *    colour dot it has everywhere else, so the popover teaches the legend that
 *    the table and the weekly plan then use.
 * 4. *Nutrition* — the computed high-protein filter.
 * 5. *Show hidden* — administrative, kept below a rule and out of the run.
 *
 * ## What is on, stays visible
 *
 * A closed popover hiding an active filter is the thing that makes a list feel
 * broken: it has quietly stopped showing you dishes and the reason is one click
 * out of sight. So every active choice is also a removable chip on the row
 * beneath, and the trigger carries a count. Nothing narrows this list invisibly.
 *
 * Everything round-trips through the URL, so a filtered catalog stays shareable
 * and the server query that owns pagination reads it back.
 */
export function DishFilters({
  q,
  mealType,
  tags,
  highProtein,
  owner,
  showHidden,
  children,
}: {
  q: string | undefined;
  mealType: string | undefined;
  tags: readonly DishTag[];
  highProtein: boolean;
  owner: OwnerFilter | undefined;
  showHidden: boolean;
  /**
   * The page's primary action, pinned to the end of this row.
   *
   * A slot rather than an import, because the toolbar owns the row's geometry
   * and nothing else should be allowed to change it — whatever lands here is
   * `shrink-0` beside the Filters button and inside the same fixed height.
   */
  children?: React.ReactNode;
}) {
  const t = useTranslations('dishes');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [term, setTerm] = useState(q ?? '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // The URL can change from outside this field (reset, back button); mirror it back
  // rather than keep showing a term that no longer matches the list. Adjusted during
  // render — React's documented pattern — so no stale value paints.
  const [lastSynced, setLastSynced] = useState(q ?? '');
  if ((q ?? '') !== lastSynced) {
    setLastSynced(q ?? '');
    setTerm(q ?? '');
  }

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  /** Writes one or more params and sends the reader back to the first page. */
  function navigate(changes: Record<string, string>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    // A new search or filter always restarts at page 1.
    next.delete('page');
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  }

  function handleSearch(value: string) {
    setTerm(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => navigate({ q: value }), SEARCH_DEBOUNCE_MS);
  }

  function toggleTag(tag: DishTag) {
    const next = tags.includes(tag) ? tags.filter((entry) => entry !== tag) : [...tags, tag];
    navigate({ tags: next.join(',') });
  }

  const activeMealType = MEAL_TAB_ORDER.find((type) => type === mealType) ?? null;

  // Everything the popover can turn on. Search is excluded — it has its own
  // field on the row and clearing it there is obvious.
  const filterCount =
    tags.length + (highProtein ? 1 : 0) + (showHidden ? 1 : 0) + (activeMealType ? 1 : 0) + (owner ? 1 : 0);

  function resetFilters() {
    navigate({ mealType: '', owner: '', tags: '', hp: '', hidden: '' });
  }

  function resetAll() {
    clearTimeout(debounceRef.current);
    setTerm('');
    startTransition(() => router.replace(pathname));
  }

  return (
    /*
      One row, one fixed height, and nothing in it may change that.

      The active-filter chips used to live on a second row that mounted the
      moment you pressed your first chip — which pushed the entire table down a
      row's worth just as you were about to read it. The chips are worth keeping
      (a filter you cannot see is what makes a list feel broken), so they moved
      *into* this row instead, in a strip that scrolls sideways when there are
      more of them than fit. The search field is `max-w-sm` rather than `flex-1`
      so it does not resize as chips arrive either: the strip absorbs the change,
      and the row it sits in is `h-10` whether it holds nothing or eight chips.
    */
    <div className="flex h-10 shrink-0 items-center gap-2">
      <Input
        name="q"
        type="search"
        icon="search"
        value={term}
        onChange={(event) => handleSearch(event.target.value)}
        placeholder={t('searchPlaceholder')}
        aria-label={t('searchPlaceholder')}
        className="w-full max-w-sm min-w-24 shrink"
      />

      {/*
        The active filters, inline. `min-w-0` plus `overflow-x-auto` is what
        keeps the promise above: eight chips scroll inside this strip rather than
        wrapping the row onto a second line and moving the table.

        `nowrap` on the strip, not on the chips — a chip that wrapped its own
        label would grow the row just as surely as a second line of chips.
      */}
      <div className="no-scrollbar flex min-w-0 flex-1 basis-24 items-center gap-1.5 overflow-x-auto whitespace-nowrap">
        {activeMealType && (
          <ActiveChip onRemove={() => navigate({ mealType: '' })}>
            <Icon name={MEAL_ICON[activeMealType]} className="size-3.5" />
            {t(`mealTypes.${activeMealType}`)}
          </ActiveChip>
        )}

        {owner && (
          <ActiveChip onRemove={() => navigate({ owner: '' })}>{t(`ownerFilter.${owner}`)}</ActiveChip>
        )}

        {highProtein && (
          <ActiveChip onRemove={() => navigate({ hp: '' })}>
            <span aria-hidden className={highProteinDotClasses()} />
            {t('nutritionFilters.high_protein')}
          </ActiveChip>
        )}

        {tags.map((tag) => (
          <ActiveChip key={tag} onRemove={() => toggleTag(tag)}>
            <span aria-hidden className={dishTagDotClasses(tag)} />
            {t(`tags.${tag}`)}
          </ActiveChip>
        ))}

        {showHidden && (
          <ActiveChip onRemove={() => navigate({ hidden: '' })}>{t('showHidden')}</ActiveChip>
        )}

        {(filterCount > 0 || Boolean(q)) && (
          <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={resetAll}>
            {t('clearFilters')}
          </Button>
        )}
      </div>

      <Popover>
        <PopoverTrigger
          // Named for assistive tech regardless of the viewport, since the
          // visible word below is hidden on a phone.
          aria-label={t('filters')}
          className={buttonVariants({
            variant: filterCount > 0 ? 'neutral' : 'neutralGhost',
            className: 'shrink-0',
          })}
        >
          <Icon name="filter" />
          {/* The word drops below `sm`. On a 375px row the search field, this
              button and one active chip cannot all fit, and the label is the
              only one of the three that is redundant — the funnel icon and the
              count already say what this is and whether it is doing anything. */}
          <span className="hidden sm:inline">{t('filters')}</span>
          {filterCount > 0 && (
            <span
              className="ms-1 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-caption font-semibold text-primary-foreground tabular-nums"
              dir="ltr"
            >
              {filterCount}
            </span>
          )}
        </PopoverTrigger>

        <PopoverContent
          side="bottom"
          align="end"
          sideOffset={6}
          className="max-h-[min(32rem,calc(100svh-8rem))] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto p-0"
        >
          {/*
            The reset control is **always** rendered, and disabled when there
            is nothing to reset.

            Mounting it only once a filter is on made the header grow a button
            the moment you pressed your first chip: the row got taller, the
            title shifted, and the whole popover changed shape under the
            pointer that was still moving inside it. A control that appears is
            a layout change; a control that goes from dim to live is a state
            change, and only the second one is honest about what happened.
            Same reason the panel below never adds or removes a section.
          */}
          <div className="flex h-13 items-center justify-between gap-2 border-b border-border px-4">
            <PopoverTitle className="text-label font-semibold">{t('filters')}</PopoverTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={filterCount === 0}
              onClick={resetFilters}
            >
              {t('filtersReset')}
            </Button>
          </div>

          <div className="divide-y divide-border">
            {/* 1 — Meal category. Single select, and "all" is a real choice in
                the run rather than the absence of one. */}
            <FilterSection label={t('columns.mealTypes')}>
              <div className="grid grid-cols-2 gap-1.5">
                <OptionRow
                  selected={!activeMealType}
                  onClick={() => navigate({ mealType: '' })}
                  label={t('allMealTypes')}
                />
                {MEAL_TAB_ORDER.map((type) => (
                  <OptionRow
                    key={type}
                    selected={activeMealType === type}
                    onClick={() => navigate({ mealType: activeMealType === type ? '' : type })}
                    icon={MEAL_ICON[type]}
                    label={t(`mealTypes.${type}`)}
                  />
                ))}
              </div>
            </FilterSection>

            {/* 2 — Ownership. Also single select, so it gets the same shape. */}
            <FilterSection label={t('ownerFilter.label')}>
              <div className="grid grid-cols-3 gap-1.5">
                {OWNER_OPTIONS.map((value) => (
                  <OptionRow
                    key={value}
                    selected={(owner ?? 'all') === value}
                    onClick={() => navigate({ owner: value === 'all' ? '' : value })}
                    label={t(`ownerFilter.${value}`)}
                  />
                ))}
              </div>
            </FilterSection>

            {/*
              3 — Qualities. Multi-select, and the dots are the legend for the
              colours the table and the weekly plan both use.

              High protein sits in this run rather than in a nutrition section
              of its own. It *is* computed rather than typed — the filter
              resolves it against `nutritionCategory()`, so it can never
              disagree with the dish's numbers — but to the person filtering it
              is one more quality a dish either has or does not, and splitting
              it out bought a whole extra section heading to say something only
              the database cares about. It leads the run, as it leads the chip
              run in each row.
            */}
            <FilterSection label={t('columns.tags')}>
              <div className="flex flex-wrap gap-1.5">
                <TagChip
                  dot={highProteinDotClasses()}
                  active={highProtein}
                  onClick={() => navigate({ hp: highProtein ? '' : '1' })}
                  label={t('nutritionFilters.high_protein')}
                />
                {DISH_TAGS.map((tag: DishTag) => (
                  <TagChip
                    key={tag}
                    dot={dishTagDotClasses(tag)}
                    active={tags.includes(tag)}
                    onClick={() => toggleTag(tag)}
                    label={t(`tags.${tag}`)}
                  />
                ))}
              </div>
            </FilterSection>

            {/* 4 — Administrative. Quiet, and out of the filter run entirely. */}
            <div className="p-3">
              <button
                type="button"
                aria-pressed={showHidden}
                onClick={() => navigate({ hidden: showHidden ? '' : '1' })}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-2 text-body-sm transition-colors',
                  showHidden
                    ? 'font-medium text-primary'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                )}
              >
                <Icon name={showHidden ? 'eye' : 'eyeOff'} className="size-4" />
                {t('showHidden')}
                {showHidden && <Icon name="check" className="ms-auto size-4" />}
              </button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {children}
    </div>
  );
}

/** One titled group inside the Filters popover. */
function FilterSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="p-3">
      <h4 className="px-1 pb-2 text-caption font-medium text-muted-foreground">{label}</h4>
      {children}
    </section>
  );
}

/**
 * A single-select option: a full-width target with its own label, rather than a
 * pill that has to be measured against its neighbours to see which is on.
 */
function OptionRow({
  selected,
  onClick,
  icon,
  label,
  className,
}: {
  selected: boolean;
  onClick: () => void;
  icon?: IconName;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'inline-flex h-9 items-center justify-center gap-1.5 rounded-md border px-2.5 text-body-sm transition-colors',
        selected
          ? 'border-transparent bg-secondary font-semibold text-primary'
          : 'border-input text-muted-foreground hover:bg-accent/50 hover:text-foreground',
        className,
      )}
    >
      {icon && <Icon name={icon} className="size-4 shrink-0" />}
      <span className="truncate">{label}</span>
    </button>
  );
}

/**
 * A quality chip, carrying the tag's own colour dot.
 *
 * The dot is the same token the catalog table and the planner's meal card paint,
 * so this popover doubles as the legend for both.
 */
function TagChip({
  dot,
  active,
  onClick,
  label,
}: {
  /** The full dot class run from `meal-tag-tone`. */
  dot: string;
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-body-sm font-medium transition-colors',
        active
          ? 'border-transparent bg-secondary font-semibold text-primary'
          : 'border-input text-muted-foreground hover:border-(--input-hover) hover:bg-secondary/60',
      )}
    >
      <span aria-hidden className={dot} />
      {label}
    </button>
  );
}

/** An active filter, shown on the toolbar. Pressing it removes that one filter. */
function ActiveChip({ onRemove, children }: { onRemove: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-secondary px-3 text-caption font-medium text-secondary-foreground transition-colors hover:bg-primary-subtle"
    >
      {children}
      <Icon name="close" className="size-3.5 opacity-70" />
    </button>
  );
}
