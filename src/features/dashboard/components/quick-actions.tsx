import { getTranslations } from 'next-intl/server';

import { buttonVariants } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

/**
 * Links styled as buttons, not <Button render={<Link/>}>: Base UI's Button
 * warns when it renders anything other than a real <button> (see the same
 * note on src/app/[locale]/page.tsx).
 *
 * "New appointment" has no dedicated route — booking happens through a
 * dialog inside the calendar itself — so it opens today's day view, where
 * that dialog lives.
 *
 * "Weekly plans" is navigation rather than a create action, for the same kind
 * of reason: a plan is generated against one client's profile and schedule from
 * their own board, so there is no standalone form to send anyone to.
 */
export async function QuickActions() {
  const t = await getTranslations('dashboard.quickActions');

  return (
    <div>
      <h2 className="mb-3 text-sm font-medium text-foreground">{t('title')}</h2>
      <div className="flex flex-wrap gap-3">
        <Link href="/app/calendar/day" className={buttonVariants({ variant: 'outline' })}>
          {t('newAppointment')}
        </Link>
        <Link href="/app/clients/new" className={buttonVariants({ variant: 'outline' })}>
          {t('addClient')}
        </Link>
        <Link href="/app/weekly-plans" className={buttonVariants({ variant: 'outline' })}>
          {t('weeklyPlans')}
        </Link>
      </div>
    </div>
  );
}
