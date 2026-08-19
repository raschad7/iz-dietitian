'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { InstallInstructionsDialog } from '@/features/portal/pwa/install-instructions-dialog';
import { useInstallPrompt } from '@/features/portal/pwa/use-install-prompt';
import { type Direction } from '@/i18n/routing';

/**
 * The portal's eager install offer: a dismissible inline card, never a fixed
 * overlay — `PortalTabBar` already owns the fixed bottom edge, and a second
 * thing pinned there would fight it. Renders inline above the tab content
 * instead, so it scrolls away with the page and never covers the nav.
 *
 * **Only appears when there is a real install path.** `bannerVisible` (from
 * `useInstallPrompt`) is false whenever `installAction` is `'unavailable'` —
 * unlike the settings row, this surface never shows a "not available right
 * now" state. A client did not ask to see this card; showing it with nothing
 * useful to do would be exactly the unearned interruption the cooldown below
 * exists to prevent.
 *
 * **Not shown on every visit.** `bannerVisible` also folds in
 * `canShowInstallBanner`'s 14-day cooldown after "Not now", and goes away
 * *permanently* the moment `installed` is true — accepting the native prompt,
 * `appinstalled` firing, or this tab simply turning out to be running
 * standalone all set that flag. A client who dismissed it can still install
 * later from Settings → Preferences; see `install-app-settings-row.tsx`.
 */
export function InstallAppBanner({ dir }: { dir: Direction }) {
  const t = useTranslations('portal.pwa.installBanner');
  const { bannerVisible, installAction, promptInstall, dismiss } = useInstallPrompt();
  const [iosDialogOpen, setIosDialogOpen] = useState(false);

  if (!bannerVisible) return null;

  return (
    <>
      <Card variant="tinted" className="mb-4">
        <CardContent className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-icon-chip text-icon-chip-foreground"
          >
            <Icon name="install" className="size-4.5" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="font-heading text-sm leading-snug font-medium">{t('title')}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t('description')}</p>

            <div className="mt-3 flex flex-wrap gap-2">
              {installAction === 'android' ? (
                <Button type="button" size="sm" onClick={() => void promptInstall()}>
                  {t('install')}
                </Button>
              ) : (
                <Button type="button" size="sm" onClick={() => setIosDialogOpen(true)}>
                  {t('iosInstructions')}
                </Button>
              )}

              <Button type="button" size="sm" variant="ghost" onClick={dismiss}>
                {t('dismiss')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <InstallInstructionsDialog open={iosDialogOpen} onClose={() => setIosDialogOpen(false)} dir={dir} />
    </>
  );
}
