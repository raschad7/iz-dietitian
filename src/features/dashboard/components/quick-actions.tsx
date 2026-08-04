import { getTranslations } from 'next-intl/server';

import { Card, CardContent } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { ClientFormTrigger } from '@/features/clients/components/client-form-trigger';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';

/**
 * The three things a dietitian starts a session by doing.
 *
 * Links styled as surfaces, not `<Button render={<Link/>}>`: Base UI's Button
 * warns when it renders anything other than a real `<button>` (see the same
 * note on `src/app/[locale]/page.tsx`). They are cards rather than a row of
 * outline buttons because these are destinations, and a target the size of a
 * card is easier to hit on a phone than a 36px control.
 *
 * **They rest neutral and pick up the brand on hover.** Solid olive tiles
 * sitting above two neutral charts made the top of the page one block of green
 * with no internal hierarchy; resting white and colouring under the pointer
 * spends the brand on the one card you are actually reaching for. The `Card`
 * `interactive` prop supplies the edge — an olive ring rather than a lift —
 * and the disc below supplies the fill. These are the only cards on the page
 * that get the ring, because they are the only ones you click.
 *
 * **No visible heading.** Three tiles that each name their own destination do
 * not need a label saying they are shortcuts, and the row it cost was the one
 * thing between the reader and the first thing they do. The section keeps the
 * name as an `aria-label`, and the tiles take the height back — they fill the
 * band the heading used to share with them (`xl:min-h-24`).
 *
 * — "Add a client" has no route of its own either: the client card is the only
 *   way into a record, so this opens it over the dashboard rather than sending
 *   the reader to a form and then to the new person's page.
 * — "Book an appointment" has no route of its own: booking happens in a dialog
 *   inside the calendar, so this opens today's day view where that dialog lives.
 * — "Weekly plans" is navigation rather than a create action, for a similar
 *   reason: a plan is generated against one client's profile and schedule from
 *   their own board, so there is no standalone form to send anyone to.
 */
const ACTIONS = [
  { key: 'addClient', icon: 'addClient', href: null },
  { key: 'bookAppointment', icon: 'bookAppointment', href: '/app/calendar/day' },
  { key: 'weeklyPlans', icon: 'weeklyPlans', href: '/app/weekly-plans' },
] as const satisfies ReadonlyArray<{
  key: string;
  icon: IconName;
  href: '/app/calendar/day' | '/app/weekly-plans' | null;
}>;

export async function QuickActions({ locale }: { locale: Locale }) {
  const t = await getTranslations('dashboard.quickActions');

  return (
    <section aria-label={t('title')} className="shrink-0">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:min-h-24 xl:grid-cols-3">
        {ACTIONS.map((action) => {
          const tile = (
            <Card size="sm" interactive className="h-full justify-center">
              <CardContent className="flex items-center gap-3">
                {/* The disc is the *only* thing that answers the pointer: it
                    fills olive and the glyph inside it goes white, while the
                    card's own geometry, fill and edge all hold still. Same
                    rule on every header disc on this page. */}
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors group-hover/card:bg-primary group-hover/card:text-primary-foreground">
                  <Icon name={action.icon} className="size-5" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-heading-sm font-semibold">{t(`${action.key}.title`)}</span>
                </span>

                <Icon name="chevronEnd" className="size-4 shrink-0 text-muted-foreground" />
              </CardContent>
            </Card>
          );

          return (
            <li key={action.key}>
              {/* The tile is the target either way — a link where there is
                  somewhere to go, the card's own trigger where there is not. */}
              {action.href ? (
                <Link href={action.href} className="block h-full">
                  {tile}
                </Link>
              ) : (
                <ClientFormTrigger locale={locale} className="block h-full w-full text-start">
                  {tile}
                </ClientFormTrigger>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
