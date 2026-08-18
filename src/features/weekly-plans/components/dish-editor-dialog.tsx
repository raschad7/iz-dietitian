'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogHeader } from '@/components/ui/dialog';
import { getLocaleDirection, type Locale } from '@/i18n/routing';

import { decideDialogClose } from '../dialog-close';
import type { RefinedFood } from '../ingredient-refine';
import type { DishEditData } from '../queries';

import { DishEditor } from './dish-editor';

/**
 * The dish builder as a large centered dialog (spec §1).
 *
 * A centered modal workspace, not a side sheet: ~70rem wide and up to 92vh tall,
 * the page dimmed and blurred behind it, focus trapped, Escape and a backdrop
 * click honoured — all from the shared `Dialog` (a native `<dialog>` opened with
 * `showModal`). Only the body scrolls; the header and the editor's own sticky
 * footer stay put. On a phone it becomes the app's full-width work sheet.
 *
 * Closing is guarded: with unsaved edits, Escape / backdrop / the close button
 * all route through a confirm step instead of discarding silently. A successful
 * save closes directly through `onSaved`, never the guard.
 *
 * One component for both entry points — "add" (no `dish`) and "edit" (a preloaded
 * `dish`) — so the two flows can never drift.
 */
export function DishEditorDialog({
  locale,
  open,
  onOpenChange,
  dish,
  onSaved,
  search,
}: {
  locale: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The clinic dish being edited, or undefined for the add flow. */
  dish?: DishEditData;
  /** Called after a successful save; the caller closes the dialog and refreshes. */
  onSaved: () => void;
  /** Injectable ingredient search for the dev harness; defaults to the real action. */
  search?: (locale: string, query: string) => Promise<RefinedFood[]>;
}) {
  const t = useTranslations('dishEditor.editor');
  const tCommon = useTranslations('common');
  const activeLocale = useLocale() as Locale;
  const isEditing = dish !== undefined;

  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);

  /**
   * The single close handler for every signal the dialog can emit — the X, the
   * Cancel button, a backdrop click, Escape, and the native `<dialog>` close
   * event. `decideDialogClose` keeps the confirm from firing twice: it ignores
   * the native echo that follows `onOpenChange(false)` and any repeat signal
   * while the confirm is already up (see `dialog-close.ts`).
   */
  function requestClose() {
    const decision = decideDialogClose({ open, dirty, confirming });
    if (decision === 'confirm') setConfirming(true);
    else if (decision === 'close') onOpenChange(false);
  }

  return (
    <>
      <Dialog
        open={open}
        onClose={requestClose}
        label={isEditing ? t('editTitle') : t('pageTitle')}
        dir={getLocaleDirection(activeLocale)}
        size="wide"
        // A workspace: wider and taller than the default card, a flex column so the
        // header stays put and the editor body scrolls inside it.
        className="open:flex open:flex-col max-h-[92vh] sm:w-[min(70rem,calc(100vw-4rem))]"
      >
        <DialogHeader
          title={isEditing ? t('editTitle') : t('pageTitle')}
          description={isEditing ? t('editSubtitle') : t('pageSubtitle')}
          onClose={requestClose}
          closeLabel={tCommon('close')}
          className="shrink-0 border-b border-border pb-4"
        />

        {/* Remounted per open via the key, so the builder starts fresh each time. */}
        <DishEditor
          key={dish?.id ?? 'new'}
          locale={locale}
          dish={dish}
          onSuccess={onSaved}
          onCancel={requestClose}
          onDirtyChange={setDirty}
          search={search}
        />
      </Dialog>

      {confirming && (
        <ConfirmDialog
          locale={activeLocale}
          title={t('unsavedTitle')}
          description={t('unsavedMessage')}
          confirmLabel={t('discard')}
          cancelLabel={t('keepEditing')}
          tone="destructive"
          onConfirm={() => {
            setConfirming(false);
            onOpenChange(false);
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
