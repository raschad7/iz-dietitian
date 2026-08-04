'use client';

import { useMemo, useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { useDraggable } from '@dnd-kit/core';
import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { membersOf } from '@/lib/enum';
import { cn } from '@/lib/utils';

import { roundForDisplay } from '@/features/weekly-plans/nutrition';

import type { CatalogEntry } from '../queries';
import { ALLERGENS, DISH_TAGS, mealTypeForSlot } from '../schema';
import { bestServings } from '../similar';
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
 * you know exists, finding nothing, and concluding the catalog is broken.
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
  const [tag, setTag] = useState<string | null>(null);
  const [allMealTypes, setAllMealTypes] = useState(false);

  const mealType = slot ? mealTypeForSlot(slot.slotKey) : null;

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const matches = catalog.filter((dish) => {
      if (needle) {
        const haystack = `${dish.nameAr} ${dish.nameEn} ${dish.slug}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }

      if (tag && !dish.tags.includes(tag)) return false;
      if (mealType && !allMealTypes && !dish.mealTypes.includes(mealType)) return false;

      return true;
    });

    // With a slot open, nearest-to-budget first: the top of the list becomes the
    // answer rather than the alphabet.
    if (!slot || slot.budgetKcal <= 0) return matches;

    return [...matches].sort((a, b) => {
      const fit = (dish: CatalogEntry) =>
        Math.abs((bestServings(dish.baseKcal, slot.budgetKcal) ?? 1) * dish.baseKcal - slot.budgetKcal);

      return fit(a) - fit(b);
    });
  }, [catalog, query, tag, mealType, allMealTypes, slot]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="relative shrink-0 border-b border-border pb-3">
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('searchDishes')}
        />

        <div className="mt-2 flex gap-2">
          {mealType && (
            <button
              type="button"
              aria-pressed={!allMealTypes}
              onClick={() => setAllMealTypes((value) => !value)}
              className="min-h-10 flex-1 rounded-md border border-border px-3 text-start text-label text-muted-foreground hover:bg-accent"
            >
              {!allMealTypes ? t(`mealTypes.${mealType}`) : t('allMealTypes')}
            </button>
          )}

          <Popover.Root>
            <Popover.Trigger
              className={buttonVariants({ variant: 'outline', size: 'sm', className: 'px-3 text-label' })}
            >
              <Icon name="filter" />
              {t('dishFilters')}
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
                <Popover.Popup className="w-72 origin-(--transform-origin) rounded-lg rounded-ee-4xl border border-border bg-popover p-3 text-popover-foreground shadow-overlay transition-[transform,opacity] duration-150 ease-[cubic-bezier(.2,.6,.2,1)] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
                  <Popover.Title className="pb-2 text-label font-semibold">{t('dishFilters')}</Popover.Title>
                  <div className="flex flex-wrap gap-1.5">
                    {DISH_TAGS.map((entry) => (
                      <FilterChip
                        key={entry}
                        active={tag === entry}
                        onClick={() => setTag((current) => (current === entry ? null : entry))}
                      >
                        {t(`tags.${entry}`)}
                      </FilterChip>
                    ))}
                  </div>
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </Popover.Root>
        </div>

        {slot && slot.budgetKcal > 0 && (
          <div className="mt-2 flex items-center justify-between gap-2 text-caption">
            <strong className="text-primary">{t('bestMatches', { value: slot.budgetKcal })}</strong>
            <span className="text-muted-foreground">{shown.length}</span>
          </div>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="text-body-sm text-muted-foreground">{t('noDishes')}</p>
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
        /* 40px, the system's floor for anything you can press. It was 24px,
           which fitted more chips into the rail by making each of them a worse
           target — and below `xl` this panel is a bottom sheet, so it is being
           pressed with a thumb. Wrapping onto a third row is the cost. */
        'inline-flex min-h-9 items-center rounded-md border px-2.5 py-1 text-caption transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border text-muted-foreground hover:bg-accent',
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
