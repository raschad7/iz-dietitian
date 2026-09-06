'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';

import { Button, buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Link, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

import { hrefFor, submitterOf } from './query-form';

/**
 * The filter strip above every platform table.
 *
 * ## Why the state lives in the URL
 *
 * A `method="get"` form, so every filter is a query parameter. That is not
 * nostalgia — it is what makes a filtered view something an operator can
 * bookmark, send to themselves, and step back out of with the browser's own back
 * button. It also means the filtering happens in SQL, where it bounds the read,
 * rather than in the render where it would only bound what is drawn.
 *
 * The panel this replaces had a search box on three screens, each needing a
 * click on a button beside it, and no filters at all.
 *
 * ## Why it is a client component anyway
 *
 * One reason: a `<select>` that changes should apply immediately. Research on
 * operator tools is consistent that filters belong above the table and take
 * effect on change — a dropdown that silently does nothing until you find the
 * Apply button is a dropdown people set and then wonder about.
 *
 * The text field is the exception and still needs Enter or the button: applying
 * on every keystroke would issue a request per character. So the button stays,
 * and it is the search field's submit rather than decoration.
 *
 * ## It degrades
 *
 * Without JavaScript this is a plain GET form with a submit button, and every
 * control still works. The `onChange` handler is an accelerator, not the
 * mechanism, and so is the `onSubmit` below.
 *
 * ## ⚠ Applying a filter is a router push, not a document load
 *
 * It used to let the browser submit, which throws the running page away and
 * fetches a whole new document — and a fresh document with no `Cache-Control`
 * reads to `SplashLaunchGate` as the application starting, so narrowing a table
 * played the launch screen over it. Pushing through the router keeps the shell,
 * keeps the scroll position, and re-renders only the tree that changed. See
 * `QueryForm`, which does the same thing for the range picker and the search
 * box and owns the URL arithmetic both share.
 */
export function AdminToolbar({
  action,
  path,
  children,
  searchName = 'q',
  searchValue,
  searchLabel,
  /** Parameters to carry across a submit — a range picker the filters share a URL with. */
  keep,
  hasFilters = false,
}: {
  /** Where the form posts without JavaScript — locale-prefixed. */
  action: string;
  /** The same screen, locale-less, for the router. See `QueryForm`. */
  path: string;
  children?: React.ReactNode;
  searchName?: string;
  searchValue?: string;
  searchLabel: string;
  keep?: Record<string, string | undefined>;
  /** Whether anything is currently narrowing the list, so "clear" can be offered. */
  hasFilters?: boolean;
}) {
  const t = useTranslations('admin.filters');
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      method="get"
      action={action}
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        router.push(hrefFor(path, event.currentTarget, submitterOf(event)));
      }}
      /*
        Any change to a select applies at once. The handler is on the form rather
        than on each control so a filter added to `children` inherits it without
        having to remember — the failure mode being a new dropdown that quietly
        does nothing.

        `requestSubmit` rather than `submit`: it runs the `onSubmit` above, so a
        dropdown navigates the same way the button does. `submit()` would bypass
        the handler and take the document reload this component exists to avoid.

        Text inputs are excluded: they submit on Enter or on the button.
      */
      onChange={(event) => {
        if (event.target instanceof HTMLSelectElement) formRef.current?.requestSubmit();
      }}
    >
      {/*
        Paging is reset by every filter change, and that is deliberate: page 4 of
        an unfiltered list is not page 4 of a filtered one, and landing on an
        empty page after narrowing a search is the most common way a table
        appears broken. Omitting the parameter is how it resets.
      */}
      {Object.entries(keep ?? {}).map(([name, value]) =>
        value ? <input key={name} type="hidden" name={name} value={value} /> : null,
      )}

      <div className="min-w-0 flex-1 basis-64">
        <Input
          type="search"
          name={searchName}
          defaultValue={searchValue ?? ''}
          aria-label={searchLabel}
          placeholder={searchLabel}
        />
      </div>

      {children}

      <Button type="submit" variant="neutral">
        <Icon name="search" className="size-4" aria-hidden />
        {t('apply')}
      </Button>

      {hasFilters ? (
        /*
          A link, not a reset button. `type="reset"` restores the form's
          *rendered* defaults, which are the filters currently applied — so it
          would appear to do nothing. Clearing means going to the bare path.

          Styled with `buttonVariants` rather than rendered through `Button`:
          Base UI's Button warns when it renders anything but a real `<button>`,
          and the app already does it this way on the error and 404 screens.

          The app's own `Link`, so clearing is a client-side navigation like
          applying — a bare `<a>` here was one more way to reload the document
          and replay the launch screen.
        */
        <Link href={path} className={buttonVariants({ variant: 'ghost' })}>
          {t('clear')}
        </Link>
      ) : null}
    </form>
  );
}

/**
 * One dropdown in the strip.
 *
 * A native `<select>`, not the product's `Select`. Three reasons, the same ones
 * `shared-food-form.tsx` gives: the options are a closed list of short words,
 * the native control is keyboard- and screen-reader-correct in both directions
 * with no portal, and — the one that decides it — a native select posts its
 * value with the GET form. A portalled listbox would have to shadow its value
 * into a hidden input to do the same.
 */
export function FilterSelect({
  name,
  label,
  value,
  options,
  className,
}: {
  name: string;
  label: string;
  value?: string;
  /** `value: ''` is the "any" row, and it must come first. */
  options: readonly { value: string; label: string }[];
  className?: string;
}) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-caption text-muted-foreground">{label}</span>
      <select
        name={name}
        defaultValue={value ?? ''}
        className="h-10 min-w-32 rounded-md border border-input bg-background px-3 text-body-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
