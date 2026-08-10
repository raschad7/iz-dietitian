'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { SelectField } from '@/components/ui/select-field';
import {
  CLIENT_FILTERS,
  PORTAL_ACCESS_VALUES,
  type ClientFilter,
  type ListClientsInput,
} from '@/features/clients/schema';
import { usePathname, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * The register's filter, beside the search field.
 *
 * **Search and filter are two different questions, and this screen used to
 * answer both with one box.** The field matched name, phone *and* email at
 * once, so "05" returned everyone whose number contains it plus whoever has it
 * in their address, and there was no way to say which you meant. The field is
 * the name now; every other column is filtered here, one at a time, with a
 * value you choose rather than a term the query guesses at.
 *
 * **Pick the column, then the value.** The column selector is a real `<select>`
 * — a chooser of four things, in a popover, with the mobile picker and the
 * keyboard behaviour already written — and the control under it changes to suit
 * what was picked: a text box for phone and email, a fixed set for status and
 * portal access. That is why this is a popover rather than a row of chips in
 * the toolbar: a second control that only makes sense once the first is
 * answered should not sit permanently in a row you read past every day.
 *
 * **Status is not one of the columns.** It was — "Status → All" was how an
 * archived client used to be found — and it is gone because archived clients
 * have a page of their own now. A place beats a filter for a list you either
 * are or are not looking at: it can be linked to, it says what it is at the
 * top, and it puts Restore in front of you rather than leaving you to spot
 * which rows are grey.
 *
 * Applying replaces rather than pushes, like the search field beside it: a
 * filter is where you are, not somewhere you went, and the back button should
 * leave the register rather than walk back through four attempts at one.
 */

/**
 * The choices offered for each column that has a fixed set of them. Phone and
 * email are absent because they take a term, not a choice.
 *
 * Left with its literal types rather than widened to `string[]`: the labels are
 * looked up as `filter.portalAccess.${option}`, and a widened union would make
 * that a message key the catalogue cannot promise exists.
 */
const VALUE_OPTIONS = {
  portalAccess: PORTAL_ACCESS_VALUES,
} as const;

function hasOptions(column: ClientFilter): column is keyof typeof VALUE_OPTIONS {
  return column in VALUE_OPTIONS;
}

export function ClientFilterMenu({ input }: { input: ListClientsInput }) {
  const t = useTranslations('clients');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [open, setOpen] = useState(false);

  /*
    Seeded from the URL every time the popover opens rather than held across
    openings: what is on screen is the truth, and a draft that outlived a
    "Clear" would offer to re-apply a filter the reader had just removed.
  */
  const [column, setColumn] = useState<ClientFilter>(input.filterBy ?? 'phone');
  const [value, setValue] = useState(input.filterValue ?? '');

  function reset(next: boolean) {
    if (next) {
      setColumn(input.filterBy ?? 'phone');
      setValue(input.filterValue ?? '');
    }
    setOpen(next);
  }

  /** The default a column starts on when it has a fixed set and nothing chosen. */
  function firstOption(next: ClientFilter): string {
    return hasOptions(next) ? VALUE_OPTIONS[next][0] : '';
  }

  function handleColumn(next: ClientFilter) {
    setColumn(next);
    // A phone number is not a status, so a value carried over from the previous
    // column would be applied to a column that cannot mean it.
    setValue(next === input.filterBy ? (input.filterValue ?? firstOption(next)) : firstOption(next));
  }

  function navigate(params: URLSearchParams) {
    // A new filter always starts back at page 1 — page 3 of a differently
    // filtered list is not the page the reader meant.
    params.delete('page');
    router.replace(`${pathname}?${params.toString()}`);
    setOpen(false);
  }

  function apply(event: FormEvent) {
    event.preventDefault();

    const next = new URLSearchParams(searchParams);
    if (value.trim()) {
      next.set('filterBy', column);
      next.set('filterValue', value.trim());
    } else {
      // A column with nothing in it filters nothing, so it is not a filter.
      next.delete('filterBy');
      next.delete('filterValue');
    }

    navigate(next);
  }

  function clear() {
    const next = new URLSearchParams(searchParams);
    next.delete('filterBy');
    next.delete('filterValue');
    navigate(next);
  }

  const active = Boolean(input.filterBy && input.filterValue);

  /** The chosen column's fixed choices, already labelled. */
  const valueOptions =
    column === 'portalAccess'
      ? PORTAL_ACCESS_VALUES.map((option) => ({
          value: option,
          label: t(`filter.portalAccess.${option}`),
        }))
      : null;

  return (
    <Popover open={open} onOpenChange={reset}>
      {/*
        `neutral`: this row has exactly one action — "New client" — and this is
        merely available beside it. A box, a black label, and the warm neutral
        accent under the pointer.
      */}
      <PopoverTrigger
        className={cn(buttonVariants({ variant: 'neutral' }), active && 'border-primary text-primary')}
      >
        <Icon name="filter" />
        {t('filter.trigger')}
        {/* The count is always one — what it says is that a filter is on at
            all, which the trigger has no other way to show once the popover
            is closed. */}
        {active ? (
          <span className="flex size-5 items-center justify-center rounded-full bg-primary text-caption text-primary-foreground">
            1
          </span>
        ) : null}
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 gap-4 p-4">
        <PopoverTitle className="font-heading text-body-md font-semibold">
          {t('filter.title')}
        </PopoverTitle>

        <form onSubmit={apply} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="client-filter-column" className="text-caption text-muted-foreground">
              {t('filter.column')}
            </label>
            <SelectField
              id="client-filter-column"
              size="sm"
              value={column}
              onValueChange={(next) => handleColumn(next as ClientFilter)}
              className="ps-4"
              options={CLIENT_FILTERS.map((option) => ({
                value: option,
                label: t(`fields.${option}`),
              }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="client-filter-value" className="text-caption text-muted-foreground">
              {t('filter.value')}
            </label>

            {valueOptions ? (
              <SelectField
                id="client-filter-value"
                size="sm"
                value={value}
                onValueChange={setValue}
                className="ps-4"
                options={valueOptions}
              />
            ) : (
              <Input
                id="client-filter-value"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder={t('filter.contains')}
                // The value is read left-to-right in both locales, like the
                // column it searches — see the note in `ClientTable`.
                dir="ltr"
                className="h-10 px-4"
                autoComplete="off"
              />
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            {/* Only offered when there is something to clear — a disabled
                control here would be a third button in a two-button row. */}
            {active ? (
              <Button type="button" variant="ghost" size="sm" onClick={clear}>
                {t('filter.clear')}
              </Button>
            ) : (
              <span />
            )}

            <Button type="submit" size="sm">
              {t('filter.apply')}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
