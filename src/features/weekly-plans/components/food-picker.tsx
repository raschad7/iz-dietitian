'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';

import { searchClinicFoodsAction, searchFoodMatchesAction } from '../catalog-actions';
import type { FoodSearchResult } from '../queries';

import { CustomFoodDialog } from './custom-food-dialog';

/** How long to let the dietitian keep typing before the library re-queries. */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * Finds a food for a dish's ingredient list.
 *
 * The primary path is plain text search over the clinic's own library —
 * `searchClinicFoodsAction`, no AI, works offline, and the empty query still
 * returns her library so there is always something to pick from. The USDA
 * database (`searchFoodMatchesAction`, which also runs the Arabic→English
 * translation pass) is a large English-only reference the dietitian may reach
 * for when her own library comes up short, so it sits behind an explicit
 * opt-in rather than racing the library search for attention.
 */
export function FoodPicker({
  locale,
  onPick,
}: {
  locale: string;
  onPick: (food: FoodSearchResult) => void;
}) {
  const t = useTranslations('dishEditor');

  // --- Primary: the clinic's own library ---------------------------------
  const [term, setTerm] = useState('');
  const [libraryResults, setLibraryResults] = useState<FoodSearchResult[] | null>(null);
  const [libraryPending, startLibraryTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = useState(false);

  function runLibrarySearch(query: string) {
    startLibraryTransition(async () => {
      const result = await searchClinicFoodsAction(locale, query);
      setLibraryResults(result);
    });
  }

  // Shows the clinic's library before anything is typed, the same way an
  // empty query already behaves server-side.
  useEffect(() => {
    runLibrarySearch('');
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  function handleTermChange(value: string) {
    setTerm(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runLibrarySearch(value), SEARCH_DEBOUNCE_MS);
  }

  function handleCreated(food: FoodSearchResult) {
    setDialogOpen(false);
    onPick(food);
  }

  const trimmedTerm = term.trim();
  const hasLibraryResults = libraryResults !== null && libraryResults.length > 0;
  const noLibraryResults = libraryResults !== null && libraryResults.length === 0;

  // --- Secondary: the USDA database, opt-in only --------------------------
  const [usdaOpen, setUsdaOpen] = useState(false);
  const [usdaTerm, setUsdaTerm] = useState('');
  const [usdaMatches, setUsdaMatches] = useState<FoodSearchResult[] | null>(null);
  const [usdaPending, startUsdaTransition] = useTransition();

  function runUsdaSearch() {
    const name = usdaTerm.trim();
    if (!name) return;

    startUsdaTransition(async () => {
      const result = await searchFoodMatchesAction(locale, name);
      setUsdaMatches(result.matches);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {/*
        A plain container, NOT a <form>: this picker renders inside the dish
        editor's own <form>, and a nested form is invalid HTML — the browser
        would either drop the inner submit or bubble Enter up to submit the whole
        dish. The library re-queries on the debounced onChange; Enter just runs it
        immediately, and preventDefault stops it reaching the dish form.
      */}
      <div className="flex items-center gap-2">
        <Input
          type="search"
          icon="search"
          value={term}
          onChange={(event) => handleTermChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              clearTimeout(debounceRef.current);
              runLibrarySearch(term);
            }
          }}
          placeholder={t('foodPicker.placeholder')}
          aria-label={t('foodPicker.label')}
          className="flex-1"
        />
      </div>

      {libraryPending && (
        <p className="flex items-center gap-2 text-body-sm text-muted-foreground">
          <Spinner />
          {t('foodPicker.searching')}
        </p>
      )}

      {!libraryPending && hasLibraryResults && (
        <ItemGroup className="gap-2">
          {libraryResults.map((food) => (
            <Item
              key={food.id}
              render={<button type="button" />}
              onClick={() => onPick(food)}
              variant="outline"
              className="cursor-pointer text-start hover:bg-accent"
            >
              <ItemContent>
                <ItemTitle dir="auto">{food.nameAr ?? food.description}</ItemTitle>
                <ItemDescription>
                  {t('foodPicker.kcalPer100g', { kcal: Math.round(food.kcal) })}
                </ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      )}

      {!libraryPending && noLibraryResults && (
        <Callout tone="neutral">
          <p>
            {trimmedTerm
              ? t('foodPicker.noLibraryMatches', { name: trimmedTerm })
              : t('foodPicker.libraryEmpty')}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-1 self-start"
            onClick={() => setDialogOpen(true)}
          >
            <Icon name="add" />
            {t('foodPicker.createCustomFood')}
          </Button>
        </Callout>
      )}

      {/* Offered beside a successful search too — the right food may not be
          listed even when others are. */}
      {!libraryPending && hasLibraryResults && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="self-start"
          onClick={() => setDialogOpen(true)}
        >
          {t('foodPicker.createCustomFoodShort')}
        </Button>
      )}

      <Separator />

      {/*
        The big English-language reference, kept visually quiet and opt-in:
        the clinic's own library is what she matches against day to day, and
        this is the fallback for the food that is not in it yet.
      */}
      <Collapsible open={usdaOpen} onOpenChange={setUsdaOpen}>
        <CollapsibleTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start gap-1.5 px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
            >
              <Icon name="search" className="size-4" />
              {t('foodPicker.usdaToggle')}
              <Icon name={usdaOpen ? 'chevronUp' : 'chevronDown'} className="size-4" />
            </Button>
          }
        />

        <CollapsibleContent className="flex flex-col gap-3 pt-3">
          <p className="text-caption text-muted-foreground">{t('foodPicker.usdaHint')}</p>

          <div className="flex items-center gap-2">
            <Input
              type="search"
              icon="search"
              value={usdaTerm}
              onChange={(event) => setUsdaTerm(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  runUsdaSearch();
                }
              }}
              placeholder={t('foodPicker.usdaPlaceholder')}
              aria-label={t('foodPicker.usdaLabel')}
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              onClick={runUsdaSearch}
              disabled={usdaPending || !usdaTerm.trim()}
            >
              {usdaPending ? <Spinner /> : <Icon name="search" />}
              {t('foodPicker.searchButton')}
            </Button>
          </div>

          {usdaPending && (
            <p className="flex items-center gap-2 text-body-sm text-muted-foreground">
              <Spinner />
              {t('foodPicker.searching')}
            </p>
          )}

          {!usdaPending && usdaMatches !== null && usdaMatches.length > 0 && (
            <ItemGroup className="gap-2">
              {usdaMatches.map((food) => (
                <Item
                  key={food.id}
                  render={<button type="button" />}
                  onClick={() => onPick(food)}
                  variant="outline"
                  className="cursor-pointer text-start hover:bg-accent"
                >
                  <ItemContent>
                    <ItemTitle dir="auto">{food.description}</ItemTitle>
                    <ItemDescription>
                      {t('foodPicker.kcalPer100g', { kcal: Math.round(food.kcal) })}
                    </ItemDescription>
                  </ItemContent>
                </Item>
              ))}
            </ItemGroup>
          )}

          {!usdaPending && usdaMatches !== null && usdaMatches.length === 0 && (
            <p className="text-body-sm text-muted-foreground">
              {t('foodPicker.noMatches', { name: usdaTerm.trim() })}
            </p>
          )}
        </CollapsibleContent>
      </Collapsible>

      <CustomFoodDialog
        locale={locale}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialNameAr={trimmedTerm}
        onCreated={handleCreated}
      />
    </div>
  );
}
