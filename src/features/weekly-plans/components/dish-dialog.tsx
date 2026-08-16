'use client';

import { useCallback, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogHeader } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { useRouter } from '@/i18n/navigation';
import { getLocaleDirection } from '@/i18n/routing';

import { DishEditor } from './dish-editor';

/**
 * "Add dish", as a dialog rather than a whole page.
 *
 * The editor used to live at `/dishes/new`: a full page navigation to fill in
 * one form and come straight back. The catalog behind it is what the
 * dietitian actually wants to keep looking at while she adds to it, so the
 * form now opens over it instead of replacing it — the same move
 * `ClientFormTrigger` and `NewWeekDialog` already made for their own forms.
 *
 * The dialog stays mounted only while open; `DishEditor` resets itself fresh
 * every time because it remounts with it.
 */
export function DishDialog({ locale }: { locale: string }) {
  const t = useTranslations('dishEditor.editor');
  const tDishes = useTranslations('dishes');
  const tCommon = useTranslations('common');
  const activeLocale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  function handleSuccess() {
    setOpen(false);
    // The catalog list is server-rendered; the new dish only appears once the
    // page re-fetches it.
    router.refresh();
  }

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <Icon name="add" />
        {tDishes('addDish')}
      </Button>

      <Dialog
        open={open}
        onClose={close}
        label={t('pageTitle')}
        dir={getLocaleDirection(activeLocale)}
        size="wide"
        // The recipe form is tall — name fields, meal times, labels,
        // allergens, an open-ended list of ingredient rows and the live
        // nutrition summary. Capping the dialog's own height and scrolling
        // the body (rather than the whole page) keeps the header and the
        // submit row from drifting off screen on a long recipe.
        className="open:flex open:flex-col max-h-[90dvh] overflow-hidden"
      >
        <DialogHeader
          title={t('pageTitle')}
          description={t('pageSubtitle')}
          onClose={close}
          closeLabel={tCommon('close')}
        />

        <DialogBody className="min-h-0 flex-1 overflow-y-auto">
          <DishEditor locale={locale} onSuccess={handleSuccess} onCancel={close} />
        </DialogBody>
      </Dialog>
    </>
  );
}
