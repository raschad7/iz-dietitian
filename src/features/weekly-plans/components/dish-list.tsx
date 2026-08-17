'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { useRouter } from '@/i18n/navigation';
import { membersOf } from '@/lib/enum';
import { cn } from '@/lib/utils';
import { NUTRIENT_UNITS } from '@/features/weekly-plans/nutrition';

import { loadDishForEditAction } from '../catalog-actions';
import type { DishEditData } from '../queries';
import { DISH_TAGS, MEAL_TYPES } from '../schema';

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
  protein: number;
  /** Shared/built-in dish — read-only. */
  isSystem: boolean;
  hidden: boolean;
};

/** How many tags a row prints before it stops — the catalog scans on nutrition, not tags. */
const TAG_LIMIT = 3;

/**
 * The catalog as a compact, scannable list (spec §1). Each row is a summary —
 * Arabic name, meal category, energy and protein, a couple of tags, a quiet
 * ownership label — and nothing about how the dish is built. The recipe (raw
 * ingredient names, grams, USDA descriptions) belongs to the detail drawer, one
 * click away, so browsing stays about *choosing* a dish, not reading its internals
 * (spec §2).
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
      {/* A plain divided list, not a bordered card — fewer boxes, less of the
          "blank form" look (Phase 2 §1). Hairlines top and bottom, rows between. */}
      <div className="md:min-h-0 md:flex-1 md:overflow-y-auto md:pe-1">
        <ul className="divide-y divide-border border-y border-border">
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
        </ul>
      </div>

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
  const tNutrients = useTranslations('weeklyPlans.nutrients');

  const mealTypes = membersOf(MEAL_TYPES, dish.mealTypes);
  const tags = membersOf(DISH_TAGS, dish.tags).slice(0, TAG_LIMIT);
  // meal category then a couple of tags, one quiet line — the row's second tier
  // after the name (spec §2).
  const meta = [
    ...mealTypes.map((type) => t(`mealTypes.${type}`)),
    ...tags.map((tag) => t(`tags.${tag}`)),
  ].join(' · ');

  return (
    <li className={cn('group relative', dish.hidden && 'opacity-60')}>
      {/*
        A stretched button is the whole row's click target (the design system's
        "linked rows use a real stretched link" rule). The content above it is
        pointer-transparent so a click anywhere opens the drawer; only the overflow
        menu re-enables pointer events, so it captures its own clicks.
      */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={t('detail.open', { name: dish.nameAr })}
        className="absolute inset-0 z-0 outline-none focus-visible:bg-accent/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      />

      <div className="pointer-events-none relative z-10 flex min-h-[4.5rem] items-center gap-4 px-3 py-2.5 transition-colors group-hover:bg-accent/40">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {/* Arabic name only — the English name is deliberately kept out of the
                catalog (Phase 2 §1); it lives in the detail drawer. */}
            <p className="truncate font-heading text-body-md font-semibold" dir="auto">
              {dish.nameAr}
            </p>
            {dish.hidden && (
              <Badge variant="outline" size="sm" className="shrink-0 text-muted-foreground">
                {t('hiddenBadge')}
              </Badge>
            )}
          </div>

          {meta && <p className="mt-1 truncate text-caption text-muted-foreground">{meta}</p>}
        </div>

        {/* Nutrition leads the inline-end column; ownership sits quiet beneath it. */}
        <div className="flex shrink-0 flex-col items-end gap-0.5 text-end">
          <p className="text-body-sm" dir="ltr">
            <span className="font-semibold tabular-nums">{dish.kcal}</span>{' '}
            <span className="text-muted-foreground">{NUTRIENT_UNITS.kcal}</span>
            <span aria-hidden className="mx-1 text-muted-foreground">
              ·
            </span>
            <span className="tabular-nums">{dish.protein}</span>
            <span className="text-muted-foreground">{NUTRIENT_UNITS.protein}</span>{' '}
            <span className="text-muted-foreground">{tNutrients('protein')}</span>
          </p>
          <p className="text-caption text-muted-foreground">
            {t(dish.isSystem ? 'ownership.system' : 'ownership.clinic')}
          </p>
        </div>

        <span className="pointer-events-auto shrink-0">
          {editing ? (
            <span className="flex size-8 items-center justify-center">
              <Spinner />
            </span>
          ) : (
            <DishRowActions
              locale={locale}
              dish={{ id: dish.id, nameAr: dish.nameAr, isSystem: dish.isSystem, hidden: dish.hidden }}
              onEdit={onEdit}
            />
          )}
        </span>
      </div>
    </li>
  );
}
