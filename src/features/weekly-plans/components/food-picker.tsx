'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
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

/** How many results in the reader's language show before "عرض المزيد" (spec §8, §21). */
const PRIMARY_LIMIT = 7;

type SearchStatus = 'idle' | 'loading' | 'done' | 'error';

/**
 * The ingredient builder's search — a single box that *is* how an ingredient is
 * added (spec §15). Picking a result hands the food up and clears the box, so the
 * same field is ready for the next ingredient.
 *
 * **The results are a keyboard list.** ↑ and ↓ walk them, Enter adds the
 * highlighted one, Escape closes them, and the box keeps focus throughout: a
 * dietitian entering an eight-ingredient recipe types eight words and never
 * reaches for the mouse. That is the whole reason the results moved into a
 * popover — a list that pushed the page down could not be walked without the
 * ground moving under the next ingredient.
 *
 * The results themselves are Arabic-first, deduplicated and ranked on the server
 * (`searchIngredients`); this component owns the *interaction* (spec §8, §15): a
 * 200 ms debounce, a stale-request guard so a slow "رز" can never overwrite a
 * newer "عدس", an in-memory cache so a repeated query is instant, and results
 * that stay on screen while the next search runs. The "add a custom ingredient"
 * escape hatch is always reachable, not hidden behind an empty search (spec §4).
 */
