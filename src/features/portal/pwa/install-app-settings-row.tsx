'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Icon } from '@/components/ui/icon';
import { InstallInstructionsDialog } from '@/features/portal/pwa/install-instructions-dialog';
import { InstallUnavailableDialog } from '@/features/portal/pwa/install-unavailable-dialog';
import { useInstallPrompt } from '@/features/portal/pwa/use-install-prompt';
import { type Direction } from '@/i18n/routing';

/**
 * The durable way to install — always present while the app is not
 * installed, unlike the home banner (`install-app-banner.tsx`), which only
 * appears when there is a ready install path and goes quiet on its own
 * cooldown. A client who dismissed that banner, or arrived on a tab other
 * than home first, still has a reachable "Install app" here.
 *
 * **Three states, one row.** `installAction` from `useInstallPrompt` decides
 * both the description text and what tapping the row does:
 *  - `'android'` — a captured `beforeinstallprompt` is ready; tapping fires
 *    the real native prompt.
 *  - `'ios'` — no native prompt exists on iOS Safari; tapping opens the
 *    manual "Add to Home Screen" walkthrough.
 *  - `'unavailable'` — neither is offered right now (most commonly: Chrome
 *    has not yet decided to fire `beforeinstallprompt` on this visit, or the
 *    browser is neither Chromium nor iOS Safari). The row stays, its
 *    description says so, and tapping opens `InstallUnavailableDialog` with
 *    concrete next steps — a helpful state, not a dead tap.
 *
 * Renders nothing once `installed` — the one condition that hides the row
 * outright, the same flag the banner checks to disappear for good.
 */
export function InstallAppSettingsRow({ dir }: { dir: Direction }) {
  const t = useTranslations('portal.pwa.settingsRow');
  const { installed, installAction, promptInstall } = useInstallPrompt();
  const [iosDialogOpen, setIosDialogOpen] = useState(false);
  const [unavailableDialogOpen, setUnavailableDialogOpen] = useState(false);

  if (installed) return null;

  const description = installAction === 'unavailable' ? t('unavailableDescription') : t('description');

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (installAction === 'android') {
            void promptInstall();
          } else if (installAction === 'ios') {
            setIosDialogOpen(true);
          } else {
            setUnavailableDialogOpen(true);
          }
        }}
        className="-mx-2 flex min-h-12 w-full items-center gap-3 rounded-md px-2 py-2.5 text-start transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-focus-halo focus-visible:outline-none"
      >
        <Icon
          name={installAction === 'unavailable' ? 'info' : 'install'}
          className="size-5 shrink-0 text-muted-foreground"
        />

        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium">{t('label')}</span>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </button>

      <InstallInstructionsDialog open={iosDialogOpen} onClose={() => setIosDialogOpen(false)} dir={dir} />
      <InstallUnavailableDialog
        open={unavailableDialogOpen}
        onClose={() => setUnavailableDialogOpen(false)}
        dir={dir}
      />
    </>
  );
}
