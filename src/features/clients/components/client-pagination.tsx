import { useTranslations } from 'next-intl';

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { type ClientListResult } from '@/features/clients/queries';
import { type ListClientsInput } from '@/features/clients/schema';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * The register's pager: a step back, the page you are on, a step forward.
 *
 * A stepper rather than a row of page numbers — see the note on the numeral
 * below for why the register walks where the dish catalogue jumps. That is the
 * one structural difference from `DishPagination`, which is otherwise this same
 * component over a different list and still draws the full `pageWindow`.
 *
 * Built on `@/components/ui/pagination` — the shadcn item, composed the way
 * that file's header describes: every link is a typed `<Link>` handed in
 * through `render`, so the pager keeps client-side navigation and the locale
 * prefix while this file stays a server component with no state and no
 * handlers.
 *
 * **It draws even when there is only one page.** It used to return `null`
 * there, on the reasoning that the heading already gives the total — which is
 * true, and which also meant a clinic under twenty-one clients never saw a
 * pager at all and had no way to tell whether the register had one. A control
 * that vanishes is indistinguishable from a control that is broken. On a single
 * page both steps are inert and the numeral reads `1`, which says "this is all
 * of them" rather more plainly than an empty space does.
 *
 * The empty register is still the exception: `ClientTable` draws its own empty
 * card there, and a pager under it would be a control for moving through
 * nothing.
 */
export function ClientPagination({
  result,
  input,
  basePath = '/app/clients',
  className,
}: {
  result: ClientListResult;
  input: ListClientsInput;
  /** The list this pager belongs to — the register, or the archive. */
  basePath?: '/app/clients' | '/app/clients/archived';
  /**
   * The page positions its own pager — see the register, which pushes it to the
   * foot of the screen with `mt-auto` so it does not ride up under a short last
   * page.
   */
  className?: string;
}) {
  const t = useTranslations('clients');

  if (result.total === 0) return null;

  // Every filter rides along, the sort included — page 2 of a differently
  // ordered list is not the page the reader was on.
  const query = (page: number) => ({
    pathname: basePath,
    query: {
      ...(input.q ? { q: input.q } : {}),
      ...(input.filterBy && input.filterValue
        ? { filterBy: input.filterBy, filterValue: input.filterValue }
        : {}),
      sort: input.sort,
      dir: input.dir,
      page: String(page),
    },
  });

  const atStart = result.page <= 1;
  const atEnd = result.page >= result.pageCount;

  return (
    /*
      The controls alone. This bar used to carry "Showing 1–10 of 17" at its
      inline-start, which is the count the heading above already gives — the
      register's subtitle says "17 clients" — restated with arithmetic nobody
      asked for. What it did add was a *second* place the current page was
      stated, in words, which is how a pager ends up needing a sentence to
      explain what its own highlighted numeral should be saying. The numeral
      says it now (see `PaginationLink`), and it is the only thing that does.

      Centred. It sat at the inline-end while it shared the bar with the
      "showing" line — two things at the two ends of one strip. It is the only
      thing on the bar now, and three controls totalling a couple of hundred
      pixels pushed against one edge of a full-width register read as something
      left over rather than as the way through it. Centred, it is the foot of
      the list.

      `justify-center` on the row and the pager's own `mx-auto` restored, so the
      centring holds whether or not the page hands this a `className`.
    */
    <div
      className={cn('flex shrink-0 flex-wrap items-center justify-center gap-x-4 gap-y-3', className)}
    >
      <Pagination className="w-auto">
        <PaginationContent>
          <PaginationItem>
            {/*
              At the ends there is no page to go to, so there is no link: an
              inert `<span>` rather than a disabled anchor, which is something a
              keyboard reader can land on only to be told it does nothing.
            */}
            <PaginationPrevious
              label={t('pagination.previous')}
              aria-disabled={atStart || undefined}
              className={atStart ? 'pointer-events-none text-muted-foreground/50' : undefined}
              render={atStart ? <span /> : <Link href={query(result.page - 1)} />}
            />
          </PaginationItem>

          {/*
            One numeral: where you are, and nothing else.

            It was a row of reachable page numbers — first, three around the
            reader, last, with `…` for what was elided. That is the right
            control for a catalogue you jump around in, and the wrong one for a
            register you walk: the numbers were five targets that all looked
            alike, and the only one that mattered was the one you were standing
            on.

            So the only page drawn is the current one, and it is never a link —
            it goes nowhere by definition, and `aria-current` on a link that
            reloads the page you are on is a step to nowhere with a focus stop
            attached. Previous and Next are the whole of the movement, and the
            numeral between them is what tells you they worked.

            The count of pages goes with the numbers, which does cost something:
            you can no longer see that there are four pages without stepping to
            the end of them. It survives as the accessible name — `position` is
            "Page 1 of 4" — so the fact is still there for anyone listening to
            the control rather than looking at it.
          */}
          <PaginationItem>
            <PaginationLink
              isActive
              aria-label={t('pagination.position', {
                page: result.page,
                pageCount: result.pageCount,
              })}
              render={<span />}
            >
              {result.page}
            </PaginationLink>
          </PaginationItem>

          <PaginationItem>
            <PaginationNext
              label={t('pagination.next')}
              aria-disabled={atEnd || undefined}
              className={atEnd ? 'pointer-events-none text-muted-foreground/50' : undefined}
              render={atEnd ? <span /> : <Link href={query(result.page + 1)} />}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
