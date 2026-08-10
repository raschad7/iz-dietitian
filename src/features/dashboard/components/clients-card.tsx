import { getTranslations } from 'next-intl/server';

import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '@/components/ui/table';
import { formatMediumDate, formatMinute } from '@/features/booking/format';
import { calculateAge } from '@/features/clients/age';
import { ClientFormTrigger } from '@/features/clients/components/client-form-trigger';
import { type DashboardClient } from '@/features/dashboard/queries';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

type ClientsCardProps = {
  clients: DashboardClient[];
  locale: Locale;
};

/**
 * The register, newest first — the card that replaced the monthly visit
 * histogram.
 *
 * The histogram answered "how busy have we been?", which is a question you ask
 * once a quarter, with a chart you had to hover to read. This answers "who is
 * on my list, and when do I next see them?" — which is the question that
 * actually starts a working day, and every row is a way into that person's
 * record.
 *
 * The rows are plain surfaces rather than nested `Card`s: this panel is already
 * the card, and a stack of cards inside it would double every ring and shadow
 * down the list. Rows are separated with a hairline (`divide-y`) rather than
 * individual borders, so the rule sits once between each pair rather than
 * doubling at the edges.
 *
 * **A row is text in three columns, not a portrait.** The avatar went because a
 * coloured initial identifies someone you already know by sight, and this list
 * is read by someone who needs to *reach* them — so the space it held now
 * carries the age and the phone number, the two facts you would otherwise open
 * the record for. Both columns are held open by a dash when the record is
 * missing them, because a column that disappears on some rows is a column you
 * have to re-find on every one.
 *
 * **A row is built to the register's own row** — the same padding, the same
 * hover tint, the same height floor as `ClientTable` on `/app/clients`. Two
 * views of one list should not have two rhythms; the differences that remain
 * are the ones that carry information (this one is three columns, not six, and
 * it hangs a next-visit line under them).
 *
 * **The list scrolls inside the card, never the page.** At `xl` and up the
 * list is `flex-1`/`min-h-0` inside the card, which is already bounded by the
 * one-screen dashboard layout (see `src/app/[locale]/app/page.tsx`). Below
 * `xl` that chain has nothing to bound it against — the page is allowed to
 * scroll there — so the list instead carries its own `max-h-80` as a ceiling:
 * with up to `RECENT_CLIENTS` rows, the card would otherwise be the tallest
 * thing on the page and drag the whole page down with it just to show a list
 * that has its own scrollbar for exactly this reason.
 */
