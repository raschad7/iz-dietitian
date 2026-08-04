'use client';

import { useMemo, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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

      {/* The list is not alphabetical while a meal is open — it is ranked by how
          close each dish lands to that meal's budget. That was said in 10px
          helper text under the chips, which is to say it was not said. A stated
          header above the list is the list explaining its own order. */}
      {slot && slot.budgetKcal > 0 && (
        <p className="rounded-md bg-primary/5 px-3 py-2 text-caption text-muted-foreground">
          {t('sortedForSlot', { value: slot.budgetKcal })}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="text-body-sm text-muted-foreground">{t('noDishes')}</p>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
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
        /* 40px, the system's floor for anything you can press. It was 24px,
           which fitted more chips into the rail by making each of them a worse
           target — and below `xl` this panel is a bottom sheet, so it is being
           pressed with a thumb. Wrapping onto a third row is the cost. */
        'inline-flex min-h-10 items-center rounded-full border px-3 py-1 text-label transition-colors',
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
    /* A blocked dish is `archived`, not a red box: sunken, readable, plainly not
       live — which is exactly what it is. The allergen naming it stays clay,
       because that is the one thing on the row that is a medical fact.
       `interactive` gives the draggable rows the system's edge-thickening hover
       instead of a fill change; `cursor-grab` overrides its pointer. */
    <Card
      ref={setNodeRef}
      {...(draggable ? listeners : {})}
      {...(draggable ? attributes : {})}
      size="sm"
      variant={blocked ? 'archived' : 'default'}
      interactive={draggable}
      aria-disabled={blocked || undefined}
      className={cn(
        'gap-0 text-start',
        draggable && 'cursor-grab',
        isDragging && 'opacity-40',
      )}
    >
      <CardContent className="flex flex-col gap-0.5">
        <span className="flex items-baseline gap-1.5">
          <span className="min-w-0 flex-1 truncate text-body-sm font-medium">{dish.nameAr}</span>

          {usage && (
            <Badge variant="outline" size="sm">
              {usage.weeksAgo === 0
                ? t('usedThisWeek')
                : t('usedWeeksAgo', { count: usage.weeksAgo })}
            </Badge>
          )}
        </span>

        <span className="block text-caption text-muted-foreground">
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
              {t('portionShort', { servings })} ·{' '}
              {t('kcalValue', { value: roundForDisplay('kcal', dish.baseKcal * servings) })}
            </>
          )}
        </span>
      </CardContent>
    </Card>
  );
}
