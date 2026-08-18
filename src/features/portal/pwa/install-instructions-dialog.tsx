'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { type Direction } from '@/i18n/routing';

/**
 * iOS Safari has no `beforeinstallprompt` — there is no programmatic install,
 * only "Share → Add to Home Screen". This is the manual walkthrough shown in
 * its place, opened from both the install banner and the settings row.
 */
export function InstallInstructionsDialog({
  open,
  onClose,
  dir,
}: {
  open: boolean;
  onClose: () => void;
  dir: Direction;
}) {
  const t = useTranslations('portal.pwa.iosDialog');

  return (
    <Dialog open={open} onClose={onClose} label={t('title')} dir={dir} placement="center">
      <DialogHeader title={t('title')} onClose={onClose} closeLabel={t('close')} />

      <DialogBody className="px-4 pb-4">
        <ol className="space-y-3 text-sm">
          <li className="flex items-start gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">
              1
            </span>
            <span className="flex-1">
              {t('step1')} <Icon name="share" className="inline size-4 align-text-bottom text-muted-foreground" />
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">
              2
            </span>
            <span className="flex-1">{t('step2')}</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">
              3
            </span>
            <span className="flex-1">{t('step3')}</span>
          </li>
        </ol>
      </DialogBody>

      <DialogFooter className="px-4 pb-4">
        <Button type="button" variant="default" onClick={onClose} className="w-full">
          {t('close')}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
