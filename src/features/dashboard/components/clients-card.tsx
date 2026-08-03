import { getTranslations } from 'next-intl/server';

import { Avatar } from '@/components/ui/avatar';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { formatMediumDate, formatMinute } from '@/features/booking/format';
import { ClientFormTrigger } from '@/features/clients/components/client-form-trigger';
import { type DashboardClient } from '@/features/dashboard/queries';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

type ClientsCardProps = {
  clients: DashboardClient[];
  /** Everyone active, not just the rows shown — the subtitle counts the register. */
  total: number;
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
 * **The list scrolls inside the card, never the page.** At `xl` and up the
 * list is `flex-1`/`min-h-0` inside the card, which is already bounded by the
 * one-screen dashboard layout (see `src/app/[locale]/app/page.tsx`). Below
 * `xl` that chain has nothing to bound it against — the page is allowed to
 * scroll there — so the list instead carries its own `max-h-80` as a ceiling:
 * with up to `RECENT_CLIENTS` rows, the card would otherwise be the tallest
 * thing on the page and drag the whole page down with it just to show a list
 * that has its own scrollbar for exactly this reason.
 */
export async function ClientsCard({ clients, total, locale }: ClientsCardProps) {
  const t = await getTranslations('dashboard.clients');

  return (
    <Card className="min-h-0 xl:h-full">
      <CardHeader className="shrink-0 grid-cols-[auto_1fr] items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon name="clients" className="size-4" />
        </span>
        <span>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('subtitle', { count: total })}</CardDescription>
        </span>
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
              {clients.map((client) => (
                <li key={client.id}>
                  <Link
                    href={`/app/clients/${client.id}`}
                    className="flex items-center gap-3 p-2 transition-colors hover:bg-muted"
                  >
                    {/* The client's own colour — record data, not a design token. */}
                    <Avatar size="sm" name={client.fullName} color={client.color} />

                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium" dir="auto">
                        {client.fullName}
                      </span>
                      {/*
                        The next visit if there is one, the day they joined if
                        there is not — a row that said only a name would send
                        the reader to the record to find out anything at all.
                      */}
                      <span
                        className={cn(
                          'block truncate text-caption',
                          client.nextVisit ? 'text-muted-foreground' : 'text-muted-foreground/80',
                        )}
                      >
                        {client.nextVisit
                          ? t('nextVisit', {
                              when: `${formatMediumDate(locale, client.nextVisit.date)} · ${formatMinute(
                                locale,
                                client.nextVisit.date,
                                client.nextVisit.startMinute,
                              )}`,
                            })
                          : t('nothingBooked')}
                      </span>
                    </span>

                    <Icon name="chevronEnd" className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
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
