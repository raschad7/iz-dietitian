'use client';

import { useMemo, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
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
    <div className="flex h-full min-h-0 flex-col gap-2">
      <Input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('searchDishes')}
        className="h-8 text-xs"
      />

      <div className="flex flex-wrap gap-1">
        {mealType && (
          <FilterChip active={!allMealTypes} onClick={() => setAllMealTypes((value) => !value)}>
            {t(`mealTypes.${mealType}`)}
          </FilterChip>
        )}

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

      {slot && slot.budgetKcal > 0 && (
        <p className="text-[10px] text-muted-foreground">
          {t('fitsSlot', { value: slot.budgetKcal })}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('noDishes')}</p>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {shown.map((dish) => (
            <li key={dish.id}>
              <CatalogRow
                dish={dish}
                usage={usage[dish.id]}
                servings={slot ? (bestServings(dish.baseKcal, slot.budgetKcal) ?? 1) : 1}
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
        'rounded-full border px-2 py-0.5 text-[10px] transition-colors',
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
  draggable,
}: {
  dish: CatalogEntry;
  usage: RecentUse | undefined;
  servings: number;
  draggable: boolean;
}) {
  const t = useTranslations('weeklyPlans');

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `dish:${dish.id}`,
    disabled: !draggable,
    data: { kind: 'dish', dish, servings },
  });

  const blocked = dish.blockedBy.length > 0;

  return (
    <div
      ref={setNodeRef}
      {...(draggable ? listeners : {})}
      {...(draggable ? attributes : {})}
      className={cn(
        'w-full rounded-md border p-1.5 text-start text-xs',
        blocked
          ? 'border-destructive/40 bg-destructive/5 text-muted-foreground'
          : 'border-border bg-background',
        draggable && 'cursor-grab hover:bg-accent/60',
        isDragging && 'opacity-40',
      )}
    >
      <span className="flex items-baseline gap-1.5">
        <span className="min-w-0 flex-1 truncate font-medium">{dish.nameAr}</span>

        {usage && (
          <Badge variant="outline" className="shrink-0 text-[9px]">
            {usage.weeksAgo === 0 ? t('usedThisWeek') : t('usedWeeksAgo', { count: usage.weeksAgo })}
          </Badge>
        )}
      </span>

      <span className="mt-0.5 block text-[10px] text-muted-foreground">
        {blocked ? (
          <span className="text-destructive">
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
            {t('portionShort', { servings })} ·{' '}
            {t('kcalValue', { value: roundForDisplay('kcal', dish.baseKcal * servings) })}
          </>
        )}
      </span>
    </div>
  );
}
