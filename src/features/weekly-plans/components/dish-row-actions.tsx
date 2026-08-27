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
import { TooltipHint } from '@/components/ui/tooltip-hint';
import { useRouter } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';

import { deleteDishAction, hideDishAction, unhideDishAction } from '../catalog-actions';
import { initialCatalogFormState, type CatalogFormState } from '../catalog-form-state';

/** Only what a row needs to decide which actions to offer. */
export type RowActionsDish = {
  id: string;
  /** Already in the reader's language — the menu never re-derives a name. */
  name: string;
  /**
   * Shared/built-in dish — read-only, so no Edit/Delete. Hide/Unhide is then
   * the only action, and the row draws it directly instead of a menu.
   */
  isSystem: boolean;
  /** A shared dish this clinic has hidden (only ever true in the "show hidden" view). */
  hidden: boolean;
};

/**
 * The per-row overflow menu, reusing the existing server actions.
 *
 * A clinic dish gets **Edit** (delegated up via `onEdit`, so the same editor
 * dialog opens whether the reader reached it from the card menu or from the detail
 * drawer) and **Delete** (confirmed first), behind one `⋮` trigger — the card is
 * the thing you click to read the dish; the menu is the quieter management
 * surface beside it. Every write goes through the tested `catalog-actions`,
 * which re-resolve the clinic and refuse a dish it does not own.
 *
 * ## A system dish has no menu
 *
 * It is read-only, so Hide — or Unhide, on the hidden shelf — is the only thing
 * that can be done to it, and a menu holding one item is two clicks charged for
 * one action plus a `⋮` that promises choices it does not have. The shared
 * library is most of this catalog, so that was most rows. The toggle is drawn
 * directly in the action well instead, as the eye it already used inside the
 * menu, and it says which way it will go before it is pressed: an open eye on a
 * hidden dish, a struck-through one on a visible dish.
 *
 * ## Hiding is optimistic
 *
 * Both lists this button appears in are single-purpose — the catalog holds what
 * is visible, the hidden shelf holds what is not — so the dish always *leaves*
 * the list it was acted on from. That makes the outcome knowable before the
 * server answers, and `onLeave` is how the row says so: the table drops it at
 * once and the round trip happens behind an already-correct screen.
 *
 * `onLeaveFailed` is the other half, and it is not optional. An optimistic
 * update that cannot be taken back is a lie with a longer fuse: the write fails,
 * the toast says so, and the row it was about stays gone until something else
 * reloads the page.
 */
export function DishRowActions({
  dish,
  onEdit,
  onLeave,
  onLeaveFailed,
  locale,
}: {
  dish: RowActionsDish;
  /** Opens the shared editor dialog for a clinic dish. */
  onEdit: () => void;
  /**
   * This dish no longer belongs in the list showing it — hidden from the
   * catalog, or brought back from the hidden shelf. Called before the write, so
   * the table can drop the row immediately.
   */
  onLeave: () => void;
  /** The write did not land after all; put the row back. */
  onLeaveFailed: () => void;
  locale: string;
}) {
  const t = useTranslations('dishes.rowActions');
  const tErrors = useTranslations('weeklyPlans');
  const tCommon = useTranslations('common');
  const activeLocale = useLocale() as Locale;
  const router = useRouter();

  const [pending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  /**
   * Calls a form-style action imperatively with the dish id, then reports it.
   *
   * `optimistic` is the row leaving its list. It runs before the request rather
   * than after the reply, and its `revert` runs on any outcome that is not
   * `done` — including the throw, which the previous version let escape into an
   * unhandled rejection with the row already removed.
   */
  function callAction(
    action: (state: CatalogFormState, formData: FormData) => Promise<CatalogFormState>,
    successMessage: string,
    optimistic?: { apply: () => void; revert: () => void },
  ) {
    optimistic?.apply();

    startTransition(async () => {
      const formData = new FormData();
      formData.set('locale', locale);
      formData.set('dishId', dish.id);

      try {
        const result = await action(initialCatalogFormState, formData);
        if (result.status === 'done') {
          toast.success(successMessage);
          router.refresh();
          return;
        }
        optimistic?.revert();
        if (result.status === 'error') toast.error(tErrors(result.messageKey));
      } catch {
        optimistic?.revert();
        toast.error(tErrors('errors.unexpected'));
      }
    });
  }

  /*
    The single-action case, drawn as that action. `relative` keeps the button
    above the row-wide link stretched out of the name cell, the same job the
    cell's own `relative` does for the menu below.

    No spinner here, and no `disabled`. Both were affordances for a wait that no
    longer happens: the row is gone by the time a pointer could reach either of
    them, and a control that spins on a row being removed is animating an answer
    the reader already has.
  */
  if (dish.isSystem) {
    const toggle = dish.hidden
      ? { action: unhideDishAction, done: t('unhidden'), label: t('unhide'), icon: 'eye' as const }
      : { action: hideDishAction, done: t('hidden'), label: t('hide'), icon: 'eyeOff' as const };

    return (
      <TooltipHint label={toggle.label} className="relative">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={toggle.label}
          onClick={() =>
            callAction(toggle.action, toggle.done, { apply: onLeave, revert: onLeaveFailed })
          }
        >
          <Icon name={toggle.icon} />
        </Button>
      </TooltipHint>
    );
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
          <DropdownMenuItem onClick={onEdit}>
            <Icon name="edit" />
            {tCommon('edit')}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmingDelete(true)}>
            <Icon name="trash" />
            {tCommon('delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {confirmingDelete && (
        <ConfirmDialog
          locale={activeLocale}
          title={t('deleteConfirmTitle')}
          description={t('deleteConfirmMessage', { name: dish.name })}
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
