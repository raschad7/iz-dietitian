'use client';

import { useTranslations } from 'next-intl';
import { useSelectedLayoutSegment } from 'next/navigation';

import { Icon, type IconName } from '@/components/ui/icon';
import { TabBadge, Tabs, tabLinkVariants } from '@/components/ui/tabs';
import { Link } from '@/i18n/navigation';

/**
 * The five sections of a client's record, as link tabs.
 *
 * These have always been real routes — Visit History mounts the same `Calendar`
 * the clinic-wide calendar does (see `basePath` on `CalendarProps`), and that
 * component owns day/week/month as addresses of its own. They were nonetheless
 * being navigated by a `Segmented` whose buttons called `router.push`, which
 * cost the record every affordance a link has: middle-click, Cmd-click,
 * open-in-new-tab, "copy link address", a URL in the status bar, and working at
 * all before hydration. They are `<Link>`s now — see `src/components/ui/tabs.tsx`
 * for the rest of why, including the empty bordered box the old control left
 * across the page.
 *
 * `useSelectedLayoutSegment` rather than matching `usePathname` against five
 * built strings: a layout's active child segment is exactly the question being
 * asked and Next.js answers it directly, where the prefix matching it replaces
 * needed a comment explaining why `info` could not be compared eagerly against
 * paths that all start with it. `null` is the index route, which is `info`.
 *
 * `nutrition` sits second, right after the person themselves and before their
 * history: it is the tab a dietitian opens on the way to building a plan, and
 * it is the record the weekly planner reads.
 */
const CLIENT_TABS = ['info', 'nutrition', 'visits', 'plans', 'portal'] as const;

type ClientTab = (typeof CLIENT_TABS)[number];

/**
 * A glyph per tab — nine text-only rows are hard to scan, and so are five.
 *
 * `visits` takes the calendar and `plans` the chef's hat, the same marks the
 * rail gives those destinations, so a tab and the nav item that reaches the same
 * kind of thing agree with each other.
 */
const TAB_ICONS = {
  info: 'profile',
  nutrition: 'progress',
  visits: 'calendar',
  plans: 'mealPlans',
  portal: 'security',
} as const satisfies Record<ClientTab, IconName>;

function tabPath(clientId: string, tab: ClientTab): string {
  const base = `/app/clients/${clientId}`;
  return tab === 'info' ? base : `${base}/${tab}`;
}

export function ClientTabs({
  clientId,
  /**
   * How many nutrition fields are still blank. Rendered as a count on that tab,
   * so the record says what needs attention before anyone has opened it — and
   * omitted at zero, because a badge reading "0" is a badge with nothing to say.
   */
  nutritionGaps = 0,
}: {
  clientId: string;
  nutritionGaps?: number;
}) {
  const t = useTranslations('clients');
  const segment = useSelectedLayoutSegment();

  const active: ClientTab = CLIENT_TABS.find((tab) => tab !== 'info' && tab === segment) ?? 'info';

  return (
    <Tabs label={t('tabs.label')}>
      {CLIENT_TABS.map((tab) => {
        const isActive = tab === active;

        return (
          <Link
            key={tab}
            href={tabPath(clientId, tab)}
            /*
             * `aria-current="page"` and not `aria-selected`: these are pages,
             * not tab panels, and the rail marks its own active destination the
             * same way. It is also what carries the state for anyone the colour
             * shift alone does not reach.
             */
            aria-current={isActive ? 'page' : undefined}
            className={tabLinkVariants({ active: isActive })}
          >
            <Icon name={TAB_ICONS[tab]} className="size-[1.0625rem]" />
            {t(`tabs.${tab}`)}
            {tab === 'nutrition' && nutritionGaps > 0 ? (
              <TabBadge active={isActive}>{nutritionGaps}</TabBadge>
            ) : null}
          </Link>
        );
      })}
    </Tabs>
  );
}
