import { getTranslations } from 'next-intl/server';

import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
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
 * The rows are plain surfaces rather than nested `Card`s: this panel already
 * carries the Arc, and **one tail per surface** (docs/design-system.md). Rows
 * are separated with a hairline (`divide-y`) rather than individual borders,
 * so the rule sits once between each pair rather than doubling at the edges.
 *
 * **A row is text in three columns, not a portrait.** The avatar went because a
 * coloured initial identifies someone you already know by sight, and this list
 * is read by someone who needs to *reach* them — so the space it held now
 * carries the age and the phone number, the two facts you would otherwise open
 * the record for. Both columns are held open by a dash when the record is
 * missing them, because a column that disappears on some rows is a column you
 * have to re-find on every one. `min-h-16` sets the floor, so a client with
 * nothing booked still gets a row you can hit.
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
        {/* Neutral at rest; the disc fills olive and the glyph goes white
            under the pointer. That is the card's whole hover response — see
            the `interactive` variant in ui/card.tsx. */}
        <span className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors group-hover/card:bg-primary group-hover/card:text-primary-foreground">
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
              `pe-1` leaves the scrollbar somewhere to sit that is not on top of
              the card's tail; `overscroll-contain` stops a flick at the end of
              the list from scrolling the shell behind it.

              `max-h-80` is the fallback ceiling for below `xl`, where nothing
              else bounds this list's height — `xl:max-h-none` hands sizing
              back to the `flex-1`/`min-h-0` chain once the card itself is
              bounded by the one-screen layout.
            */}
            <ul className="flex max-h-80 flex-col divide-y divide-border overflow-y-auto overscroll-contain pe-1 xl:max-h-none xl:min-h-0 xl:flex-1">
              {clients.map((client) => {
                // Same rule as the client record's own profile card: a
                // corrupt or implausible birth date reads as no age at all
                // rather than as a number nobody can explain.
                const age = client.dateOfBirth ? calculateAge(client.dateOfBirth) : null;

                return (
                  <li key={client.id}>
                    {/*
                      Three equal columns — `grid-cols-3` is
                      `repeat(3, minmax(0,1fr))`, so each takes exactly a third
                      and one long name cannot squeeze the figures beside it.
                      Every cell starts at its own inline-start edge, which is
                      the left in English and the right in Arabic with no
                      per-locale branch; the square corners on the hover fill
                      keep the three columns reading as one ruled row rather
                      than as a pill floating inside the list.
                    */}
                    <Link
                      href={`/app/clients/${client.id}`}
                      className="grid min-h-16 grid-cols-3 items-center gap-x-3 gap-y-0.5 px-2 py-2.5 text-start transition-colors hover:bg-muted"
                    >
                      <span className="truncate font-medium" dir="auto">
                        {client.fullName}
                      </span>

                      <span className="truncate text-caption text-muted-foreground tabular-nums">
                        {age === null ? <Missing /> : tc('yearsOld', { count: age })}
                      </span>

                      {/*
                        The cell keeps the page's direction so the number sits
                        at the column's inline-start like its two neighbours;
                        `dir` on the inner span isolates the digits and runs
                        them left-to-right, which is how a phone number is read
                        in both locales — letting it inherit the Arabic
                        direction moves a leading `+` to the wrong end of it.
                      */}
                      <span className="truncate text-caption text-muted-foreground">
                        {client.phone ? (
                          <span className="font-mono" dir="ltr">
                            {client.phone}
                          </span>
                        ) : (
                          <Missing />
                        )}
                      </span>

                      {/*
                        The next visit runs under all three, when there is one.
                        Nothing at all when there is not — "Nothing booked"
                        repeated down the list said the same non-fact about
                        most of the register and gave every row a line to read
                        past.
                      */}
                      {client.nextVisit ? (
                        <span className="col-span-3 truncate text-caption text-muted-foreground">
                          {t('nextVisit', {
                            when: `${formatMediumDate(locale, client.nextVisit.date)} · ${formatMinute(
                              locale,
                              client.nextVisit.date,
                              client.nextVisit.startMinute,
                            )}`,
                          })}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>

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
