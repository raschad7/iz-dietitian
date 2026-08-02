import { getTranslations } from 'next-intl/server';

import { Card, CardContent } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { Link } from '@/i18n/navigation';

/**
 * The three things a dietitian starts a session by doing.
 *
 * Links styled as surfaces, not `<Button render={<Link/>}>`: Base UI's Button
 * warns when it renders anything other than a real `<button>` (see the same
 * note on `src/app/[locale]/page.tsx`). They are tinted cards rather than a row
 * of outline buttons because these are destinations, and a target the size of a
 * card is easier to hit on a phone than a 36px control.
 *
 * Each carries a subline, because the titles alone sound like they might open
 * the same screen otherwise.
 *
 * — "Book an appointment" has no route of its own: booking happens in a dialog
 *   inside the calendar, so this opens today's day view where that dialog lives.
 * — "Weekly plans" is navigation rather than a create action, for a similar
 *   reason: a plan is generated against one client's profile and schedule from
 *   their own board, so there is no standalone form to send anyone to.
 */
const ACTIONS = [
  { key: 'addClient', icon: 'addClient', href: '/app/clients/new' },
  { key: 'bookAppointment', icon: 'bookAppointment', href: '/app/calendar/day' },
  { key: 'weeklyPlans', icon: 'weeklyPlans', href: '/app/weekly-plans' },
] as const satisfies ReadonlyArray<{
  key: string;
  icon: IconName;
  href: '/app/clients/new' | '/app/calendar/day' | '/app/weekly-plans';
}>;

export async function QuickActions() {
  const t = await getTranslations('dashboard.quickActions');

  return (
    <section aria-labelledby="quick-actions-title" className="shrink-0">
      <h3 id="quick-actions-title" className="mb-2 font-heading text-heading-sm font-semibold">
        {t('title')}
      </h3>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ACTIONS.map((action) => (
          <li key={action.key}>
            <Link href={action.href} className="block h-full">
              <Card variant="tinted" size="sm" interactive className="h-full">
                <CardContent className="flex items-center gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Icon name={action.icon} className="size-5" />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-heading-sm font-semibold">{t(`${action.key}.title`)}</span>
                    <span className="block truncate text-caption text-muted-foreground">
                      {t(`${action.key}.hint`)}
                    </span>
                  </span>

                  <Icon name="chevronEnd" className="size-4 shrink-0 text-primary" />
                </CardContent>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
