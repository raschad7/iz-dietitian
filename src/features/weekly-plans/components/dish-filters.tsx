'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { usePathname, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { type OwnerFilter } from '@/features/weekly-plans/catalog-ownership';
import { proteinDotClasses, proteinMessageKey } from '@/features/weekly-plans/meal-tag-tone';
import { PROTEIN_SOURCES } from '@/features/weekly-plans/dish-composition';
import {
  DISH_AXES,
  MEAL_TYPES,
  type DishAxisFilters,
  type DishAxisKey,
  type MealType,
} from '@/features/weekly-plans/schema';

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

/** The one computed quality, which leads the qualities run everywhere it appears. */
const HIGH_PROTEIN = 'high_protein';

/**
 * The catalog's toolbar: search, and one control per thing you can filter by.
 *
 * ## Why a control per facet, and not one Filters panel
 *
 * This was a single **Filters** popover holding every choice in the product —
 * meal category, ownership, qualities and the hidden shelf — stacked into one
 * scrolling column about 570px tall. Three different layouts (a full-width
 * button over a 2×2 grid, a three-column grid, and a searchable scrolling
 * window) in a 368px box, and the only way to learn what was currently narrowing
 * the list was to open it and read all four sections. It was long because it was
 * carrying four unrelated questions at once, and disorganised because each of
 * them had earned its own shape.
 *
 * The pattern this now follows is the one both HashiCorp's Helios and Pencil &
 * Paper's analysis of enterprise filtering land on for tabular data: a **filter
 * bar of per-parameter dropdowns**, each holding the values for its own
 * parameter, with the applied state shown on the control itself. What that buys
 * here:
 *
 * - **Each panel is short by construction.** Meal category is five rows; the
 *   source is three. Neither can ever be long, because neither can hold anything
 *   but its own values.
 * - **One shape, four times.** Every panel is the same menu of rows — a glyph, a
 *   label, a tick when it is on — instead of four bespoke layouts.
 * - **The bar answers "what is narrowing this list" without being opened.** A
 *   facet that is doing something is filled and shows *its value*: not "Meal
 *   time" but "Breakfast", under breakfast's own icon. Pencil & Paper call this
 *   layered redundancy — state preserved in its original context, and marked on
 *   the control that owns it.
 * - **Qualities scale on their own.** The one growing list has a whole panel to
 *   grow inside, with a search field over it, and nothing else moves when it
 *   does.
 *
 * ## Nothing here can shift the table
 *
 * The applied filters used to appear as chips on a second row that mounted the
 * moment you pressed your first one, which pushed the table down by a row just
 * as you were about to read it — the thing you were filtering moved because you
 * filtered it.
 *
 * There is no second row now. The bar is a **single fixed 40px row**, and every
 * change a filter makes to it is horizontal: a trigger's label swaps to its
 * value, a badge appears inside a button that was already there, and the flexible
 * spacer between the facets and the page's primary action absorbs the
 * difference. The table below never moves.
 *
 * That is also why the applied-filter chips are gone rather than relocated. They
 * were the third layer of the redundancy above, and they were the layer that
 * cost a layout shift to keep; the two cheaper layers — value-on-the-trigger and
 * tick-in-the-panel — say the same thing for free.
 *
 * Everything round-trips through the URL, so a filtered catalog stays shareable
 * and the server query that owns pagination reads it back.
 */
