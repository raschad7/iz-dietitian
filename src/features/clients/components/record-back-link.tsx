'use client';

import { useSearchParams } from 'next/navigation';

import { Icon } from '@/components/ui/icon';
import { Link } from '@/i18n/navigation';

/**
 * The way out of a client's record, back to wherever it was opened from.
 *
 * A record is reached from two screens that both list subscribers, and the way
 * back has to be the one the reader came in by. Somebody working down the Bills
 * table opens a subscriber to look at their money; sending them to the register
 * afterwards drops them on a different list, at the top, with the filters they
 * had set gone — so they walk back to Bills by hand, on every row they check.
 *
 * ## `?from=`, and why the arrival is remembered rather than sniffed
 *
 * The Bills table's name link carries `from=bills`. The alternatives are worse
 * in ways that matter here: `document.referrer` is empty on a hard reload and
 * lies after a redirect, and browser history cannot be read at all. A parameter
 * is honest about what it is — a fact the link brought with it — and it
 * survives a reload, a shared URL and a restored tab, which is exactly when a
 * reader has *no* other way of knowing which list they are heading back to.
 *
 * Anything else, including a missing param and a value from a link somebody
 * hand-edited, is the register. There is no error state: the default is a
 * working way back, not a guess that could be wrong.
 *
 * ## Why this is the only client component in the record's chrome
 *
 * A layout is not handed `searchParams` — only a page is — and the breadcrumb
 * lives in the layout because it frames every view of the record. Reading the
 * param here costs a few lines of browser JavaScript and keeps the rest of the
 * chrome on the server; moving the breadcrumb down into the page to avoid that
 * would mean the shell that positions it moves too.
 */
export function RecordBackLink({
  /** `Back to clients`, and `Return to the bills page`, already translated. */
  labels,
}: {
  labels: { list: string; bills: string };
}) {
  const fromBills = useSearchParams().get('from') === 'bills';

  return (
    <Link
      href={fromBills ? '/app/clients/bills' : '/app/clients'}
      className="inline-flex w-fit items-center gap-1 text-body-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
    >
      <Icon name="chevronStart" className="size-3.5" />
      {fromBills ? labels.bills : labels.list}
    </Link>
  );
}
