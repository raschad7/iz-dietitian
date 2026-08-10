'use client';

import { useTranslations } from 'next-intl';
import { Children, useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';

/**
 * A list of visits, one page at a time.
 *
 * **Why pages and not a fold or a scroll.** This panel has been all three. Every
 * row at once made a two-year client's record forty rows long and buried the
 * two panels above it. Folding to three with a "show more" answered that by
 * making the card's most prominent control an apology for what it was hiding,
 * and the count in it — "3 more visits" — was a number nobody needed. Scrolling
 * inside the card fixed the page height but put a scroll region inside a
 * scrolling document, which on a trackpad means the page moves when you meant
 * the list to, or nothing moves at all.
 *
 * Pages are the honest shape for a long, uniform, dated list: the card is one
 * fixed height forever, every row is reachable by a control that is always in
 * the same place, and "page 2 of 9" says how much history there is more clearly
 * than any of the alternatives managed to.
 *
 * **The list keeps its height on the last page.** A final page of two rows would
 * otherwise pull the pager up under them, moving the control you are pressing
 * while you press it. `min-h` holds the full box open — five rows at ~56px — so
 * Next and Previous never move.
 *
 * **Nothing is fetched.** The rows are rendered on the server and arrive as
 * children; this component only decides which of them to place. The paging
 * strings are the register's own (`clients.pagination`), because a pager should
 * read the same wherever the product puts one.
 */
export function PaginatedVisits({
  heading,
  perPage,
  children,
}: {
  heading: string;
  /** Rows per page. */
  perPage: number;
  children: React.ReactNode;
}) {
  const t = useTranslations('clients.pagination');
  const [page, setPage] = useState(1);
  const listId = useId();

  const rows = Children.toArray(children);
  const pageCount = Math.max(Math.ceil(rows.length / perPage), 1);

  // Clamped rather than trusted: nothing here can raise the page past the end,
  // but a row list that shrinks under a mounted component would.
  const current = Math.min(page, pageCount);
  const start = (current - 1) * perPage;
  const shown = rows.slice(start, start + perPage);

  return (
    <>
      <CardHeader className="grid-cols-[1fr_auto] items-baseline gap-2">
        <CardTitle>{heading}</CardTitle>
        {/* A bare numeral, not a pill: a count is a quantity, not a state. See
            "A badge is a state" in docs/design-system.md. */}
        <span className="text-body-md font-semibold tabular-nums text-muted-foreground">
          {rows.length}
        </span>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col">
        {/*
          `-mx-2` lets each row's hover fill reach the card's own padding, so a
          row reads as a row rather than as a chip floating inside a box.
          `flex-1` with the minimum below is what makes a short last page hold
          the box open instead of collapsing it.
        */}
        <ul
          id={listId}
          className="-mx-2 min-h-[17.5rem] flex-1 divide-y divide-border/60"
        >
          {shown}
        </ul>

        {pageCount > 1 ? (
          <nav
            aria-label={heading}
            className="mt-2 flex items-center justify-between gap-3 border-t border-border/60 pt-2"
          >
            {/*
              `chevronStart`/`chevronEnd` are logical names and `Icon` mirrors
              them in RTL, so "previous" points right in Arabic without this
              branching on the locale — the direction is expressed once, in the
              icon's name.
            */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              /*
                Black label, not the olive `ghost` draws by default. Olive is
                this system's "act on me" colour, and paging a list of finished
                visits is navigation rather than an action — two olive controls
                at the foot of the card were the strongest colour on a panel
                whose subject is the rows above them. The hover fill still
                answers the pointer, so nothing is lost but the claim.
              */
              className="text-foreground hover:text-foreground"
              onClick={() => setPage(current - 1)}
              disabled={current === 1}
              aria-controls={listId}
            >
              <Icon name="chevronStart" />
              {t('previous')}
            </Button>

            <span className="text-label text-muted-foreground tabular-nums">
              {t('position', { page: current, pageCount })}
            </span>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              /*
                Black label, not the olive `ghost` draws by default. Olive is
                this system's "act on me" colour, and paging a list of finished
                visits is navigation rather than an action — two olive controls
                at the foot of the card were the strongest colour on a panel
                whose subject is the rows above them. The hover fill still
                answers the pointer, so nothing is lost but the claim.
              */
              className="text-foreground hover:text-foreground"
              onClick={() => setPage(current + 1)}
              disabled={current === pageCount}
              aria-controls={listId}
            >
              {t('next')}
              <Icon name="chevronEnd" />
            </Button>
          </nav>
        ) : null}
      </CardContent>
    </>
  );
}
