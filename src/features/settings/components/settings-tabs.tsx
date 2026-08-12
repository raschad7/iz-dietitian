'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Icon, type IconName } from '@/components/ui/icon';
import { Tabs, tabLinkVariants } from '@/components/ui/tabs';
import { Link, useRouter } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';

const SETTINGS_LINKS = [
  { key: 'profile', href: '/app/settings/profile', icon: 'profile' },
  { key: 'clinic', href: '/app/settings/clinic', icon: 'contact' },
  { key: 'whatsapp', href: '/app/settings/whatsapp', icon: 'whatsapp' },
  { key: 'security', href: '/app/settings/security', icon: 'security' },
] as const satisfies ReadonlyArray<{ key: string; href: string; icon: IconName }>;

export function SettingsTabs({ locale }: { locale: Locale }) {
  const t = useTranslations('settingsWorkspace');
  const pathname = usePathname();
  const router = useRouter();
  const [leavingTo, setLeavingTo] = useState<string | null>(null);

  return (
    <>
      <Tabs label={t('tabsLabel')} appearance="contained">
        {SETTINGS_LINKS.map((item) => {
          const active = pathname.endsWith(item.href.replace('/app', ''));

          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={tabLinkVariants({ active, appearance: 'contained' })}
              onClick={(event) => {
                if (active || !document.querySelector('[data-settings-dirty="true"]')) return;
                if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                event.preventDefault();
                setLeavingTo(item.href);
              }}
            >
              <Icon name={item.icon} className="size-[17px]" />
              {t(`tabs.${item.key}`)}
            </Link>
          );
        })}
      </Tabs>

      {leavingTo ? (
        <ConfirmDialog
          locale={locale}
          title={t('leaveTitle')}
          description={t('leaveDescription')}
          confirmLabel={t('leaveConfirm')}
          cancelLabel={t('leaveCancel')}
          onConfirm={() => {
            const href = leavingTo;
            setLeavingTo(null);
            router.push(href);
          }}
          onCancel={() => setLeavingTo(null)}
        />
      ) : null}
    </>
  );
}