export function DishFilters({
  q,
  mealType,
  axes,
  highProtein,
  proteinSources,
  owner,
  showHidden,
  children,
}: {
  q: string | undefined;
  mealType: string | undefined;
  axes: DishAxisFilters;
  highProtein: boolean;
  /** The protein sources currently selected — OR within the list, empty for all. */
  proteinSources: readonly string[];
  owner: OwnerFilter | undefined;
  /** Showing the hidden shelf *instead of* the catalog — see `listDishes`. */
  showHidden: boolean;
  /**
   * The page's primary action, pinned to the end of the row.
   *
   * A slot rather than an import, because the toolbar owns the row's geometry
   * and nothing else should be allowed to change it — whatever lands here is
   * `shrink-0` past the spacer, inside the same fixed height.
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

  function toggleAxis(key: DishAxisKey, value: string) {
    const selected = axes[key];
    const next = selected.includes(value)
      ? selected.filter((entry) => entry !== value)
      : [...selected, value];

    navigate({ [key]: next.join(',') });
  }

  function toggleProtein(value: string) {
    const next = proteinSources.includes(value)
      ? proteinSources.filter((entry) => entry !== value)
      : [...proteinSources, value];

    navigate({ protein: next.join(',') });
  }

  const activeMealType = MEAL_TAB_ORDER.find((type) => type === mealType) ?? null;
  const axisCount = DISH_AXES.reduce((total, { key }) => total + axes[key].length, 0);
  const qualityCount = axisCount + (highProtein ? 1 : 0);

  // What the Clear control is allowed to act on. The search term is deliberately
  // not in it — see that button.
  const filterCount =
    qualityCount +
    proteinSources.length +
    (showHidden ? 1 : 0) +
    (activeMealType ? 1 : 0) +
    (owner ? 1 : 0);

  return (
    /*
      One row, one fixed height, and nothing a filter does can change either.

      `h-12`, and it is a correction: this said `h-10` while `Input` is a fixed
      48px and the page's primary action is a default-size `Button`, so two of
      the row's own children had been overflowing their 40px box the whole time.
      The row now states the height it actually is, and every control in it is
      the same 48 — the field sets that number and nothing else here gets to
      disagree with it.

      The field shrinks, the spacer eats what is left, and everything between
      them keeps its own width. A facet that turns on gets *wider* — its label
      becomes its value — and the spacer pays for it.

      ## Why the words come and go on a *container* query

      Four labelled facets, a field and the page's primary action need about
      1100px of row. This row is not the viewport: the dishes page sits inside
      the app shell behind a nav rail, so a 1280px window gives it around 1100
      and a 1024px one gives it far less — and on a viewport query the labels
      would still be showing at the width where they stop fitting, squeezing the
      search field toward its 96px floor. `@container` asks the question that
      actually matters, which is how much room *this row* has, and it is the tool
      the planner board already uses for the same reason.
    */
    <div
      data-guide="dishes-filters"
      className="@container/toolbar flex h-12 shrink-0 items-center gap-2"
    >
      {/* `Input` renders a wrapper when it has an icon, so flex sizing belongs
          on this visible flex item rather than on the nested input element. */}
      <div className="w-full max-w-sm min-w-24 shrink">
        <Input
          name="q"
          type="search"
          icon="search"
          value={term}
          onChange={(event) => handleSearch(event.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
        />
      </div>

      {/*
        Meal category. The trigger carries the *selected meal's* own glyph and
        name, so this reads "Breakfast" rather than "Meal time: 1" — the same
        icon the table's meal column and the planner's card use for it.
      */}
      <FacetPopover
        icon={activeMealType ? MEAL_ICON[activeMealType] : 'clock'}
        facetLabel={t('columns.mealTypes')}
        valueLabel={activeMealType ? t(`mealTypes.${activeMealType}`) : null}
      >
        <ChoiceList label={t('columns.mealTypes')}>
          <ChoiceRow
            selected={!activeMealType}
            onSelect={() => navigate({ mealType: '' })}
            label={t('allMealTypes')}
          />
          {MEAL_TAB_ORDER.map((type) => (
            <ChoiceRow
              key={type}
              selected={activeMealType === type}
              onSelect={() => navigate({ mealType: activeMealType === type ? '' : type })}
              icon={MEAL_ICON[type]}
              label={t(`mealTypes.${type}`)}
            />
          ))}
        </ChoiceList>
      </FacetPopover>

      {/*
        Protein source — the one facet that is *computed*, and the one the
        colours mean.

        It sits second because it is the question a dietitian actually asks of a
        catalog ("what else could I put here that is not chicken"), and because
        it is the only filter whose answer is already visible on every row as a
        dot. Multi-select, since "fish or legumes" is one question with two
        acceptable answers.
      */}
      <FacetPopover
        icon="mealLunch"
        facetLabel={t('proteinFilter.label')}
        valueLabel={
          proteinSources.length === 1 ? t(proteinMessageKey(proteinSources[0] ?? '')) : null
        }
        count={proteinSources.length > 1 ? proteinSources.length : undefined}
      >
        <ChoiceList label={t('proteinFilter.label')} role="group">
          {PROTEIN_SOURCES.map((value) => (
            <ChoiceRow
              key={value}
              role="checkbox"
              selected={proteinSources.includes(value)}
              onSelect={() => toggleProtein(value)}
              dot={proteinDotClasses(value)}
              label={t(proteinMessageKey(value))}
            />
          ))}
        </ChoiceList>
      </FacetPopover>

      {/* Where the dish came from: the shared library, or this clinic. */}
      <FacetPopover
        icon="person"
        facetLabel={t('ownerFilter.label')}
        valueLabel={owner ? t(`ownerFilter.${owner}`) : null}
      >
        <ChoiceList label={t('ownerFilter.label')}>
          {OWNER_OPTIONS.map((value) => (
            <ChoiceRow
              key={value}
              selected={(owner ?? 'all') === value}
              onSelect={() => navigate({ owner: value === 'all' ? '' : value })}
              label={t(`ownerFilter.${value}`)}
            />
          ))}
        </ChoiceList>
      </FacetPopover>

      {/*
        Qualities. The only multi-select, so the trigger keeps the facet's name
        and counts instead of naming a value — "Qualities 3" is readable where
        "Quick, Economical, Vegetarian" is not.
      */}
      <FacetPopover icon="leaf" facetLabel={t('columns.properties')} count={qualityCount}>
        <QualityPicker
          axes={axes}
          highProtein={highProtein}
          count={qualityCount}
          onToggleAxis={toggleAxis}
          onToggleHighProtein={() => navigate({ hp: highProtein ? '' : '1' })}
          onClear={() =>
            navigate({ source: '', effort: '', cost: '', occasion: '', hp: '' })
          }
        />
      </FacetPopover>

      {/*
        The hidden shelf. A button rather than a fourth dropdown, because it is
        not a facet with values to pick from — it swaps the catalog for a
        different list, and it is on or it is off.
      */}
      <Button
        type="button"
        variant={showHidden ? 'neutral' : 'neutralGhost'}
        className="shrink-0 px-3"
        aria-pressed={showHidden}
        aria-label={t('showHidden')}
        title={t('showHiddenHint')}
        onClick={() => navigate({ hidden: showHidden ? '' : '1' })}
      >
        <Icon name="eyeOff" />
        <span className="hidden truncate @5xl/toolbar:inline">{t('showHidden')}</span>
      </Button>

      {/*
        Clear, always rendered and disabled when there is nothing to clear.

        Mounting it with the first filter would make the row's contents jump
        sideways under a pointer that was still moving in it — the horizontal
        version of the shift this whole row exists to avoid. Dim-to-live is a
        state change; appearing is a layout change.

        It clears the *filters* and leaves the search term alone, which is what
        its label says. The field has its own native clear for the other half.
      */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="shrink-0"
        aria-label={t('clearFilters')}
        title={t('clearFilters')}
        disabled={filterCount === 0}
        onClick={() =>
          navigate({
            mealType: '',
            owner: '',
            source: '',
            effort: '',
            cost: '',
            occasion: '',
            hp: '',
            protein: '',
            hidden: '',
          })
        }
      >
        <Icon name="close" />
      </Button>

      {/* The slack. An empty flex item rather than an auto margin on the action,
          so the facets keep their natural widths and only this box changes. */}
      <div aria-hidden className="min-w-0 flex-1" />

      {children}
    </div>
  );
}

/**
 * One parameter's dropdown.
 *
 * The trigger is the whole of this component's job: it names the facet while the
 * facet is off, and names the **chosen value** once it is on, so the bar reads as
 * a sentence about the list underneath it. Multi-select facets have no single
 * value to name and pass `count` instead.
 *
 * The label stands down when the toolbar is under 64rem, leaving the glyph, the
 * badge and the fill — which still say *that* a control is doing something, if
 * not what. `title` carries the full "facet: value" at every width, so a pointer
 * can always ask. See the row's own note for why this is a container query.
 */
function FacetPopover({
  icon,
  facetLabel,
  valueLabel,
  count,
  children,
}: {
  icon: IconName;
  /** The parameter's name — shown while nothing is chosen, and to a screen reader always. */
  facetLabel: string;
  /** The chosen value, for single-select facets. */
  valueLabel?: string | null;
  /** How many values are chosen, for multi-select facets. */
  count?: number;
  children: React.ReactNode;
}) {
  const active = Boolean(valueLabel) || Boolean(count);

  return (
    <Popover>
      <PopoverTrigger
        // Named for assistive tech regardless of the viewport, since the visible
        // word stands down on a phone and can be a value rather than the name.
        aria-label={valueLabel ? `${facetLabel}: ${valueLabel}` : facetLabel}
        title={valueLabel ? `${facetLabel}: ${valueLabel}` : facetLabel}
        /*
          ⚠ `cn()` around `buttonVariants`, not `buttonVariants({ className })`.

          cva *concatenates* its `className` rather than merging it, so `px-3`
          and the variant's own `px-5` both survived into the class list and the
          cascade picked the later one — which is `px-5`, because Tailwind emits
          padding utilities in ascending order. The override silently did
          nothing. `cn()` is tailwind-merge, which drops the loser before it ever
          reaches the DOM. `Button` does this internally; a raw `buttonVariants`
          call at a trigger has to do it itself.

          The tightening is worth having: a row of four of these plus a field and
          the page's action cannot afford 20px of air on both sides of every one
          of them.
        */
        className={cn(
          buttonVariants({ variant: active ? 'neutral' : 'neutralGhost' }),
          'shrink-0 px-3',
        )}
      >
        <Icon name={icon} />
        <span className="hidden max-w-32 truncate @5xl/toolbar:inline">
          {valueLabel ?? facetLabel}
        </span>
        {count ? (
          <span
            className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-caption font-semibold text-primary-foreground tabular-nums"
            dir="ltr"
          >
            {count}
          </span>
        ) : null}
        <Icon name="chevronDown" className="hidden size-3.5 opacity-60 @5xl/toolbar:inline-block" />
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={8}
        /*
          A menu, so it is sized like one: as wide as its rows need and no wider,
          as tall as its content up to a cap it will not reach unless the list
          behind it has grown. `overflow-hidden` replaces the base popup's
          `overflow-x-hidden overflow-y-auto` — see `PopoverContent`'s note on
          that merge — because what scrolls in here, if anything does, is the
          list inside `QualityPicker` rather than the panel around it.
        */
        className="flex max-h-[min(28rem,calc(var(--q-viewport-block)-4rem))] w-[min(15rem,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** The rows of a single-select facet. */
function ChoiceList({
  label,
  role = 'radiogroup',
  children,
}: {
  label: string;
  /**
   * `radiogroup` for a facet with one answer, `group` for one with several.
   *
   * The rows already carry `radio` or `checkbox` themselves; this keeps the
   * container honest about which, because a `radiogroup` full of checkboxes is
   * announced as a set of mutually exclusive options that are not.
   */
  role?: 'radiogroup' | 'group';
  children: React.ReactNode;
}) {
  return (
    <div role={role} aria-label={label} className="flex flex-col gap-0.5 p-1.5">
      {children}
    </div>
  );
}

/**
 * One row in a facet's menu.
 *
 * A menu row, not a bordered pill: no outline, no fill until the pointer is on
 * it, and the tick at the end is what says it is chosen. The bordered grids this
 * replaced had to draw a box around every option so the selected one could be
 * told apart by its fill, which is a lot of ink for a list of five words — and
 * it is why the old panel needed 140px to offer four meals.
 */
function ChoiceRow({
  selected,
  onSelect,
  icon,
  label,
  role = 'radio',
  dot,
}: {
  selected: boolean;
  onSelect: () => void;
  icon?: IconName;
  label: string;
  /** `radio` for a single-select facet, `checkbox` for a multi-select one. */
  role?: 'radio' | 'checkbox';
  /** A quality's colour, in place of a glyph — the legend the table also uses. */
  dot?: string;
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-start text-body-sm transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-focus-halo',
        selected ? 'font-semibold text-primary' : 'text-foreground hover:bg-accent/40',
      )}
    >
      {dot ? (
        <span aria-hidden className={cn('shrink-0', dot)} />
      ) : icon ? (
        <Icon name={icon} className="size-4 shrink-0 text-muted-foreground" />
      ) : (
        // Keeps the labels of an iconless row on the same left edge as the rows
        // that have one, so the column of words stays straight.
        <span aria-hidden className="size-4 shrink-0" />
      )}
      <span className="truncate">{label}</span>
      {selected && <Icon name="check" className="ms-auto size-4 shrink-0" />}
    </button>
  );
}

/**
 * The qualities facet: a searchable checklist.
 *
 * This is the one parameter whose values are expected to keep multiplying, and
 * the only reason the old single panel needed a scrolling window with half a row
 * showing at its edge. Given a panel of its own it does not need one: nine
 * qualities fit whole, and the field above the list is what keeps the fiftieth
 * findable. The list scrolls only once there is more of it than the panel's cap.
 */
function QualityPicker({
  axes,
  highProtein,
  count,
  onToggleAxis,
  onToggleHighProtein,
  onClear,
}: {
  axes: DishAxisFilters;
  highProtein: boolean;
  count: number;
  onToggleAxis: (key: DishAxisKey, value: string) => void;
  onToggleHighProtein: () => void;
  onClear: () => void;
}) {
  const t = useTranslations('dishes');
  const [query, setQuery] = useState('');

  /**
   * The qualities, as one list with the computed one at its head.
   *
   * `high_protein` is derived from the recipe rather than typed by anyone — the
   * filter resolves it against `nutritionCategory()`, so it can never disagree
   * with a dish's own numbers — but to the person filtering it is one more
   * quality a dish either has or does not, and a section of its own would buy a
   * heading to say something only the database cares about.
   */
  const qualities = useMemo(
    () => [
      {
        key: HIGH_PROTEIN,
        axis: null as DishAxisKey | null,
        value: null as string | null,
        label: t('nutritionFilters.high_protein'),
      },
      ...DISH_AXES.flatMap((axis) =>
        axis.values.map(({ value, message }) => ({
          key: `${axis.key}:${value}`,
          axis: axis.key,
          value,
          label: t(message),
        })),
      ),
    ],
    [t],
  );

  const needle = query.trim().toLocaleLowerCase();
  const shown = needle
    ? qualities.filter((quality) => quality.label.toLocaleLowerCase().includes(needle))
    : qualities;

  return (
    <>
      <div className="shrink-0 p-1.5 pb-0">
        <Input
          name="qualityQuery"
          type="search"
          icon="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('tagSearchPlaceholder')}
          aria-label={t('tagSearchPlaceholder')}
        />
      </div>

      {shown.length === 0 ? (
        <p className="px-3.5 py-4 text-body-sm text-muted-foreground">{t('noTagMatches')}</p>
      ) : (
        <div
          role="group"
          aria-label={t('columns.properties')}
          className="q-scroll-cue-y flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain p-1.5 [--scroll-cue-surface:var(--popover)]"
        >
          {shown.map((quality) => (
            <ChoiceRow
              key={quality.key}
              role="checkbox"
              label={quality.label}
              selected={
                quality.key === HIGH_PROTEIN
                  ? highProtein
                  : Boolean(quality.axis && axes[quality.axis].includes(quality.value ?? ''))
              }
              onSelect={() =>
                quality.key === HIGH_PROTEIN || !quality.axis
                  ? onToggleHighProtein()
                  : onToggleAxis(quality.axis, quality.value ?? '')
              }
            />
          ))}
        </div>
      )}

      {/* Always rendered, disabled when empty — a panel that grows a footer as
          you tick things is a panel that moves while you are ticking. */}
      <div className="shrink-0 border-t border-border p-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full"
          disabled={count === 0}
          onClick={onClear}
        >
          {t('filtersReset')}
        </Button>
      </div>
    </>
  );
}
