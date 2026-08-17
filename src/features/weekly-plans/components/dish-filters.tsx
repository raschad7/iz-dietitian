'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select-field';
import { usePathname, useRouter } from '@/i18n/navigation';
import { type MealType } from '@/features/weekly-plans/schema';

/** How long to let someone keep typing before the catalog re-queries. */
const SEARCH_DEBOUNCE_MS = 300;

/** The select's "no meal time chosen" row. A `<select>` cannot hold `undefined`. */
const ANY = '__any__';

/**
 * The catalog's toolbar: search, meal time, and the way back out.
 *
 * **The Apply button is gone.** This screen used to be a `<form method="get">`
 * with a submit button, which meant three interactions to answer "is there a
 * quick breakfast in here" and a page that looked unchanged until you pressed
 * the third. Typing re-queries live and choosing a meal time applies at once —
 * the same behaviour as the client register's toolbar, which is the control
 * pattern this app has already committed to.
 *
 * Both parameters still round-trip through the URL (`router.replace`, so a
 * keystroke never adds a history entry of its own), which is what keeps a
 * filtered catalog shareable and is what the page reads to run the query.
 */
export function DishFilters({
  q,
  mealType,
  mealTypes,
}: {
  q: string | undefined;
  mealType: string | undefined;
  /** The meal times actually present in the catalog, already narrowed. */
  mealTypes: readonly MealType[];
}) {
  const t = useTranslations('dishes');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [term, setTerm] = useState(q ?? '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /*
   * The URL can change from outside this field too — "clear filters", the back
   * button — and the field has to follow it back rather than keep showing a
   * term that no longer matches what is on screen. Adjusted during render
   * rather than in an effect (React's documented pattern for mirroring a prop
   * into state) so the field never paints the stale value even for one frame.
   */
  const [lastSynced, setLastSynced] = useState(q ?? '');
  if ((q ?? '') !== lastSynced) {
    setLastSynced(q ?? '');
    setTerm(q ?? '');
  }

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  /** Writes one parameter and sends the reader back to the first page. */
  function navigate(key: 'q' | 'mealType', value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    // A new search or filter always starts back at page 1 — page 3 of a
    // differently filtered catalog is not the page the reader meant.
    next.delete('page');

    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`);
    });
  }

  function handleSearch(value: string) {
    setTerm(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => navigate('q', value), SEARCH_DEBOUNCE_MS);
  }

  const active = Boolean(q) || Boolean(mealType);

  return (
    // `shrink-0`: this row is chrome the catalog scrolls under, never something
    // the table squeezes to make room for itself. See the page component.
    <div className="flex shrink-0 flex-wrap items-center gap-3">
      {/* The glyph rides inside the field's own well — see `Input`'s `icon`. */}
      <Input
        name="q"
        type="search"
        icon="search"
        value={term}
        onChange={(event) => handleSearch(event.target.value)}
        placeholder={t('searchPlaceholder')}
        aria-label={t('searchPlaceholder')}
        /*
          `w-full` below `sm`, and `flex-1` with a floor from `sm` up.

          It was `min-w-64 flex-1` at every width, and that is not the same
          thing as a line to itself. `flex-1` is `flex: 1 1 0%` — it grows into
          whatever is *left over* on its line — so on a phone the select beside
          it stayed on the same row and shrank toward its own min-content, and
          the field sat at its 256px floor with a squeezed dropdown jammed
          against it. The toolbar's own note below says the field takes a line
          to itself below `sm`; this is what actually makes that true. A
          `width: 100%` basis cannot share a flex line, so the group after it
          wraps, and the search box is as wide as the catalog it searches.

          The floor moves to `sm` with the rest of it. At 256px it was also
          wider than a 320px phone has to give once the staff rail and the
          page's own padding are out — the one width where a minimum on a
          search field turns into a page that scrolls sideways.
        */
        className="w-full sm:w-auto sm:min-w-64 sm:flex-1"
      />

      {/*
        The qualifier and the way out travel together. Below `sm` the field
        above takes a line to itself and these two share the next one, rather
        than each wrapping onto a line of its own and leaving the toolbar three
        rows deep before a single dish is on screen.
      */}
      <div className="flex flex-1 items-center gap-3 sm:flex-none">
        {/*
          The meal time is a choice out of five, so it is a select rather than a
          row of chips: four meal times plus "all" would be five permanently lit
          controls in a toolbar that is read past every day, and only ever one
          of them is on.
        */}
        <SelectField
          aria-label={t('columns.mealTypes')}
          value={mealType ?? ANY}
          onValueChange={(next) => navigate('mealType', next === ANY ? '' : next)}
          className="flex-1 sm:w-48 sm:flex-none"
          options={[
            { value: ANY, label: t('allMealTypes') },
            ...mealTypes.map((type) => ({ value: type, label: t(`mealTypes.${type}`) })),
          ]}
        />

        {/* Only offered when there is something to clear — a permanently
            disabled control here would be a third item in a two-item row. */}
        {active && (
          <Button
            type="button"
            variant="neutralGhost"
            className="shrink-0"
            onClick={() => startTransition(() => router.replace(pathname))}
          >
            {t('clearFilters')}
          </Button>
        )}
      </div>
    </div>
  );
}
