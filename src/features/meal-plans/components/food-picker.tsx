'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useId, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { addItemAction, searchFoodsAction } from '@/features/meal-plans/actions';
import { roundForDisplay } from '@/features/meal-plans/nutrition';
// `import type` keeps `queries.ts` — and therefore `postgres` — out of the
// client bundle. See the note in `plan-workspace.tsx`.
import type { FoodSummary } from '@/features/meal-plans/queries';
import { formatNumber } from '@/lib/format';
import { type Locale } from '@/i18n/routing';

/**
 * Searches the 7,793-food reference table and adds one to a meal.
 *
 * The search runs through a server action rather than a route handler, so it
 * inherits the same session check as every other write in this feature.
 */
export function FoodPicker({
  locale,
  planId,
  mealId,
  categories,
  onDone,
}: {
  locale: Locale;
  planId: string;
  mealId: string;
  categories: string[];
  onDone: () => void;
}) {
  const t = useTranslations('mealPlans');
  const tCommon = useTranslations('common');

  const searchId = useId();
  const categoryId = useId();

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [results, setResults] = useState<FoodSummary[]>([]);
  const [selected, setSelected] = useState<FoodSummary | null>(null);
  const [isSearching, startSearch] = useTransition();

  /** Below this there is nothing worth querying the server for. */
  const active = query.trim().length >= 2 || category !== '';

  /**
   * Debounced so that typing "chicken" is one query rather than seven.
   *
   * The `ignore` flag is what keeps a slow early response from overwriting a
   * fast later one — without it, results can flicker back to a previous query.
   *
   * Nothing is cleared here when `active` goes false: emptying state from inside
   * an effect is a second render for no reason. The stale list is simply not
   * read — see `visible` below.
   */
  useEffect(() => {
    if (!active) return;

    let ignore = false;
    const timer = setTimeout(() => {
      startSearch(async () => {
        const found = await searchFoodsAction(locale, query, category);
        if (!ignore) setResults(found);
      });
    }, 250);

    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [active, query, category, locale]);

  const visible = active ? results : [];

  if (selected) {
    return (
      <QuantityForm
        locale={locale}
        planId={planId}
        mealId={mealId}
        food={selected}
        onBack={() => setSelected(null)}
        onDone={onDone}
      />
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1 space-y-1">
          <Label htmlFor={searchId} className="text-xs">
            {t('picker.search')}
          </Label>
          <Input
            id={searchId}
            value={query}
            autoFocus
            placeholder={t('picker.searchPlaceholder')}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="min-w-40 space-y-1">
          <Label htmlFor={categoryId} className="text-xs">
            {t('picker.category')}
          </Label>
          <Select id={categoryId} value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">{t('picker.allCategories')}</option>
            {categories.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </div>

        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          {tCommon('cancel')}
        </Button>
      </div>

      <FoodResults
        locale={locale}
        results={visible}
        active={active}
        isSearching={isSearching}
        onSelect={setSelected}
      />
    </div>
  );
}

function FoodResults({
  locale,
  results,
  active,
  isSearching,
  onSelect,
}: {
  locale: Locale;
  results: FoodSummary[];
  /** False while the query is too short to search on. */
  active: boolean;
  isSearching: boolean;
  onSelect: (food: FoodSummary) => void;
}) {
  const t = useTranslations('mealPlans');
  const tCommon = useTranslations('common');

  if (!active) {
    return <p className="text-xs text-muted-foreground">{t('picker.prompt')}</p>;
  }

  if (isSearching && results.length === 0) {
    return <p className="text-xs text-muted-foreground">{tCommon('loading')}</p>;
  }

  if (results.length === 0) {
    return <p className="text-xs text-muted-foreground">{t('picker.noResults')}</p>;
  }

  return (
    <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border">
      {results.map((food) => (
        <li key={food.id}>
          <button
            type="button"
            onClick={() => onSelect(food)}
            className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-start text-xs hover:bg-muted/60"
          >
            <span>
              <span className="font-medium">{food.description}</span>
              <span className="block text-muted-foreground">{food.category}</span>
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground" dir="ltr">
              {formatNumber(locale, food.kcal)} {t('per100g')}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Second step: how much of it.
 *
 * Offers the food's household measure ("1 large" = 50 g) as a one-click preset,
 * because a dietitian thinks in eggs and cups, not grams — but everything is
 * stored in grams, so the conversion happens here and nowhere else.
 */
function QuantityForm({
  locale,
  planId,
  mealId,
  food,
  onBack,
  onDone,
}: {
  locale: Locale;
  planId: string;
  mealId: string;
  food: FoodSummary;
  onBack: () => void;
  onDone: () => void;
}) {
  const t = useTranslations('mealPlans');
  const tCommon = useTranslations('common');

  const quantityId = useId();
  const [grams, setGrams] = useState(String(food.portionGrams ?? 100));

  const parsed = Number(grams);
  const preview = Number.isFinite(parsed) && parsed > 0 ? (food.kcal * parsed) / 100 : 0;

  return (
    <form
      action={addItemAction}
      onSubmit={onDone}
      className="space-y-3 rounded-lg border border-dashed border-border p-3"
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="mealId" value={mealId} />
      <input type="hidden" name="foodId" value={food.id} />

      <div>
        <p className="text-sm font-medium">{food.description}</p>
        <p className="text-xs text-muted-foreground">{food.category}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-32 space-y-1">
          <Label htmlFor={quantityId} className="text-xs">
            {t('fields.quantityGrams')}
          </Label>
          <Input
            id={quantityId}
            name="quantityGrams"
            type="number"
            inputMode="decimal"
            min={1}
            max={5000}
            step="any"
            required
            dir="ltr"
            value={grams}
            onChange={(event) => setGrams(event.target.value)}
          />
        </div>

        {food.portionGrams ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setGrams(String(food.portionGrams))}>
            {t('picker.usePortion', { label: food.portionLabel ?? '', grams: food.portionGrams })}
          </Button>
        ) : null}

        <p className="text-xs text-muted-foreground" dir="ltr">
          ≈ {formatNumber(locale, roundForDisplay('kcal', preview))} kcal
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm">
          {t('picker.add')}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onBack}>
          {tCommon('back')}
        </Button>
      </div>
    </form>
  );
}
