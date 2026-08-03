import { getTranslations } from 'next-intl/server';

import { Card, CardContent } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { ClientFormTrigger } from '@/features/clients/components/client-form-trigger';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';

/**
 * The four things a dietitian starts a session by doing.
 *
 * Links styled as surfaces, not `<Button render={<Link/>}>`: Base UI's Button
 * warns when it renders anything other than a real `<button>` (see the same
 * note on `src/app/[locale]/page.tsx`). They are cards rather than a row of
 * outline buttons because these are destinations, and a target the size of a
 * card is easier to hit on a phone than a 36px control.
 *
 * **They rest neutral and pick up the brand on hover.** Four solid olive tiles
 * sitting above two neutral charts made the top of the page one block of green
 * with no internal hierarchy; resting white and colouring under the pointer
 * spends the brand on the one card you are actually reaching for. The `Card`
 * `interactive` prop supplies the rest — the edge thickens rather than the
 * card lifting.
 *
 * Each carries a subline, because "New meal plan" and "Add a food" both sound
 * like they might open the same screen otherwise.
 *
 * — "Add a client" has no route of its own either: the client card is the only
 *   way into a record, so this opens it over the dashboard rather than sending
 *   the reader to a form and then to the new person's page.
 * — "Book an appointment" has no route of its own: booking happens in a dialog
 *   inside the calendar, so this opens today's day view where that dialog lives.
 * — "Add a food" opens the food reference. `foods` is shared public-domain data
 *   with no create screen in the app today; this is the closest real
 *   destination, and the subline says so rather than promising a form.
 */
const ACTIONS = [
  { key: 'addClient', icon: 'addClient', href: null },
  { key: 'bookAppointment', icon: 'bookAppointment', href: '/app/calendar/day' },
  { key: 'newMealPlan', icon: 'mealPlans', href: '/app/meal-plans/new' },
  { key: 'addFood', icon: 'foods', href: '/app/foods' },
] as const satisfies ReadonlyArray<{
  key: string;
  icon: IconName;
  href: '/app/calendar/day' | '/app/meal-plans/new' | '/app/foods' | null;
}>;

export async function QuickActions({ locale }: { locale: Locale }) {
  const t = await getTranslations('dashboard.quickActions');

  return (
    <section aria-labelledby="quick-actions-title" className="shrink-0">
      <h3 id="quick-actions-title" className="mb-2 font-heading text-heading-sm font-semibold">
        {t('title')}
      </h3>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ACTIONS.map((action) => {
          const tile = (
            <Card size="sm" interactive className="h-full">
              <CardContent className="flex items-center gap-3">
                {/* The disc is where the green arrives — one element changing
                    colour, not the whole card repainting under the pointer. */}
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors group-hover/card:bg-primary group-hover/card:text-primary-foreground">
                  <Icon name={action.icon} className="size-5" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-heading-sm font-semibold">{t(`${action.key}.title`)}</span>
                  <span className="block truncate text-caption text-muted-foreground">
                    {t(`${action.key}.hint`)}
                  </span>
                </span>

                <Icon
                  name="chevronEnd"
                  className="size-4 shrink-0 text-muted-foreground transition-colors group-hover/card:text-primary"
                />
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
