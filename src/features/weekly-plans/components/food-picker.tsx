'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

import { searchIngredientsAction } from '../catalog-actions';
import { localizedName, secondaryName } from '../food-display';
import type { RefinedFood } from '../ingredient-refine';
import type { FoodSearchResult } from '../queries';

import { CustomFoodDialog } from './custom-food-dialog';

/** Short enough to feel live, long enough not to fire on every keystroke (spec §8). */
const SEARCH_DEBOUNCE_MS = 200;

/** How many Arabic results show before "عرض المزيد" (spec §8, §21). */
const PRIMARY_LIMIT = 7;

type SearchStatus = 'idle' | 'loading' | 'done' | 'error';

/**
 * The ingredient builder's search — a single box that *is* how an ingredient is
 * added (spec §15). Picking a result hands the food up and clears the box, so the
 * same field is ready for the next ingredient.
 *
 * The results are Arabic-first, deduplicated and ranked on the server
 * (`searchIngredients`); this component owns the *interaction* the spec asks for
 * (spec §8, §15): a 200 ms debounce, a stale-request guard so a slow "رز" can
 * never overwrite a newer "عدس", an in-memory cache so a repeated query is
 * instant, and results that stay on screen while the next search runs. The
 * "add a custom ingredient" escape hatch is always visible, not hidden behind an
 * empty search (spec §4).
 */
