'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { type Direction } from '@/i18n/routing';

/**
 * The settings row's fallback state: shown when `installAction` is
 * `'unavailable'` — no native `beforeinstallprompt` has fired yet (Chrome
 * withholds it until its own engagement/installability heuristics are
 * satisfied, or the browser is not Chromium/iOS Safari at all) and there is
 * no iOS walkthrough to fall back to.
 *
 * This is the "appropriate helpful state instead of doing nothing" the
 * settings row needs: tapping the row still does something, it just cannot
 * be the one-tap install a ready browser gets. `Callout` (`tone="neutral"`)
 * matches the "a fact worth stating, not a problem" register the design
 * system reserves that tone for — this is not an error, just not ready yet.
 */
export function InstallUnavailableDialog({
  open,
  onClose,
  dir,
}: {
  open: boolean;
  onClose: () => void;
  dir: Direction;
}) {
  const t = useTranslations('portal.pwa.unavailableDialog');

  return (
    <Dialog open={open} onClose={onClose} label={t('title')} dir={dir} placement="center">
      <DialogHeader title={t('title')} description={t('description')} onClose={onClose} closeLabel={t('close')} />

      <DialogBody className="px-4 pb-4">
        <Callout tone="neutral">{t('tip')}</Callout>
      </DialogBody>

      <DialogFooter className="px-4 pb-4">
        <Button type="button" variant="default" onClick={onClose} className="w-full">
          {t('close')}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
