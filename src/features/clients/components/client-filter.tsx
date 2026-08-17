'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { SelectField } from '@/components/ui/select-field';
import { PORTAL_ACCESS_VALUES, type ListClientsInput } from '@/features/clients/schema';
import { usePathname, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * The register's filter, beside the search field.
 *
 * **Search and filter are two different questions, and this screen used to
 * answer both with one box.** The field matched name, phone *and* email at
 * once, so "05" returned everyone whose number contains it plus whoever has it
 * in their address, and there was no way to say which you meant. The field is
 * the name now, and this is the one thing a name cannot answer: whether a
 * client has a portal login.
 *
 * **It is one question with two answers.** It used to be a chooser — pick a
 * column, then give it a value — over four columns, with the control underneath
 * changing shape to suit: a text box for phone and email, a fixed set for
 * status and portal access. Those columns have gone one at a time and the
 * chooser went with the last of them:
 *
 * - **Status** was how an archived client used to be found, and archived clients
 *   have a page of their own now. A place beats a filter for a list you either
 *   are or are not looking at: it can be linked to, it says what it is at the
 *   top, and it puts Restore in front of you rather than leaving you to spot
 *   which rows are grey.
 * - **Phone and email** were substring matches on two columns nobody looks a
 *   register up by, and they were the only free-text filters — so the text
 *   input, the "Contains…" placeholder and the branch choosing between the two
 *   shapes all existed for them alone.
 *
 * A `<select>` of one option is not a choice, so with one column left the column
 * row is gone and what is left is the value: has access, or has not. That is
 * also why this stays a popover rather than becoming a pair of chips in the
 * toolbar — it is still a question you go and ask, not one the toolbar should
 * put in front of you every day.
 *
 * ⚠ Adding a second filter column means bringing the chooser back, not stacking
 * another row here. `CLIENT_FILTERS` is still an array for that reason, and the
 * URL still carries `filterBy` alongside `filterValue`.
 *
 * Applying replaces rather than pushes, like the search field beside it: a
 * filter is where you are, not somewhere you went, and the back button should
 * leave the register rather than walk back through four attempts at one.
 */
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

    The default is the first of the two answers rather than blank, because the
    control is a `<select>` and a select with nothing chosen is a control with
    nothing to apply. Its value is only read once Apply is pressed.
  */
  const [value, setValue] = useState(input.filterValue ?? PORTAL_ACCESS_VALUES[0]);

  function reset(next: boolean) {
    if (next) setValue(input.filterValue ?? PORTAL_ACCESS_VALUES[0]);
    setOpen(next);
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
    // Both, always, and in that order: `filterValue` without `filterBy` is a
    // value with no column to apply it to, which the query reads as no filter.
    next.set('filterBy', 'portalAccess');
    next.set('filterValue', value);

    navigate(next);
  }

  function clear() {
    const next = new URLSearchParams(searchParams);
    next.delete('filterBy');
    next.delete('filterValue');
    navigate(next);
  }

  const active = Boolean(input.filterBy && input.filterValue);

  return (
    <Popover open={open} onOpenChange={reset}>
      {/*
        `neutral`: this row has exactly one action — "New client" — and this is
        merely available beside it. A box, a black label, and the warm neutral
        accent under the pointer.
      */}
      <PopoverTrigger
        /*
          A glyph on a phone, a labelled button from `sm` — matching the three
          controls it shares the row with. See the note on the toolbar in
          `ClientSearch` for why the label goes `sr-only` rather than being
          removed outright.
        */
        className={cn(
          buttonVariants({ variant: 'neutral' }),
          // A third of the row below `lg`, its own width above it — see the
          // note on the group in `ClientSearch`.
          'flex-1 max-sm:px-0 lg:flex-none',
          active && 'border-primary text-primary',
        )}
      >
        <Icon name="filter" />
        <span className="sr-only sm:not-sr-only">{t('filter.trigger')}</span>
        {/* The count is always one — what it says is that a filter is on at
            all, which the trigger has no other way to show once the popover
            is closed.

            Gone on a phone, where the box is a 48px square with a glyph in it
            and a second mark beside it has nowhere to go. Nothing is lost:
            `border-primary text-primary` above already turns the whole control
            olive when a filter is on, at every width. */}
        {active ? (
          <span className="flex size-5 items-center justify-center rounded-full bg-primary text-caption text-primary-foreground max-sm:hidden">
            1
          </span>
        ) : null}
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 gap-4 p-4 text-start">
        <PopoverTitle className="font-heading text-body-md font-semibold">
          {t('filter.title')}
        </PopoverTitle>

        <form onSubmit={apply} className="flex flex-col gap-3">
          {/*
            One field, labelled with the question rather than with "Matching".

            The label used to be `filter.value` — a generic word, because the row
            above it was what said which column was being matched. With that row
            gone the label has to carry the column itself, so it names it:
            "Portal access", then "Has access" / "No access" under it.
          */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="client-filter-value" className="text-body-sm text-muted-foreground">
              {t('filter.portalAccess.label')}
            </label>

            <SelectField
              id="client-filter-value"
              size="sm"
              value={value}
              onValueChange={setValue}
              className="ps-4 text-start"
              options={PORTAL_ACCESS_VALUES.map((option) => ({
                value: option,
                label: t(`filter.portalAccess.${option}`),
              }))}
            />
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
