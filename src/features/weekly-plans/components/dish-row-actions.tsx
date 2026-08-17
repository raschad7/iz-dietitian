'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Icon } from '@/components/ui/icon';
import { toast } from '@/components/ui/toast';
import { useRouter } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';

import { deleteDishAction, hideDishAction, unhideDishAction } from '../catalog-actions';
import { initialCatalogFormState, type CatalogFormState } from '../catalog-form-state';

/** Only what a row needs to decide which actions to offer. */
export type RowActionsDish = {
  id: string;
  nameAr: string;
  /** Shared/built-in dish — read-only, so no Edit/Delete, only Hide/Unhide. */
  isSystem: boolean;
  /** A shared dish this clinic has hidden (only ever true in the "show hidden" view). */
  hidden: boolean;
};

/**
 * The per-row overflow menu, reusing the existing server actions.
 *
 * A clinic dish gets **Edit** (delegated up via `onEdit`, so the same editor
 * dialog opens whether the reader reached it from the card menu or from the detail
 * drawer) and **Delete** (confirmed first). A system dish is read-only: only
 * **Hide** / **Unhide**. Every write goes through the tested `catalog-actions`,
 * which re-resolve the clinic and refuse a dish it does not own.
 *
 * One `⋮` trigger, nothing else — the card is the thing you click to read the
 * dish; this is only the quieter management surface beside it.
 */
export function DishRowActions({
  dish,
  onEdit,
  locale,
}: {
  dish: RowActionsDish;
  /** Opens the shared editor dialog for a clinic dish. */
  onEdit: () => void;
  locale: string;
}) {
  const t = useTranslations('dishes.rowActions');
  const tErrors = useTranslations('weeklyPlans');
  const tCommon = useTranslations('common');
  const activeLocale = useLocale() as Locale;
  const router = useRouter();

  const [pending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  /** Calls a form-style action imperatively with the dish id, then reports it. */
  function callAction(
    action: (state: CatalogFormState, formData: FormData) => Promise<CatalogFormState>,
    successMessage: string,
  ) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('locale', locale);
      formData.set('dishId', dish.id);

      const result = await action(initialCatalogFormState, formData);
      if (result.status === 'done') {
        toast.success(successMessage);
        router.refresh();
      } else if (result.status === 'error') {
        toast.error(tErrors(result.messageKey));
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t('menuLabel')}
              disabled={pending}
            >
              <Icon name="moreActions" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          {dish.isSystem ? (
            dish.hidden ? (
              <DropdownMenuItem onClick={() => callAction(unhideDishAction, t('unhidden'))}>
                <Icon name="eye" />
                {t('unhide')}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => callAction(hideDishAction, t('hidden'))}>
                <Icon name="eyeOff" />
                {t('hide')}
              </DropdownMenuItem>
            )
          ) : (
            <>
              <DropdownMenuItem onClick={onEdit}>
                <Icon name="edit" />
                {tCommon('edit')}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => setConfirmingDelete(true)}>
                <Icon name="trash" />
                {tCommon('delete')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {confirmingDelete && (
        <ConfirmDialog
          locale={activeLocale}
          title={t('deleteConfirmTitle')}
          description={t('deleteConfirmMessage', { name: dish.nameAr })}
          confirmLabel={tCommon('delete')}
          cancelLabel={tCommon('cancel')}
          tone="destructive"
          onConfirm={() => {
            setConfirmingDelete(false);
            callAction(deleteDishAction, t('deleted'));
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </>
  );
}