export function IngredientSearch({
  locale,
  onPick,
  inputRef: externalInputRef,
  /** Injectable for the dev harness; defaults to the real server action. */
  search = searchIngredientsAction,
}: {
  locale: string;
  onPick: (food: FoodSearchResult) => void;
  /** Lets the editor put the cursor back here after an ingredient is added. */
  inputRef?: React.RefObject<HTMLInputElement | null>;
  search?: (locale: string, query: string) => Promise<RefinedFood[]>;
}) {
  const t = useTranslations('dishEditor');
  const listId = useId();

  const [term, setTerm] = useState('');
  const [results, setResults] = useState<RefinedFood[] | null>(null);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [showSecondary, setShowSecondary] = useState(false);
  const [showAllPrimary, setShowAllPrimary] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  /** Which row Enter would add. Reset to the first result on every new answer. */
  const [activeIndex, setActiveIndex] = useState(0);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const localInputRef = useRef<HTMLInputElement>(null);
  const inputRef = externalInputRef ?? localInputRef;
  const listRef = useRef<HTMLDivElement>(null);
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
    setActiveIndex(0);

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
    setActiveIndex(0);
  }

  function pick(food: RefinedFood | FoodSearchResult) {
    onPick(food);
    reset();
  }

  function handleCreated(food: FoodSearchResult) {
    setDialogOpen(false);
    onPick(food);
    reset();
    inputRef.current?.focus();
  }

  const trimmed = term.trim();
  // Grouped by the reader's own language, not by "Arabic vs the rest": in an
  // English UI the primary list is what English names and English synonyms
  // matched, and the fold below holds the Arabic ones. See `ingredient-refine.ts`.
  const primary = useMemo(() => (results ?? []).filter((row) => row.matchesLocale), [results]);
  const secondary = useMemo(() => (results ?? []).filter((row) => !row.matchesLocale), [results]);
  const shownPrimary = showAllPrimary ? primary : primary.slice(0, PRIMARY_LIMIT);

  /*
   * The one flat list the keyboard walks — exactly the rows on screen, in the
   * order they are painted. Folding the other-language group open extends it;
   * leaving it folded keeps those rows unreachable by arrow key, which is the
   * same thing the eye sees.
   */
  const navigable = useMemo(
    () => [...shownPrimary, ...(showSecondary ? secondary : [])],
    [shownPrimary, showSecondary, secondary],
  );

  const noResults = status === 'done' && (results ?? []).length === 0;
  const open = trimmed.length > 0 && (status === 'loading' || status === 'error' || results !== null);

  // Keep the highlighted row inside the scrolled popover as the arrows move it.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      // Escape closes the results without clearing the box: the typed word is
      // still what the dietitian wants, they just want the list out of the way.
      event.stopPropagation();
      setResults(null);
      setStatus('idle');
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!navigable.length) return;
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((current) => (current + step + navigable.length) % navigable.length);
      return;
    }

    if (event.key === 'Enter') {
      // Never submits the dish, and never advances the step: Enter here means
      // "add this ingredient", and with no list open it means "search now".
      event.preventDefault();
      event.stopPropagation();
      const active = navigable[activeIndex];
      if (active) {
        pick(active);
        return;
      }
      clearTimeout(debounceRef.current);
      void runSearch(term);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {/*
        A plain container, NOT a <form>: this renders inside the dish editor's own
        <form>, and a nested form is invalid HTML.
      */}
      <div className="relative">
        <Input
          ref={inputRef}
          type="search"
          icon="search"
          value={term}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('foodPicker.placeholder')}
          aria-label={t('foodPicker.label')}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={navigable[activeIndex] ? `${listId}-${activeIndex}` : undefined}
        />
        {status === 'loading' && (
          <span className="absolute inset-y-0 end-3 flex items-center" aria-hidden>
            <Spinner />
          </span>
        )}

        {open && (
          /*
            A popover, not a block in the flow. The rows below it are a list the
            dietitian is reading; results that pushed that list down would move
            the row they were about to check every time another letter landed.
          */
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={t('foodPicker.label')}
            className={cn(
              'absolute inset-x-0 top-full z-30 mt-1.5 max-h-72 overflow-y-auto',
              'rounded-xl border border-border bg-popover p-1.5 shadow-overlay',
            )}
          >
            {status === 'error' && (
              <div className="px-3 py-3 text-center">
                <p className="text-body-sm text-muted-foreground">{t('foodPicker.searchError')}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => runSearch(term)}
                >
                  {t('foodPicker.retry')}
                </Button>
              </div>
            )}

            {noResults && (
              <p className="px-3 py-3 text-center text-body-sm text-muted-foreground">
                {t('foodPicker.noResults', { name: trimmed })}
              </p>
            )}

            {navigable.length > 0 && (
              <ul>
                {shownPrimary.map((food, index) => (
                  <li key={food.id}>
                    <SearchResultRow
                      id={`${listId}-${index}`}
                      index={index}
                      food={food}
                      locale={locale}
                      active={index === activeIndex}
                      onHover={() => setActiveIndex(index)}
                      onPick={() => pick(food)}
                    />
                  </li>
                ))}
              </ul>
            )}

            {primary.length > shownPrimary.length && (
              <button
                type="button"
                onClick={() => setShowAllPrimary(true)}
                className="rounded-md px-2 py-1.5 text-body-sm font-medium text-primary hover:bg-accent"
              >
                {t('foodPicker.moreResults')}
              </button>
            )}

            {/* Rows that only matched the other language are demoted under a quiet,
                collapsed section (spec §5) — never hidden, only folded. */}
            {secondary.length > 0 && (
              <div className="mt-1 border-t border-border pt-1">
                <button
                  type="button"
                  onClick={() => setShowSecondary((value) => !value)}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-caption font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Icon
                    name="chevronDown"
                    className={cn('size-3.5 transition-transform', showSecondary && 'rotate-180')}
                  />
                  {t('foodPicker.otherLanguageResults')} ({secondary.length})
                </button>
                {showSecondary && (
                  <ul>
                    {secondary.map((food, offset) => {
                      const index = shownPrimary.length + offset;
                      return (
                        <li key={food.id}>
                          <SearchResultRow
                            id={`${listId}-${index}`}
                            index={index}
                            food={food}
                            locale={locale}
                            active={index === activeIndex}
                            onHover={() => setActiveIndex(index)}
                            onPick={() => pick(food)}
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

          </div>
        )}
      </div>

      {/*
        The escape hatch is a button, always present, at a fixed place under the
        box — not a link that only appeared once a search had failed. It carries
        the typed name when there is one, so a fruitless search flows straight
        into creating the food it could not find.

        `neutral`, the same white-box-grey-border-grey-hover shape archive wears:
        this is a way *out* of the search, not a second thing to do beside it,
        and an olive-bordered button under an empty search box read as the
        primary move on the step.
      */}
      <Button
        type="button"
        variant="neutral"
        size="sm"
        className="w-full"
        onClick={() => setDialogOpen(true)}
      >
        <Icon name="add" />
        {trimmed ? t('foodPicker.addNamed', { name: trimmed }) : t('foodPicker.addCustom')}
      </Button>

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
  id,
  index,
  food,
  locale,
  active,
  onHover,
  onPick,
}: {
  id: string;
  index: number;
  food: RefinedFood;
  locale: string;
  /** The row Enter would add — highlighted the same way a hover is. */
  active: boolean;
  onHover: () => void;
  onPick: () => void;
}) {
  const t = useTranslations('dishEditor');
  const secondary = secondaryName(food, locale);

  return (
    <button
      id={id}
      data-index={index}
      type="button"
      role="option"
      aria-selected={active}
      // The pointer moves the same highlight the arrows move, so there is never a
      // second, competing "selected" row under the cursor.
      onMouseMove={onHover}
      onClick={onPick}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-start transition-colors',
        'focus-visible:outline-none',
        active && 'bg-secondary',
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