export function IngredientSearch({
  locale,
  onPick,
  /** Injectable for the dev harness; defaults to the real server action. */
  search = searchIngredientsAction,
}: {
  locale: string;
  onPick: (food: FoodSearchResult) => void;
  search?: (locale: string, query: string) => Promise<RefinedFood[]>;
}) {
  const t = useTranslations('dishEditor');

  const [term, setTerm] = useState('');
  const [results, setResults] = useState<RefinedFood[] | null>(null);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [showSecondary, setShowSecondary] = useState(false);
  const [showAllPrimary, setShowAllPrimary] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  // Monotonic request id: only the newest search may write results, so a slow
  // response for an old query is dropped rather than clobbering a newer one.
  const requestSeq = useRef(0);
  const cache = useRef(new Map<string, RefinedFood[]>());

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  async function runSearch(value: string) {
    const query = value.trim();
    if (!query) {
      setResults(null);
      setStatus('idle');
      return;
    }

    setShowSecondary(false);
    setShowAllPrimary(false);

    const cached = cache.current.get(query);
    if (cached) {
      // Instant: a repeated query never round-trips again.
      setResults(cached);
      setStatus('done');
      return;
    }

    const seq = (requestSeq.current += 1);
    // Keep the current results on screen while the next search runs (spec §15).
    setStatus('loading');
    try {
      const found = await search(locale, query);
      cache.current.set(query, found);
      if (seq !== requestSeq.current) return; // a newer query has since started
      setResults(found);
      setStatus('done');
    } catch {
      if (seq !== requestSeq.current) return;
      setStatus('error');
    }
  }

  function handleChange(value: string) {
    setTerm(value);
    clearTimeout(debounceRef.current);
    if (!value.trim()) {
      requestSeq.current += 1; // cancel any in-flight write
      setResults(null);
      setStatus('idle');
      return;
    }
    debounceRef.current = setTimeout(() => runSearch(value), SEARCH_DEBOUNCE_MS);
  }

  function reset() {
    clearTimeout(debounceRef.current);
    requestSeq.current += 1;
    setTerm('');
    setResults(null);
    setStatus('idle');
    inputRef.current?.focus();
  }

  function pick(food: RefinedFood) {
    onPick(food);
    reset();
  }

  function handleCreated(food: FoodSearchResult) {
    setDialogOpen(false);
    onPick(food);
    reset();
  }

  const trimmed = term.trim();
  // Grouped by the reader's own language, not by "Arabic vs the rest": in an
  // English UI the primary list is what English names and English synonyms
  // matched, and the fold below holds the Arabic ones. See `ingredient-refine.ts`.
  const primary = (results ?? []).filter((row) => row.matchesLocale);
  const secondary = (results ?? []).filter((row) => !row.matchesLocale);
  const shownPrimary = showAllPrimary ? primary : primary.slice(0, PRIMARY_LIMIT);
  const noResults = status === 'done' && (results ?? []).length === 0;

  return (
    <div className="flex flex-col gap-2">
      {/*
        A plain container, NOT a <form>: this renders inside the dish editor's own
        <form>, and a nested form is invalid HTML. Enter runs the search now.
      */}
      <div className="relative">
        <Input
          ref={inputRef}
          type="search"
          icon="search"
          value={term}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              clearTimeout(debounceRef.current);
              runSearch(term);
            }
          }}
          placeholder={t('foodPicker.placeholder')}
          aria-label={t('foodPicker.label')}
        />
        {status === 'loading' && (
          <span className="absolute inset-y-0 end-3 flex items-center" aria-hidden>
            <Spinner />
          </span>
        )}
      </div>

      {/* The custom-ingredient escape hatch is always here, not only after a
          fruitless search (spec §4). It carries the typed name when there is one. */}
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className="flex items-center gap-1.5 self-start rounded-md px-2 py-1.5 text-body-sm font-medium text-primary transition-colors hover:bg-accent"
      >
        <Icon name="add" className="size-4" />
        {trimmed ? t('foodPicker.addNamed', { name: trimmed }) : t('foodPicker.addCustom')}
      </button>

      {status === 'idle' && results === null && (
        <p className="px-1 py-1 text-body-sm text-muted-foreground">{t('foodPicker.startSearching')}</p>
      )}

      {status === 'error' && (
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-3 text-center">
          <p className="text-body-sm text-muted-foreground">{t('foodPicker.searchError')}</p>
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => runSearch(term)}>
            {t('foodPicker.retry')}
          </Button>
        </div>
      )}

      {noResults && (
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-3 text-center">
          <p className="text-body-sm font-medium">{t('foodPicker.noResultTitle')}</p>
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setDialogOpen(true)}>
            <Icon name="add" />
            {t('foodPicker.addNamed', { name: trimmed })}
          </Button>
        </div>
      )}

      {primary.length > 0 && (
        <ul className="flex flex-col">
          {shownPrimary.map((food) => (
            <li key={food.id}>
              <SearchResultRow food={food} locale={locale} onPick={() => pick(food)} />
            </li>
          ))}
        </ul>
      )}

      {primary.length > shownPrimary.length && (
        <button
          type="button"
          onClick={() => setShowAllPrimary(true)}
          className="self-start rounded-md px-2 py-1 text-body-sm font-medium text-primary hover:bg-accent"
        >
          {t('foodPicker.moreResults')}
        </button>
      )}

      {/* Rows that only matched the other language are demoted under a quiet,
          collapsed section (spec §5) — never hidden, only folded. */}
      {secondary.length > 0 && (
        <div className="mt-1">
          <button
            type="button"
            onClick={() => setShowSecondary((value) => !value)}
            className="flex items-center gap-1.5 text-caption font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Icon
              name="chevronDown"
              className={cn('size-3.5 transition-transform', showSecondary && 'rotate-180')}
            />
            {t('foodPicker.otherLanguageResults')} ({secondary.length})
          </button>
          {showSecondary && (
            <ul className="mt-1 flex flex-col">
              {secondary.map((food) => (
                <li key={food.id}>
                  <SearchResultRow food={food} locale={locale} onPick={() => pick(food)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <CustomFoodDialog
        locale={locale}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialNameAr={trimmed}
        onCreated={handleCreated}
      />
    </div>
  );
}

/**
 * One search result — a dense, tappable row (spec §21).
 *
 * The food's canonical name in the reader's language leads, the other language
 * follows quietly, and the energy per 100 g sits at the inline-end.
 *
 * **The name shown is always the food's own, never the alias that matched it.** A
 * search for طماطم returns بندورة under the name بندورة: synonyms exist so a
 * dietitian can find a food by whatever they call it, and a list that renamed
 * itself to the query would leave two dietitians reading different words for the
 * same row. The canonical name is also what carries the preparation state — أرز
 * أبيض ناشف and أرز أبيض مطبوخ arrive as two visibly different results — so
 * nothing here collapses or pre-selects between them.
 */
function SearchResultRow({
  food,
  locale,
  onPick,
}: {
  food: RefinedFood;
  locale: string;
  onPick: () => void;
}) {
  const t = useTranslations('dishEditor');
  const secondary = secondaryName(food, locale);

  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        'flex w-full items-center gap-3 rounded-md px-2 py-2 text-start transition-colors',
        'hover:bg-accent focus-visible:bg-accent focus-visible:outline-none',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium" dir="auto">
          {localizedName(food, locale)}
        </span>
        {secondary && (
          <span className="block truncate text-caption text-muted-foreground" dir="auto">
            {secondary}
          </span>
        )}
      </span>
      <span className="shrink-0 text-caption text-muted-foreground tabular-nums" dir="ltr">
        {t('foodPicker.kcalPer100g', { kcal: Math.round(food.kcal) })}
      </span>
    </button>
  );
}
