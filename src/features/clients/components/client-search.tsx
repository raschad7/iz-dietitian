'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition } from 'react';

import { buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { ClientFilterMenu } from '@/features/clients/components/client-filter';
import { ClientFormTrigger } from '@/features/clients/components/client-form-trigger';
import { type ListClientsInput } from '@/features/clients/schema';
import { usePathname, useRouter } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';

/** How long to let someone keep typing before the register re-queries. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * The register's toolbar: search, filter, new client.
 *
 * **The field searches names.** Nothing else — it used to match phone and email
 * along with them, which made one box mean three things and gave a reader no
 * way to say which. Those are columns you filter on now, in the control beside
 * it (`ClientFilterMenu`), and the field answers the question it is actually
 * used for: which of these people is Ahmad.
 *
 * Typing here re-queries the register live — no Enter, no submit button. The
 * term still round-trips through the URL (`router.replace`, so a keystroke
 * never adds a history entry of its own), which is what keeps a search
 * shareable and is what the page reads to run the query.
 *
 * Every other parameter already in the address bar — sort, direction, the
 * filter — rides along untouched: a search only ever adds or clears `q`.
 */
export function ClientSearch({ input, locale }: { input: ListClientsInput; locale: Locale }) {
  const t = useTranslations('clients');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [q, setQ] = useState(input.q ?? '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /*
   * The URL can change from outside this field too — "clear filters", the
   * back button — and the field has to follow it back rather than keep
   * showing a term that no longer matches what's on screen. Adjusted here
   * during render rather than in an effect (React's documented pattern for
   * mirroring a prop into state) so the field never paints the stale value
   * even for one frame.
   */
  const [lastSyncedQ, setLastSyncedQ] = useState(input.q ?? '');
  if ((input.q ?? '') !== lastSyncedQ) {
    setLastSyncedQ(input.q ?? '');
    setQ(input.q ?? '');
  }

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  function handleChange(value: string) {
    setQ(value);
    clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      if (value) next.set('q', value);
      else next.delete('q');
      // A new search always starts back at page 1 — page 3 of a differently
      // filtered list is not the page the reader meant.
      next.delete('page');

      startTransition(() => {
        router.replace(`${pathname}?${next.toString()}`);
      });
    }, SEARCH_DEBOUNCE_MS);
  }

  return (
    // `shrink-0`: this row is chrome the register scrolls under, never something
    // the list squeezes to make room for itself. See the page component.
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
      {/*
        The glyph is inside the field's box rather than beside it. `relative` on
        the wrapper and `start-4` on the icon keep it on the reading edge in
        both scripts; `ps-12` is what stops the caret from starting underneath
        it — 20px of field padding, a 20px glyph, then the text.
      */}
      <div className="relative min-w-64 flex-1">
        <Icon
          name="search"
          aria-hidden
          className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          name="q"
          type="search"
          value={q}
          onChange={(event) => handleChange(event.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          className="ps-12"
          lang={locale}
          unclippedText={locale === 'ar'}
          unclippedTextClassName={
            q
              ? 'ps-12 pe-12 text-body-md text-foreground'
              : 'ps-12 pe-12 text-body-sm text-placeholder'
          }
          unclippedTextDirection="rtl"
        />
      </div>

      {/*
        The two controls travel together at the row's inline-end, and the field
        above gives up the width they need — it is `flex-1`, so the filter cost
        it exactly its own width and nothing had to be measured. Filter first:
        it is the narrower of the two and the one that qualifies what the field
        beside it just asked for, so the reading order is question, then
        qualifier, then the thing that has nothing to do with either.
      */}
      <div className="flex shrink-0 items-center gap-2">
        <ClientFilterMenu input={input} />

        {/* Opens the client card over the list. */}
        <ClientFormTrigger locale={locale} className={buttonVariants()}>
          <Icon name="addClient" />
          {t('new')}
        </ClientFormTrigger>
      </div>
    </div>
  );
}
