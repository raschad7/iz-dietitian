'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import { Spinner } from '@/components/ui/spinner';

import { searchFoodMatchesAction } from '../catalog-actions';
import type { FoodSearchResult } from '../queries';

import { CustomFoodDialog } from './custom-food-dialog';

/**
 * Finds a food for a dish's ingredient list.
 *
 * The dietitian types an Arabic or English name; a confirmed alias or a
 * translate-then-search pass resolves it to library rows. Nothing here is
 * guaranteed to find a match — an empty result always keeps the door open to
 * adding the food to the clinic's own library instead of blocking the dish.
 */
export function FoodPicker({
  locale,
  onPick,
}: {
  locale: string;
  onPick: (food: FoodSearchResult) => void;
}) {
  const t = useTranslations('dishEditor');
  const [term, setTerm] = useState('');
  const [matches, setMatches] = useState<FoodSearchResult[] | null>(null);
  const [searchedTerm, setSearchedTerm] = useState('');
  const [pending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = term.trim();
    if (!name) return;

    startTransition(async () => {
      const result = await searchFoodMatchesAction(locale, name);
      setMatches(result.matches);
      setSearchedTerm(name);
    });
  }

  function reset() {
    setMatches(null);
    setTerm('');
  }

  function handlePick(food: FoodSearchResult) {
    reset();
    onPick(food);
  }

  function handleCreated(food: FoodSearchResult) {
    setDialogOpen(false);
    reset();
    onPick(food);
  }

  const hasResults = matches !== null && matches.length > 0;
  const noResults = matches !== null && matches.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <Input
          type="search"
          icon="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={t('foodPicker.placeholder')}
          aria-label={t('foodPicker.label')}
          className="flex-1"
        />
        <Button type="submit" variant="outline" disabled={pending || !term.trim()}>
          {pending ? <Spinner /> : <Icon name="search" />}
          {t('foodPicker.searchButton')}
        </Button>
      </form>

      {pending && (
        <p className="flex items-center gap-2 text-body-sm text-muted-foreground">
          <Spinner />
          {t('foodPicker.searching')}
        </p>
      )}

      {!pending && hasResults && (
        <ItemGroup className="gap-2">
          {matches.map((food) => (
            <Item
              key={food.id}
              render={<button type="button" />}
              onClick={() => handlePick(food)}
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

      {!pending && noResults && (
        <Callout tone="neutral">
          <p>{t('foodPicker.noMatches', { name: searchedTerm })}</p>
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
      {!pending && hasResults && (
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

      <CustomFoodDialog
        locale={locale}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialNameAr={searchedTerm || term}
        onCreated={handleCreated}
      />
    </div>
  );
}
