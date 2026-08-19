'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';

import { Icon, type IconName } from '@/components/ui/icon';
import { Tabs, tabLinkVariants } from '@/components/ui/tabs';
import { Link } from '@/i18n/navigation';

/**
 * Where you are in settings, and where else you can go.
 *
 * ## It wears the client record's tab bar
 *
 * The sunken track with the selected tab lifted out of it as a card — the shape
 * `PanelTabs` gives the client profile. Two tab bars in one product that look
 * different teach a reader that they behave differently, and these do not: both
 * are "several views of one subject".
 *
 * They are still **links**, not a `PanelTabs` tablist. Each settings section is
 * an address with its own route, metadata and server data, so the ARIA tab
 * pattern would be a lie — and a real `<a>` keeps middle-click, open-in-new-tab
 * and a URL in the status bar, none of which a tablist has. `appearance:
 * 'contained'` in `tabs.tsx` carries the panel bar's exact geometry and tokens,
 * so the two match without this file restating any of them.
 *
 * ## Nothing saves here any more
 *
 * The bar used to carry an unsaved count, a Save and a Discard, because every
 * section was a live form. Values are now stated and edited in a dialog that
 * commits its own field, so there is no page-level dirty state to report and no
 * navigation to guard — which is also why the leave-confirmation dialog and the
 * whole dirty-tracking context are gone.
 *
 * ## On a phone it is four icons
 *
 * The four labels are "Personal profile", "Clinic", "WhatsApp" and "Security",
 * and `tabLinkVariants` keeps a tab's label on one line — correctly, a tab that
 * wraps stops reading as one of a row of peers. Together those come to more
 * than a phone is wide, so below `sm` the bar was a strip you had to drag
 * sideways to reach Security: the one piece of navigation on the screen, and
 * half of it past the edge of the glass.
 *
 * Icons alone fit four abreast at 320px with room over. The label is not
 * removed, it is `sr-only` — so the link keeps its accessible name, and a screen
 * reader, a search of the page and the browser's own status bar all still say
 * "Security" rather than announcing four unlabelled links. `not-sr-only` puts it
 * back from `sm` up, where it always fitted.
 *
 * `sm` and not `md`: 40rem is this app's phone boundary everywhere else (see
 * `useIsPhone`), and the labels fit comfortably by 640px in both scripts.
 */

const SETTINGS_LINKS = [
  { key: 'profile', href: '/app/settings/profile', icon: 'profile' },
  { key: 'clinic', href: '/app/settings/clinic', icon: 'contact' },
  { key: 'whatsapp', href: '/app/settings/whatsapp', icon: 'whatsapp' },
  { key: 'security', href: '/app/settings/security', icon: 'security' },
] as const satisfies ReadonlyArray<{ key: string; href: string; icon: IconName }>;

export function SettingsToolbar() {
  const t = useTranslations('settingsWorkspace');
  const pathname = usePathname();

  return (
    <Tabs label={t('tabsLabel')} appearance="contained">
      {SETTINGS_LINKS.map((item) => {
        const active = pathname.endsWith(item.href.replace('/app', ''));

        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={tabLinkVariants({ active, appearance: 'contained' })}
          >
            {/*
              A touch larger while it is carrying the tab on its own, back to
              the row's shared 17px once the label is beside it again.
            */}
            <Icon name={item.icon} className="size-5 sm:size-[17px]" />
            <span className="sr-only sm:not-sr-only">{t(`tabs.${item.key}`)}</span>
          </Link>
        );
      })}
    </Tabs>
  );
}