export async function ClientsCard({ clients, locale }: ClientsCardProps) {
  const [t, tc] = await Promise.all([
    getTranslations('dashboard.clients'),
    getTranslations('clients'),
  ]);

  return (
    <Card className="min-h-0 xl:h-full">
      <CardHeader className="shrink-0 grid-cols-[auto_1fr] items-center gap-2">
        {/* Static. The card is not a target — its rows are — so the disc has
            nothing to promise and stays neutral whatever the pointer does. */}
        <span className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon name="clients" className="size-4" />
        </span>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        {clients.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border p-4">
            <Icon name="clients" className="size-6 text-muted-foreground" />
            <p className="text-body-md text-muted-foreground">{t('empty')}</p>
            <ClientFormTrigger
              locale={locale}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <Icon name="addClient" />
              {t('emptyCta')}
            </ClientFormTrigger>
          </div>
        ) : (
          <>
            {/*
              This list is a thinner read of the register on `/app/clients`, so
              it is the same `Table`, not a grid that imitates one. It used to
              be a `div` header strip over a `ul` of three-column `Link`s,
              carrying its own copy of the strip's `rounded-[10px]`, the row's
              `px-3 py-2.5`, its hover tint and a `min-h` hand-computed to match
              the register's row height — five values kept in sync by a comment
              asking the next reader to please keep them in sync. They are one
              component now, and the two views of the same people cannot drift.

              `max-h-80` is the fallback ceiling for below `xl`, where nothing
              else bounds this list's height — `xl:max-h-none` hands sizing back
              to the `flex-1`/`min-h-0` chain once the card itself is bounded by
              the one-screen layout.

              **No `overscroll-contain`.** It used to be here to stop a flick at
              the end of the list carrying on into the shell, and the cost of
              that turned out to be the whole page: containment is a property of
              the box, not of whether the box can currently scroll, so a
              register short enough to fit — four clients, most days — became a
              hole the wheel fell into. It could not scroll itself and it would
              not let the page scroll either. A list that runs past its ceiling
              still stops at its own end first; only what happens *after* that
              changes, and chaining is what every other surface in the app does.
            */}
            <TableRoot className="max-h-80 overflow-y-auto xl:max-h-none xl:min-h-0 xl:flex-1">
              {/*
                `table-fixed` with `w-1/3` heads is what the old `grid-cols-3`
                guaranteed: exactly a third each, so one long name cannot
                squeeze the figures beside it. It is also what makes `truncate`
                work in a cell — auto layout treats a percentage as a hint and
                widens the column to fit instead of clipping.
              */}
              <Table className="table-fixed text-body-sm">
                {/* A header that scrolls away with the rows it names is not a header. */}
                <TableHeader sticky>
                  <TableRow>
                    <TableHead className="w-1/3">{tc('fields.fullName')}</TableHead>
                    <TableHead className="w-1/3">{tc('fields.age')}</TableHead>
                    <TableHead className="w-1/3">{tc('fields.phone')}</TableHead>
                  </TableRow>
                </TableHeader>

                {clients.map((client) => {
                  // Same rule as the client record's own profile card: a
                  // corrupt or implausible birth date reads as no age at all
                  // rather than as a number nobody can explain.
                  const age = client.dateOfBirth ? calculateAge(client.dateOfBirth) : null;

                  return (
                    /*
                      One `<tbody>` per client rather than one per table: the
                      next-visit line spans all three columns, which is a second
                      `<tr>`, and `<tbody linked>` is what makes the pair hover
                      as one row and share the stretched link. See `TableBody`.
                    */
                    <TableBody key={client.id} linked className="border-t border-border">
                      <TableRow className="border-t-0 hover:bg-transparent">
                        <TableCell className="font-medium">
                          {/*
                            `after:absolute after:inset-0` stretches this link
                            over the whole `<tbody>` — the three columns and the
                            next-visit line under them. The focus ring stays on
                            the name rather than on the stretched `::after`, so
                            a keyboard reader can see which row they are on.
                          */}
                          <Link
                            href={`/app/clients/${client.id}`}
                            dir="auto"
                            className={cn(
                              'block truncate rounded-sm underline-offset-4',
                              'after:absolute after:inset-0 after:content-[""]',
                              'focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2',
                            )}
                          >
                            {client.fullName}
                          </Link>
                        </TableCell>

                        <TableCell className="truncate tabular text-muted-foreground">
                          {age === null ? <Missing /> : tc('yearsOld', { count: age })}
                        </TableCell>

                        {/*
                          The cell keeps the page's direction so the number sits
                          at the column's inline-start like its two neighbours;
                          `dir` on the inner span isolates the digits and runs
                          them left-to-right, which is how a phone number is
                          read in both locales — letting it inherit the Arabic
                          direction moves a leading `+` to the wrong end of it.
                        */}
                        <TableCell className="truncate tabular text-muted-foreground">
                          {client.phone ? <span dir="ltr">{client.phone}</span> : <Missing />}
                        </TableCell>
                      </TableRow>

                      {/*
                        The next visit runs under all three, when there is one.
                        Nothing at all when there is not — "Nothing booked"
                        repeated down the list said the same non-fact about most
                        of the register and gave every row a line to read past.

                        `pt-0` closes the gap the first row's own block-end
                        padding already left, so the two lines read as one row
                        rather than as two.
                      */}
                      {client.nextVisit ? (
                        <TableRow className="border-t-0 hover:bg-transparent">
                          <TableCell colSpan={3} className="truncate pt-0 text-muted-foreground">
                            {t('nextVisit', {
                              when: `${formatMediumDate(locale, client.nextVisit.date)} · ${formatMinute(
                                locale,
                                client.nextVisit.date,
                                client.nextVisit.startMinute,
                              )}`,
                            })}
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  );
                })}
              </Table>
            </TableRoot>

            <Link
              href="/app/clients"
              className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'shrink-0 self-start')}
            >
              {t('viewAll')}
              <Icon name="chevronEnd" />
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * A column held open with nothing in it.
 *
 * `aria-hidden`, because the dash is a ruling device: a screen reader
 * announcing "dash" between a name and a phone number is worse than the
 * silence of an empty cell, and "not recorded" said out loud on every second
 * row would bury the rows that do have the number.
 */
function Missing() {
  return (
    <span aria-hidden className="text-muted-foreground/60">
      —
    </span>
  );
}
