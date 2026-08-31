'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { SelectField } from '@/components/ui/select-field';
import {
  BILLS_FILTERS,
  CLIENT_FILTER_VALUES,
  REGISTER_FILTERS,
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
 * **The chooser is back, because there are two columns again.** It went when
 * the list was down to one — a `<select>` of one option is not a choice — and
 * the note left in its place said that a second column meant bringing it back
 * rather than stacking another row here. `weeklyProgress` is that second column:
 * where a client stands in the plan period they are currently on, which is the
 * other thing a name cannot answer. So the popover is two rows again — the
 * question, then its answers — and the URL carries the pair it always carried.
 *
 * **`plan` is the third column, and it is the flatter question underneath the
 * second.** Whether a client has a nutrition plan on file at all, rather than
 * how they are doing inside the one running now — the list a dietitian clears
 * down after intake. See `PLAN_FILTER_VALUES` in the schema for why that is not
 * the same list as `weeklyProgress`'s `noPlan`.
 *
 * **One filter at a time, still.** Two rows here would be two filters ANDed
 * together, which is a saved-view feature and a different screen; this register
 * is read by someone looking for one thing. It also stays a popover rather than
 * becoming chips in the toolbar — it is a question you go and ask, not one the
 * toolbar should put in front of you every day.
 *
 * ⚠ The answers are **per column**, so switching the column has to reset the
 * value: `no` is an answer to portal access and means nothing to progress, and a
 * value the column does not offer is one the query drops on the floor. See
 * `chooseColumn` below.
 *
 * ⚠ **Weekly progress has no answers row**, and it is the only column that does
 * not. Choosing it and pressing Apply filters on `reported` — the first of
 * `WEEKLY_PROGRESS_VALUES` — so the register shows the clients who have logged
 * something in the plan period they are currently on. The other two answers,
 * `notReported` and `noPlan`, are still validated and still applied when a URL
 * names them; this popover simply does not offer a way to pick them. Portal
 * access keeps its row, because "has access" and "no access" are equally the
 * question a reader means.
 *
 * Applying replaces rather than pushes, like the search field beside it: a
 * filter is where you are, not somewhere you went, and the back button should
 * leave the register rather than walk back through four attempts at one.
 */
/**
 * Each column's own label key, spelled out rather than built as
 * `filter.${column}.label`.
 *
 * `useTranslations` checks its argument against the catalogue at compile time,
 * and a template literal over a union produces every combination — including
 * the ones that do not exist. Writing the keys out is what keeps a typo here a
 * type error rather than a blank label at runtime.
 */
const COLUMN_LABEL = {
  portalAccess: 'filter.portalAccess.label',
  weeklyProgress: 'filter.weeklyProgress.label',
  plan: 'filter.plan.label',
  paymentStatus: 'filter.paymentStatus.label',
  subscription: 'filter.subscription.label',
} as const satisfies Record<ClientFilter, string>;

/**
 * Every answer's own label key, written out for the same reason the column
 * labels above are: a template literal over two unions produces the whole
 * product, most of which is not in the catalogue.
 *
 * The keys mirror `CLIENT_FILTER_VALUES` exactly — `satisfies` is what says so,
 * so an answer added to the schema without a label here is a type error rather
 * than an empty row in the select.
 */
const VALUE_LABEL = {
  portalAccess: {
    yes: 'filter.portalAccess.yes',
    no: 'filter.portalAccess.no',
  },
  weeklyProgress: {
    reported: 'filter.weeklyProgress.reported',
    notReported: 'filter.weeklyProgress.notReported',
    noPlan: 'filter.weeklyProgress.noPlan',
  },
  plan: {
    has: 'filter.plan.has',
    none: 'filter.plan.none',
  },
  paymentStatus: {
    unpaid: 'filter.paymentStatus.unpaid',
    partial: 'filter.paymentStatus.partial',
    paid: 'filter.paymentStatus.paid',
    none: 'filter.paymentStatus.none',
  },
  subscription: {
    active: 'filter.subscription.active',
    expired: 'filter.subscription.expired',
    none: 'filter.subscription.none',
  },
} as const satisfies {
  [K in ClientFilter]: Record<(typeof CLIENT_FILTER_VALUES)[K][number], string>;
};

/**
 * Which screen's columns this popover offers.
 *
 * The two screens list the same people and are read for different reasons —
 * see `BILLS_FILTERS` in the schema for what Bills asks and why the register's
 * two columns are not it. A prop rather than a pathname read, matching
 * `ClientSearch`, which is the component that knows which screen it is on.
 */
export type ClientFilterVariant = 'register' | 'bills';

const VARIANT_COLUMNS: Record<ClientFilterVariant, readonly [ClientFilter, ...ClientFilter[]]> = {
  register: REGISTER_FILTERS,
  bills: BILLS_FILTERS,
};

/**
 * Whether a column asks the reader which of its answers they mean.
 *
 * All of them except weekly progress, which applies its first answer and shows
 * no row for it — see the ⚠ on the component above for what that means and why
 * the other two answers still exist.
 */
function hasAnswersRow(column: ClientFilter): boolean {
  return column !== 'weeklyProgress';
}

export function ClientFilterMenu({
  input,
  variant = 'register',
}: {
  input: ListClientsInput;
  variant?: ClientFilterVariant;
}) {
  const columns = VARIANT_COLUMNS[variant];

  /**
   * The column the URL names, if this screen offers it.
   *
   * One enum spans both screens — see `CLIENT_FILTERS` — so a link carrying the
   * register's filter can land on Bills. The list under it is filtered by
   * whatever the query says, which is right and is the register's own answer to
   * a stale parameter; what would be wrong is this popover opening on a column
   * it does not list, which is a select showing a value none of its options
   * hold. It falls back to this screen's first column instead.
   */
  const applied = input.filterBy && columns.includes(input.filterBy) ? input.filterBy : undefined;

  /**
   * The answer a freshly opened popover shows for a column: its first one.
   *
   * Takes the column rather than reading state, because it is called while
   * seeding — before there is any state to read — from both the initial value
   * and every reopening.
   */
  function defaultValue(column: ClientFilter | undefined): string {
    return CLIENT_FILTER_VALUES[column ?? columns[0]][0];
  }

  const t = useTranslations('clients');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [open, setOpen] = useState(false);

  /*
    Seeded from the URL every time the popover opens rather than held across
    openings: what is on screen is the truth, and a draft that outlived a
    "Clear" would offer to re-apply a filter the reader had just removed.

    The default is the first answer of the first column rather than blank,
    because both controls are `<select>`s and a select with nothing chosen is a
    control with nothing to apply. Neither is read until Apply is pressed.
  */
  const [column, setColumn] = useState<ClientFilter>(applied ?? columns[0]);
  const [value, setValue] = useState((applied && input.filterValue) || defaultValue(applied));

  function reset(next: boolean) {
    if (next) {
      setColumn(applied ?? columns[0]);
      setValue((applied && input.filterValue) || defaultValue(applied));
    }
    setOpen(next);
  }

  /**
   * Switching the question throws away the answer, on purpose.
   *
   * The two columns share no values — `no` belongs to portal access, `noPlan` to
   * progress — so carrying the old one across would leave the select showing a
   * value its own options do not contain, and applying it would send the query a
   * value it discards. The first answer of the new column is what a select with
   * something chosen has to be.
   */
  function chooseColumn(next: string) {
    const chosen = next as ClientFilter;
    setColumn(chosen);
    setValue(CLIENT_FILTER_VALUES[chosen][0]);
  }

  /*
    What Apply sends. The state for a column with an answers row, its first
    answer for one without — a column whose row is not on screen must not apply
    whatever was left in `value` by the column before it.
  */
  const appliedValue = hasAnswersRow(column) ? value : CLIENT_FILTER_VALUES[column][0];

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
    next.set('filterBy', column);
    next.set('filterValue', appliedValue);

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
            The question, and — for the one column that asks it — its answers.
            The answers row's label is the column's own name rather than a
            generic "Matching", so the pair reads as one sentence: "Portal
            access" over "Has access".
          */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="client-filter-by" className="text-body-sm text-muted-foreground">
              {t('filter.column')}
            </label>

            <SelectField
              id="client-filter-by"
              size="sm"
              value={column}
              onValueChange={chooseColumn}
              className="ps-4 text-start"
              options={columns.map((option) => ({
                value: option,
                label: t(COLUMN_LABEL[option]),
              }))}
            />
          </div>

          {hasAnswersRow(column) ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="client-filter-value" className="text-body-sm text-muted-foreground">
                {t(COLUMN_LABEL[column])}
              </label>

              <SelectField
                id="client-filter-value"
                size="sm"
                value={value}
                onValueChange={setValue}
                className="ps-4 text-start"
                /* The chosen column's own answers, from the same list the query
                   validates against — see `CLIENT_FILTER_VALUES`. */
                options={CLIENT_FILTER_VALUES[column].map((option) => ({
                  value: option as string,
                  label: t(VALUE_LABEL[column][option as never]),
                }))}
              />
            </div>
          ) : null}

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
