'use client';

import { useTranslations } from 'next-intl';

import { Segmented } from '@/components/ui/segmented';
import { usePathname, useRouter } from '@/i18n/navigation';

/**
 * The five sections of a client's profile, as a `Segmented` tablist.
 *
 * These are real routes, not a client-side panel switch — Visit History
 * mounts the same `Calendar` the clinic-wide calendar uses (see `basePath` on
 * `CalendarProps`), and that component already owns day/week/month as
 * addresses of their own. Riding on the same `usePathname`-driven pattern
 * `Sidebar` uses keeps one idiom for "which route am I on" across the app
 * rather than a second, state-based one just for this page.
 *
 * `nutrition` sits second, right after the person themselves and before their
 * history: it is the tab a dietitian opens on the way to building a plan, and
 * it is the record the weekly planner reads. It did not exist while that record
 * lived on a form inside the planner, which is exactly why nobody could find it.
 */

const CLIENT_TABS = ['info', 'nutrition', 'visits', 'plans', 'portal'] as const;

type ClientTab = (typeof CLIENT_TABS)[number];

function tabPath(clientId: string, tab: ClientTab): string {
  const base = `/app/clients/${clientId}`;
  return tab === 'info' ? base : `${base}/${tab}`;
}

export function ClientTabs({ clientId }: { clientId: string }) {
  const t = useTranslations('clients');
  const router = useRouter();
  const pathname = usePathname();

  // Checked longest-prefix first only in effect: 'info' is the bare profile
  // path, so it is right to fall back to it rather than to match it eagerly
  // against every other tab's path, which also starts with it.
  const active =
    CLIENT_TABS.find((tab) => tab !== 'info' && pathname.startsWith(tabPath(clientId, tab))) ?? 'info';

  return (
    <Segmented
      label={t('tabs.label')}
      value={active}
      onChange={(tab) => router.push(tabPath(clientId, tab))}
      options={CLIENT_TABS.map((tab) => ({ value: tab, label: t(`tabs.${tab}`) }))}
    />
  );
}
