'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { Segmented } from '@/components/ui/segmented';
import { usePathname, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { type OwnerFilter } from '@/features/weekly-plans/catalog-ownership';
import { DISH_TAGS, MEAL_TYPES, type DishTag, type MealType } from '@/features/weekly-plans/schema';

/** How long to let someone keep typing before the catalog re-queries. */
const SEARCH_DEBOUNCE_MS = 300;

/** Meal categories in the order the spec's tabs read: breakfast, lunch, dinner, snack. */
const MEAL_TAB_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'].filter((value): value is MealType =>
  (MEAL_TYPES as readonly string[]).includes(value),
);

/**
 * The catalog's toolbar (spec §4): a search box and the five meal tabs stay in
 * view — the choice a dietitian makes on almost every visit — and everything else
 * (the practical qualities, the computed high-protein filter, the administrative
 * "show hidden") folds into one Filters popover so the toolbar reads as two calm
 * rows instead of a wall of pills.
 *
 * Everything round-trips through the URL, so a filtered catalog stays shareable and
 * the server query that owns pagination reads it back.
 */
/** The ownership filter's three choices — `all` clears the URL param. */
const OWNER_OPTIONS = ['all', 'system', 'clinic'] as const;
type OwnerOption = (typeof OWNER_OPTIONS)[number];

export function DishFilters({
  q,
  mealType,
  tags,
  highProtein,
  owner,
  showHidden,
}: {
  q: string | undefined;
  mealType: string | undefined;
  tags: readonly DishTag[];
  highProtein: boolean;
  owner: OwnerFilter | undefined;
  showHidden: boolean;
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

  // Meal type is a visible tab, so it is not counted here — this is the number of
  // things hidden behind the popover that are currently narrowing the list.
  const filterCount = tags.length + (highProtein ? 1 : 0) + (showHidden ? 1 : 0);
  const anyActive = Boolean(q) || Boolean(mealType) || Boolean(owner) || filterCount > 0;

  function setOwner(value: OwnerOption) {
    navigate({ owner: value === 'all' ? '' : value });
  }

  function resetAll() {
    clearTimeout(debounceRef.current);
    setTerm('');
    startTransition(() => router.replace(pathname));
  }

  return (
    <div className="flex shrink-0 flex-col gap-3">
      {/* Row 1: search, the ownership filter, then the Filters popover. Wraps on
          narrow screens rather than crushing the search. */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          name="q"
          type="search"
          icon="search"
          value={term}
          onChange={(event) => handleSearch(event.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          className="min-w-56 flex-1"
        />

        {/* Ownership: shared vs the clinic's own vs all (Phase 2 §2). */}
        <Segmented<OwnerOption>
          role="radiogroup"
          size="sm"
          label={t('ownerFilter.label')}
          className="shrink-0"
          options={OWNER_OPTIONS.map((value) => ({ value, label: t(`ownerFilter.${value}`) }))}
          value={owner ?? 'all'}
          onChange={setOwner}
        />

        <Popover>
          <PopoverTrigger
            className={buttonVariants({
              variant: filterCount > 0 ? 'neutral' : 'neutralGhost',
              className: 'shrink-0',
            })}
          >
            <Icon name="filter" />
            {t('filters')}
            {filterCount > 0 && (
              <span
                className="ms-1 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-caption font-semibold text-primary-foreground tabular-nums"
                dir="ltr"
              >
                {filterCount}
              </span>
            )}
          </PopoverTrigger>

          <PopoverContent side="bottom" align="end" sideOffset={6} className="w-72 p-4">
            <PopoverTitle className="text-label font-semibold">{t('filters')}</PopoverTitle>

            {/* Practical qualities (multi-select, AND) plus the computed high-protein. */}
            <div className="mt-3 flex flex-wrap gap-2">
              {DISH_TAGS.map((tag: DishTag) => (
                <FilterChip key={tag} active={tags.includes(tag)} onClick={() => toggleTag(tag)}>
                  {t(`tags.${tag}`)}
                </FilterChip>
              ))}
              <FilterChip active={highProtein} onClick={() => navigate({ hp: highProtein ? '' : '1' })}>
                {t('nutritionFilters.high_protein')}
              </FilterChip>
            </div>

            {/* "Show hidden" is administrative — quiet, and out of the main filter run
                (spec §5). */}
            <button
              type="button"
              aria-pressed={showHidden}
              onClick={() => navigate({ hidden: showHidden ? '' : '1' })}
              className={cn(
                'mt-4 flex w-full items-center gap-2 border-t border-border pt-3 text-body-sm transition-colors',
                showHidden ? 'font-medium text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon name={showHidden ? 'eye' : 'eyeOff'} className="size-4" />
              {t('showHidden')}
              {showHidden && <Icon name="check" className="ms-auto size-4" />}
            </button>

            {filterCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-3 w-full"
                onClick={() => navigate({ tags: '', hp: '', hidden: '' })}
              >
                {t('filtersReset')}
              </Button>
            )}
          </PopoverContent>
        </Popover>

        {anyActive && (
          <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={resetAll}>
            {t('clearFilters')}
          </Button>
        )}
      </div>

      {/* Row 2: meal tabs — a single choice out of five, "all" included. Scrolls on
          narrow screens rather than wrapping into two ambiguous rows. */}
      <div className="no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1">
        <MealTab active={!mealType} onClick={() => navigate({ mealType: '' })}>
          {t('allMealTypes')}
        </MealTab>
        {MEAL_TAB_ORDER.map((type) => (
          <MealTab
            key={type}
            active={mealType === type}
            onClick={() => navigate({ mealType: mealType === type ? '' : type })}
          >
            {t(`mealTypes.${type}`)}
          </MealTab>
        ))}
      </div>
    </div>
  );
}

/** One meal-category tab: a single-select pill that toggles the meal filter. */
function MealTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-9 shrink-0 items-center rounded-full border px-4 text-body-sm font-medium transition-colors',
        active
          ? 'border-transparent bg-secondary font-semibold text-primary'
          : 'border-transparent text-muted-foreground hover:bg-secondary/60',
      )}
    >
      {children}
    </button>
  );
}

/** A practical-quality chip inside the Filters popover. */
function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-9 items-center rounded-full border px-3 text-body-sm font-medium transition-colors',
        active
          ? 'border-transparent bg-secondary font-semibold text-primary'
          : 'border-input text-muted-foreground hover:border-(--input-hover) hover:bg-secondary/60',
      )}
    >
      {children}
    </button>
  );
}
