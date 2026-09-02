'use client';

import { useContext, useMemo, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { useLocale, useTranslations } from 'next-intl';

import { Button, buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { membersOf } from '@/lib/enum';
import { cn } from '@/lib/utils';

import {
  dishGrams,
  roundForDisplay,
  roundGrams,
  type NutritionCategory,
} from '@/features/weekly-plans/nutrition';

import {
  availableOptions as optionsFor,
  CATALOG_OPTIONS,
  filterCatalog,
  type CatalogContext,
  type CatalogOption,
} from '../catalog-filter';
import { localizedName } from '../food-display';
import type { CatalogEntry } from '../queries';
import {
  ALLERGENS,
  DISH_AXES,
  EMPTY_AXIS_FILTERS,
  isFixedPortion,
  mealTypeForSlot,
  type DishAxisFilters,
  type DishAxisKey,
} from '../schema';

import { EditorActionsContext } from './board-dnd';

/**
 * The computed nutrition categories offered as filters. Only "high protein" for
 * now — the one nutrition question a dietitian filters on — and it matches the
 * recipe-derived `nutritionCategory`, never a manual tag.
 */
const NUTRITION_FILTERS = ['high_protein'] as const satisfies readonly NutritionCategory[];

/** The narrow union of categories actually offered as filters — so message keys
 * like `nutritionFilters.${entry}` stay resolvable. */
type NutritionFilter = (typeof NUTRITION_FILTERS)[number];
import { dishDotClasses, proteinMessageKey } from '../meal-tag-tone';
import { proteinSource } from '../dish-composition';
import { chooseServings } from '../portioning';
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
  catalog: wholeCatalog,
  usage,
  slot,
  editable,
  onPick,
}: {
  catalog: readonly CatalogEntry[];
  /** How recently this client had each dish, keyed by dish id. */
  usage: Record<string, RecentUse>;
  /** The open meal, if there is one. Drives the default filter and the portions. */
  slot: { slotKey: string; budgetKcal: number } | null;
  editable: boolean;
  /**
   * Given, the rows become buttons that fill a known slot instead of drag
   * sources.
   *
   * Which is what the catalog is when it lives *inside* the meal inspector: the
   * slot is already chosen, the panel is modal, and there is nowhere to drag to.
   * In the drawer it stays absent and the rows stay draggable, because there the
   * dietitian is choosing the slot as well as the dish.
   */
  onPick?: (dish: CatalogEntry, servings: number) => void;
}) {
  const t = useTranslations('weeklyPlans');
  const [query, setQuery] = useState('');
  // One selection per axis, several axes at once: the panel has to be able to
  // answer "something from the street that is also cheap", and under the old tag
  // bag every extra chip could only ever return fewer rows.
  const [axes, setAxes] = useState<DishAxisFilters>(EMPTY_AXIS_FILTERS);
  const [nutrition, setNutrition] = useState<readonly NutritionFilter[]>([]);
  const [options, setOptions] = useState<readonly CatalogOption[]>([]);
  const [allMealTypes, setAllMealTypes] = useState(false);

  const mealType = slot ? mealTypeForSlot(slot.slotKey) : null;
  const activeMealType = mealType && !allMealTypes ? mealType : null;
  const needle = query.trim().toLowerCase();
  const budgetKcal = slot && slot.budgetKcal > 0 ? slot.budgetKcal : null;

  /**
   * Mains only. A side is not something you fill a slot with.
   *
   * صحن سلطة is a dish row like any other in the database, and this list is
   * "what could go here" — so without the filter the drawer offered a plate of
   * salad as somebody's dinner, and dropping one would have made it the meal
   * rather than an accompaniment to it. The same rule `toPromptCatalog` applies
   * to the model, applied to the human.
   *
   * Sides are chosen in the meal panel instead, beside the meal they stand next
   * to — see `MealSides`.
   */
  const catalog = useMemo(() => wholeCatalog.filter((dish) => !dish.isSide), [wholeCatalog]);

  const context = useMemo<CatalogContext>(() => ({ usage, budgetKcal }), [usage, budgetKcal]);

  const availableOptions = useMemo(() => optionsFor(catalog, context), [catalog, context]);

  const shown = useMemo(() => {
    const matches = filterCatalog(
      catalog,
      { needle, mealType: activeMealType, axes, nutrition, options },
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
  }, [catalog, needle, activeMealType, axes, nutrition, options, context, budgetKcal]);

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
    const base = { needle, mealType: activeMealType, axes, nutrition, options };

    for (const { key, values } of DISH_AXES) {
      for (const { value } of values) {
        const selected = axes[key];
        const next = selected.includes(value) ? selected : [...selected, value];
        byChip[`${key}:${value}`] = filterCatalog(
          catalog,
          { ...base, axes: { ...axes, [key]: next } },
          context,
        ).length;
      }
    }

    for (const entry of NUTRITION_FILTERS) {
      const next = nutrition.includes(entry) ? nutrition : [...nutrition, entry];
      byChip[entry] = filterCatalog(catalog, { ...base, nutrition: next }, context).length;
    }

    for (const entry of CATALOG_OPTIONS) {
      const next = options.includes(entry) ? options : [...options, entry];
      byChip[entry] = filterCatalog(catalog, { ...base, options: next }, context).length;
    }

    return byChip;
  }, [catalog, needle, activeMealType, axes, nutrition, options, context]);

  const axisCount = DISH_AXES.reduce((total, { key }) => total + axes[key].length, 0);
  const activeCount = axisCount + nutrition.length + options.length + (activeMealType ? 1 : 0);

  function toggleAxis(key: DishAxisKey, value: string): void {
    setAxes((current) => {
      const selected = current[key];

      return {
        ...current,
        [key]: selected.includes(value)
          ? selected.filter((one) => one !== value)
          : [...selected, value],
      };
    });
  }

  function clearFilters(): void {
    setAxes(EMPTY_AXIS_FILTERS);
    setNutrition([]);
    setOptions([]);
    setAllMealTypes(true);
  }

  function toggleNutrition(entry: NutritionFilter): void {
    setNutrition((current) =>
      current.includes(entry) ? current.filter((value) => value !== entry) : [...current, entry],
    );
  }

  function toggleOption(entry: CatalogOption): void {
    setOptions((current) =>
      current.includes(entry) ? current.filter((value) => value !== entry) : [...current, entry],
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="relative shrink-0 border-b border-border pb-3">
        {/*
          Search and the filter trigger share a line.

          They are one question — "which dishes" — asked two ways, and stacking
          them spent a whole band of the panel on a single button sitting alone
          under a full-width field. Side by side the field still takes
          everything left over (`min-w-0` + `flex-1`, so a long placeholder
          cannot push the button off the end), and the row below is free to hold
          nothing at all when no filter is on.
        */}
        <div className="flex items-center gap-2">
          <Input
            type="search"
            icon="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('searchDishes')}
            className="min-w-0 flex-1"
          />

          <Popover>
            <PopoverTrigger
              className={buttonVariants({
                variant: 'neutral',
                className: 'shrink-0 gap-1.5 px-4 text-label',
              })}
            >
              <Icon name="filter" />
              {t('dishFilters')}
              {/* The count rides the trigger as well as the chip row, because
                  the chips scroll away with the list on a short panel and this
                  row never moves. */}
              {activeCount > 0 && (
                <span
                  dir="ltr"
                  className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-caption font-semibold tabular-nums text-primary-foreground-white"
                >
                  {activeCount}
                </span>
              )}
            </PopoverTrigger>
            <PopoverContent
              side="bottom"
              align="end"
              sideOffset={6}
              className={cn(PLANNER_THEME, 'w-72 gap-0 p-3 shadow-overlay')}
            >
                  <PopoverTitle className="pb-2 text-label font-semibold">{t('dishFilters')}</PopoverTitle>

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

                  {/*
                    Tags and the computed high-protein label in one run, each
                    wearing its colour dot — the same grammar the standalone dish
                    catalog uses, so the panel a dietitian filters *inside* the
                    planner and the page they manage the catalog on are the same
                    control with the same legend.

                    High protein used to sit in a "nutrition" group of its own to
                    record that it is derived from the recipe rather than typed.
                    True, and not a distinction worth a section heading to the
                    person filtering: it is one more quality a dish has or does
                    not. The comment carries the fact; the UI does not need to.
                  */}
                  <FilterGroup label={t('filterTags')}>
                    {NUTRITION_FILTERS.map((entry) => {
                      const selected = nutrition.includes(entry);
                      const count = counts[entry] ?? 0;

                      return (
                        <FilterChip
                          key={entry}
                          active={selected}
                          disabled={!selected && count === 0}
                          onClick={() => toggleNutrition(entry)}
                        >
                          {t(`nutritionFilters.${entry}`)}
                          <ChipCount value={count} />
                        </FilterChip>
                      );
                    })}

                  </FilterGroup>

                  {/*
                    One group per axis, because they answer four different
                    questions and a single run of fifteen chips reads as fifteen
                    interchangeable switches.

                    No dots on any of them. A dot in the planner means the
                    dish's protein source and only that — it is on every row of
                    this rail, beside the name — so a second kind of dot in the
                    filter would teach the reader that a colour means "some
                    property", which is exactly what made the old tag palette
                    unreadable.
                  */}
                  {DISH_AXES.map((axis) => (
                    <FilterGroup key={axis.key} label={t(axis.label)}>
                      {axis.values.map(({ value, message }) => {
                        const selected = axes[axis.key].includes(value);
                        const count = counts[`${axis.key}:${value}`] ?? 0;

                        return (
                          <FilterChip
                            key={value}
                            active={selected}
                            disabled={!selected && count === 0}
                            onClick={() => toggleAxis(axis.key, value)}
                          >
                            {t(message)}
                            <ChipCount value={count} />
                          </FilterChip>
                        );
                      })}
                    </FilterGroup>
                  ))}
            </PopoverContent>
          </Popover>
        </div>

        {/*
          What is filtering the list stays *on* the panel, not behind the
          popover that set it. A closed popover with a filter still applied is
          a list that has quietly stopped showing you things, with the reason
          one click out of sight — and that is what made this feel broken.
          Every active filter is a chip here, and pressing a chip removes it.

          The row is rendered only when it has something to say. Empty, it was a
          margin above nothing, on the one panel in the app that would rather
          spend the space on another dish. `mealType` counts as something to
          say even when it is switched off: that chip is the only way back to
          filtering by meal type, so it stays on the row rather than becoming a
          filter you can turn off once and never find again.
        */}
        {(activeCount > 0 || mealType) && (
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

          {nutrition.map((entry) => (
            <FilterChip key={entry} active onClick={() => toggleNutrition(entry)}>
              {t(`nutritionFilters.${entry}`)}
              <Icon name="close" className="size-3.5" />
            </FilterChip>
          ))}

          {DISH_AXES.flatMap((axis) =>
            axis.values
              .filter(({ value }) => axes[axis.key].includes(value))
              .map(({ value, message }) => (
                <FilterChip
                  key={`${axis.key}:${value}`}
                  active
                  onClick={() => toggleAxis(axis.key, value)}
                >
                  {t(message)}
                  <Icon name="close" className="size-3.5" />
                </FilterChip>
              )),
          )}

          {options.map((entry) => (
            <FilterChip key={entry} active onClick={() => toggleOption(entry)}>
              {t(`dishOptions.${entry}`)}
              <Icon name="close" className="size-3.5" />
            </FilterChip>
          ))}

          {activeCount > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
              {t('clearFilters')}
            </Button>
          )}
        </div>
        )}

        {slot && slot.budgetKcal > 0 && (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-md bg-secondary/70 px-3 py-2 text-caption">
            <strong className="text-primary">{t('bestMatches', { value: slot.budgetKcal })}</strong>
            <span className="rounded-full bg-card px-2 py-0.5 font-semibold tabular-nums text-muted-foreground shadow-card">
              {shown.length}
            </span>
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
        /* No `no-scrollbar` here. This is the longest list in the planner and
           the drawer holding it shows no other sign that it continues, so the
           desktop rail is the cue — see "The desktop scrollbar" in
           globals.css. It costs nothing on a phone, where that rule does not
           apply and the bar stays hidden as before. */
        <ul className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pt-1">
          {shown.map((dish) => {
            // Same chooser the generator uses, so a dish placed by hand arrives at
            // the portion it would have arrived at had the model picked it.
            const servings = slot
              ? (chooseServings(dish.ingredients, slot.budgetKcal, {
                  wholeOnly: isFixedPortion(dish.source),
                }) ??
                bestServings(dish.baseKcal, slot.budgetKcal) ??
                1)
              : 1;
            const allowed = editable && dish.blockedBy.length === 0;

            return (
              <li key={dish.id} className="border-b border-border last:border-b-0">
                <CatalogRow
                  dish={dish}
                  usage={usage[dish.id]}
                  servings={servings}
                  budgetKcal={slot?.budgetKcal ?? null}
                  draggable={allowed && !onPick}
                  onPick={allowed && onPick ? () => onPick(dish, servings) : undefined}
                />
              </li>
            );
          })}
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
           target — and in the compact layout this panel is a sheet, so it is
           being pressed with a thumb. Wrapping onto a third row is the cost. */
        'inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 py-1 text-caption transition-colors',
        active
          ? 'border-transparent bg-secondary text-secondary-foreground hover:bg-primary-subtle'
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
  onPick,
}: {
  dish: CatalogEntry;
  usage: RecentUse | undefined;
  servings: number;
  budgetKcal: number | null;
  draggable: boolean;
  /** Given, the row is a button that fills the open slot. Never both. */
  onPick?: () => void;
}) {
  const t = useTranslations('weeklyPlans');
  const locale = useLocale();
  /*
    Read rather than required. This row is also the body of the catalog inside
    the meal inspector and of the drawer on a client with no plan yet, and
    neither of those is inside a `BoardEditor` — so `useEditorActions` would
    throw on two screens that never drag anything. Both are `onPick` lists, and
    a list that cannot be dragged has no hold to draw.
  */
  const editorActions = useContext(EditorActionsContext);
  const holding = editorActions?.holdingId === `dish:${dish.id}`;

  const kcal = roundForDisplay('kcal', dish.baseKcal * servings);

  // Declared before the hook because the payload carries `kcal` — the lifted
  // card shows the same figure this row does rather than deriving its own.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `dish:${dish.id}`,
    disabled: !draggable,
    data: { kind: 'dish', dish, servings, kcal },
  });

  const blocked = dish.blockedBy.length > 0;
  const delta = budgetKcal === null ? null : kcal - budgetKcal;
  const deltaLabel = delta === null ? null : `${delta > 0 ? '+' : ''}${delta}`;

  // One row, two ways to use it: a grab surface in the drawer, a real button in
  // the inspector. The shape is identical so the catalog is recognisably the
  // same list in both places; only the leading mark changes, because the gesture
  // it promises is what changed.
  const shape = cn(
    'my-1 grid min-h-[4.5rem] w-full grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-2.5 text-start transition-colors',
    draggable && 'planner-catalog-row cursor-grab hover:bg-accent/50',
    onPick && !blocked && 'cursor-pointer hover:bg-accent/50',
    blocked && 'bg-muted/50 opacity-70',
    isDragging && 'opacity-40',
    // The same arming the board's cards do, so a hold means one thing in the
    // planner rather than two. See `.planner-holding`.
    holding && 'planner-holding',
  );

  const body = (
    <>
      <Icon
        name={onPick ? 'add' : 'dragHandle'}
        className={cn('size-4 text-muted-foreground', onPick && !blocked && 'text-primary')}
      />
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate font-heading text-body-sm font-semibold" dir="auto">
            {localizedName(dish, locale)}
          </span>

          {/*
            Where this dish comes from, as one bare dot.

            The rail is too narrow for a labelled chip, and it does not need one:
            the same dot is labelled one click away in this panel's own filter
            popover, and it is the colour this dish will paint across the top of
            the card it becomes the moment it is dropped. That last part is the
            point — the mark is visible *before* the drop, on the row being
            dragged, so the board's rules stop being decoration the dietitian has
            to decode after the fact.

            One dot, not a run of them, because a dish has exactly one protein
            source and it is computed from the recipe. Under the tag bag this was
            up to three and the first one won, which meant the rail promised a
            colour the card sometimes did not paint.
          */}
          <span className="shrink-0" title={t(proteinMessageKey(proteinSource(dish.ingredients)))}>
            <span aria-hidden className={dishDotClasses(dish.ingredients)} />
          </span>
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
              <span className="tabular-nums">
                {t('totalGrams', { value: roundGrams(dishGrams(dish.ingredients, servings), 5) })}
              </span>
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
      <span className="flex flex-col items-end text-end tabular-nums" dir="ltr">
        <strong className="text-label">{kcal}</strong>
        <small className="text-caption font-normal text-muted-foreground">kcal</small>
      </span>
    </>
  );

  if (onPick) {
    return (
      <button
        type="button"
        onClick={onPick}
        // Shown and refused, not hidden: the same rule the list follows for a
        // dish the client is allergic to. `disabled` is the honest control state
        // and the row already says why.
        disabled={blocked}
        title={blocked ? undefined : t('addToSlot', { name: localizedName(dish, locale) })}
        className={cn(shape, 'outline-none focus-visible:bg-accent/60')}
      >
        {body}
      </button>
    );
  }

  return (
    /*
      Every listener on the row itself, unlike the board's cards.

      There the mouse's activator has to stay on a separate grip, because the
      card is a button and a drag beginning on it would compete with the click
      that opens the meal. A catalog row in the drawer is not a button — it has
      exactly one gesture and every pointer performs it — so the row is the
      handle for all of them, and only the *rule* differs: 6px of travel on a
      mouse, a press and hold on glass.

      Which is what fixes dragging a dish out on a tablet. The row carries
      `role="button"` from dnd-kit, so `touch-action: manipulation` applies to
      it and the finger can still scroll this list — and under the old single
      pointer sensor that was fatal, because "moved 6px" *was* the scroll. A
      hold takes nothing from the scroller and so needs nothing taken from it.
    */
    <div
      ref={setNodeRef}
      {...(draggable ? listeners : {})}
      {...(draggable ? attributes : {})}
      // The box this drag starts from — `onDragStart` in `board-dnd.tsx`
      // positions the lifted card from it. A meal card carries the same mark.
      data-drag-origin={draggable ? '' : undefined}
      aria-disabled={blocked || undefined}
      className={shape}
    >
      {body}
    </div>
  );
}
