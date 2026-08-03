import { useTranslations } from 'next-intl';

import { Button, buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ClientFormTrigger } from '@/features/clients/components/client-form-trigger';
import { CLIENT_STATUSES, type ListClientsInput } from '@/features/clients/schema';
import { type Locale } from '@/i18n/routing';

/**
 * A plain GET form. Submitting it puts the filters in the URL, which is what the
 * page reads — so the filtered list is a shareable address and this component
 * ships no client JavaScript at all.
 *
 * Two rows, and the split is by *what the control does to the page*: the search
 * field and the two filter controls narrow the list you are looking at, while
 * "New client" leaves it. Putting them on the same side would make the primary
 * action the last thing in a row of filters and the first thing the eye lands
 * on while scanning them.
 *
 * The sort lives in the URL too, so it rides along as a hidden field — filtering
 * a table you have just sorted must not silently throw the sort away.
 */
export function ClientSearch({ input, locale }: { input: ListClientsInput; locale: Locale }) {
  const t = useTranslations('clients');

  return (
    <form method="get" className="flex flex-col gap-3">
      <input type="hidden" name="sort" value={input.sort} />
      <input type="hidden" name="dir" value={input.dir} />

      {/*
        The glyph is inside the field's box rather than beside it. `relative` on
        the wrapper and `start-4` on the icon keep it on the reading edge in
        both scripts; `ps-12` is what stops the caret from starting underneath
        it — 20px of field padding, a 20px glyph, then the text.
      */}
      <div className="relative">
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Narrowing controls, together, at the inline-start edge. */}
        <div className="flex flex-wrap items-center gap-3">
          <Select name="status" defaultValue={input.status} aria-label={t('fields.status')} className="w-40">
            {CLIENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`status.${status}`)}
              </option>
            ))}
            <option value="all">{t('status.all')}</option>
          </Select>

          <Button type="submit" variant="outline">
            <Icon name="filter" />
            {t('actions.filter')}
          </Button>
        </div>

        {/*
          Opens the client card over the list. A `type="button"`, so it never
          submits the filter form it sits in.
        */}
        <ClientFormTrigger locale={locale} className={buttonVariants()}>
          <Icon name="addClient" />
          {t('new')}
        </ClientFormTrigger>
      </div>
    </form>
  );
}
