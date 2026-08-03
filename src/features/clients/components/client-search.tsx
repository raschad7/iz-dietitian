import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { ClientFormTrigger } from '@/features/clients/components/client-form-trigger';
import { type ListClientsInput } from '@/features/clients/schema';
import { type Locale } from '@/i18n/routing';

/**
 * A plain GET form. Submitting it puts the search term in the URL, which is
 * what the page reads — so a search is a shareable address and this component
 * ships no client JavaScript at all.
 *
 * The sort lives in the URL too, so it rides along as a hidden field —
 * searching a table you have just sorted must not silently throw the sort
 * away. `status` does the same: the page still reads it (a client record can
 * still be archived), it is just no longer a control on this screen.
 */
export function ClientSearch({ input, locale }: { input: ListClientsInput; locale: Locale }) {
  const t = useTranslations('clients');

  return (
    <form method="get" className="flex flex-wrap items-center justify-between gap-3">
      <input type="hidden" name="sort" value={input.sort} />
      <input type="hidden" name="dir" value={input.dir} />
      <input type="hidden" name="status" value={input.status} />

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
          defaultValue={input.q ?? ''}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          className="ps-12"
        />
      </div>

      {/*
        Opens the client card over the list. A `type="button"`, so it never
        submits the search form it sits in.
      */}
      <ClientFormTrigger locale={locale} className={buttonVariants()}>
        <Icon name="addClient" />
        {t('new')}
      </ClientFormTrigger>
    </form>
  );
}
