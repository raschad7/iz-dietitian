import { notFound } from 'next/navigation';

import { AppShell } from '@/components/layout/sidebar';
import { resolveLocale } from '@/i18n/params';

type DevShellPageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * The application shell, without a session.
 *
 * The sidebar only appears behind `requireStaffClinic`, so the one surface that
 * every authenticated page depends on could not be looked at without logging in
 * — which is exactly the kind of thing that gets changed and checked by
 * clicking around production. This renders it against the real navigation with
 * a stub user, so its collapsed rail, its tooltips and its behaviour in Arabic
 * can be verified the same way every other component is.
 *
 * Dev-only, like the gallery beside it: 404 in production, no data access and
 * no session guard.
 */
export default async function DevShellPage({ params }: DevShellPageProps) {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  const locale = await resolveLocale(params);

  return (
    <AppShell
      items={[
        { href: '/app', labelKey: 'dashboard' },
        { href: '/app/clients', labelKey: 'clients' },
        { href: '/app/calendar', labelKey: 'calendar' },
        { href: '/app/weekly-plans', labelKey: 'weeklyPlans' },
        { href: '/app/dishes', labelKey: 'dishes' },
      ]}
      title="Qiwam"
      /* The staff configuration, which is the one that has a brand — without it
         the head falls back to the plain title and the product logo never
         renders, so the harness could not show the thing it exists to show. */
      brand={{ logoUrl: null, name: 'عيادة مهيب' }}
      user={{ name: 'Rani Shweiki', email: 'rani@example.com', locale }}
      icons={{
        dashboard: 'dashboard',
        clients: 'clients',
        calendar: 'calendar',
        weeklyPlans: 'weeklyPlans',
        dishes: 'dishes',
      }}
    >
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-5">
        <h1 className="text-heading-lg font-semibold">Shell</h1>
        <p className="mt-2 text-body-sm text-muted-foreground">
          Collapse the sidebar with the trigger in its header, or the rail on its edge. Collapsed,
          each row shows its label as a tooltip. Check both against <code>/ar/dev/shell</code>.
        </p>
      </main>
    </AppShell>
  );
}
