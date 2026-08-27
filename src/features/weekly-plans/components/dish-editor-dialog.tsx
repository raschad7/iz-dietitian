'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog } from '@/components/ui/dialog';
import { getLocaleDirection, type Locale } from '@/i18n/routing';

import { decideDialogClose } from '../dialog-close';
import type { RefinedFood } from '../ingredient-refine';
import type { DishEditData, DishNameSuggestion } from '../queries';

import { DishEditor } from './dish-editor';

/**
 * The dish builder as a centred dialog (spec §1).
 *
 * A modal workspace, not a side sheet: the page dimmed and blurred behind it,
 * focus trapped, Escape and a backdrop click honoured — all from the shared
 * `Dialog` (a native `<dialog>` opened with `showModal`). On a phone it becomes
 * the app's full-width work sheet.
 *
 * **It is a fixed height, and it does not scroll.** The editor inside is three
 * steps, each sized to hold its own question, and the one scrolling region in the
 * whole surface is the ingredient list on step 2. A dialog that grew with its
 * content is what put the meal-time field below the fold in the first place, so
 * the height is pinned here rather than left to whatever the tallest step
 * happens to be.
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
  onSavedAndContinue,
  search,
  searchDishNames,
}: {
  locale: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The clinic dish being edited, or undefined for the add flow. */
  dish?: DishEditData;
  /** Called after a successful save; the caller closes the dialog and refreshes. */
  onSaved: () => void;
  /**
   * Called after a save made with "save and add another": the dialog stays open
   * and the editor is remounted empty for the next dish. Absent on the edit flow,
   * where there is no "another" to add.
   */
  onSavedAndContinue?: () => void;
  /** Injectable ingredient search for the dev harness; defaults to the real action. */
  search?: (locale: string, query: string) => Promise<RefinedFood[]>;
  /** Injectable existing-dish search for the dev harness; defaults to the real action. */
  searchDishNames?: (
    locale: string,
    query: string,
    excludeDishId?: string,
  ) => Promise<DishNameSuggestion[]>;
}) {
  const t = useTranslations('dishEditor.editor');
  const activeLocale = useLocale() as Locale;
  const isEditing = dish !== undefined;

  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  /**
   * Bumped after a "save and add another", so the `key` below changes and the
   * editor remounts. A remount is the reset: it cannot leave a stale allergen or
   * a stale serving count behind the way clearing state by hand could.
   */
  const [nonce, setNonce] = useState(0);

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
        // A workspace: wider than the default card, and a *fixed* height so the
        // three steps share one frame instead of the surface jumping between a
        // short step and a tall one. `62rem` is the width at which the review
        // step's two columns both hold their content without wrapping; the
        // height clamp is what keeps the whole editor on a laptop screen.
        className="sm:h-[min(42rem,calc(100dvh-4rem))] sm:w-[min(62rem,calc(100vw-4rem))]"
      >
        {/*
          The header is the editor's, not this component's: it carries the step
          rail, and the step is the editor's state. Only the close button belongs
          here, so it comes back out through `onRequestClose` to the same guard
          Escape and the backdrop use.
        */}
        {/* Remounted per open (and per "add another") via the key, so the builder
            starts fresh each time. */}
        <DishEditor
          key={`${dish?.id ?? 'new'}-${nonce}`}
          locale={locale}
          dish={dish}
          onSuccess={onSaved}
          onSaveAnother={
            onSavedAndContinue
              ? () => {
                  setDirty(false);
                  setNonce((current) => current + 1);
                  onSavedAndContinue();
                }
              : undefined
          }
          onCancel={requestClose}
          onRequestClose={requestClose}
          onDirtyChange={setDirty}
          search={search}
          searchDishNames={searchDishNames}
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
