'use client';

import { useActionState, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import type { Locale } from '@/i18n/routing';

/**
 * The dialog every settings row opens.
 *
 * ## Why a dialog and not an inline field
 *
 * A settings page is read far more often than it is written — you open it to
 * check what the clinic's number is set to, not to change it. A page of live
 * inputs makes every visit look like an unsaved form, needs a save control for
 * a page you did not edit, and gives a mistyped character somewhere to hide.
 * Rows that *state* the value, with one control that opens an editor for the
 * one thing you came for, invert that: reading is the default and writing is
 * deliberate.
 *
 * It also removes the whole unsaved-changes apparatus. There is no page-level
 * dirty state to track, no save bar, no leave-guard and no reset token, because
 * a dialog either commits its one field or is dismissed.
 *
 * ## The action shape
 *
 * Every caller passes a server action over `FieldEditState`. This component
 * owns the `useActionState` and the open/closed state, so a caller writes a
 * trigger, a label and whatever inputs the field needs — nothing else.
 *
 * `status === 'success'` closes the dialog. The row behind it is server-rendered
 * and the action revalidates its path, so the new value is already on screen by
 * the time the dialog is gone.
 */

/**
 * All this component needs to know about a caller's state.
 *
 * Deliberately a shape rather than a union of the exact statuses: the callers
 * are three different actions whose unions do not line up — the schedule's adds
 * a `warning` for future appointments that fall outside new opening hours, the
 * field editors carry a `validationKey` the schedule has no use for. Requiring
 * one union would mean widening every action to the intersection of all of
 * them, which is how unrelated features end up sharing a type.
 *
 * `success` is the only status read here. Everything else is handed back to the
 * caller, which knows what its own statuses mean.
 */
export type FieldDialogState = { status: string };

/**
 * Generic over the caller's own state union rather than widening to
 * `FieldDialogState`. A function parameter is contravariant, so an action typed
 * over a narrower union — `messageKey: 'unexpected'` rather than `string` — is
 * not assignable to one typed over the wider shape, and the alternative to a
 * type parameter here is a cast at every call site.
 */
export function SettingsEditDialog<State extends FieldDialogState>({
  locale,
  title,
  triggerLabel,
  /** Announced on the trigger where "Change" alone does not say what changes. */
  triggerAriaLabel,
  hiddenFields,
  size,
  action,
  initialState,
  /** Renders the field(s). Receives the validation key when the server rejected the value. */
  children,
  disabled,
}: {
  locale: Locale;
  title: string;
  triggerLabel: string;
  triggerAriaLabel?: string;
  /** Constant values the action needs — the field name, usually. */
  hiddenFields?: Record<string, string>;
  /**
   * `wide` for an editor that is a table rather than a field. The clinic's week
   * is seven rows of a switch and two times; at the default 28rem those two
   * times wrapped under the day name, so a seven-row table became a
   * twenty-one-row scroll.
   */
  size?: 'default' | 'wide';
  action: (state: Awaited<State>, data: FormData) => Promise<State>;
  initialState: Awaited<State>;
  /** Renders the field(s). Receives the action's own state, so the caller decides what an error looks like. */
  children: (state: Awaited<State>) => ReactNode;
  disabled?: boolean;
}) {
  const t = useTranslations('settingsWorkspace');
  const [open, setOpen] = useState(false);

  /*
    Closing happens inside the action, after its `await` — not in an effect
    watching the resulting status. An effect that calls `setState` on every
    render where the status is already `success` schedules a cascading render
    for a transition that has long since happened; here the close is what it
    is, one event-driven update in the same tick as the state it responds to.

    The dialog element itself stays mounted either way — `open` is a prop, not
    a condition on rendering it — so there is no unmount racing the state
    commit.
  */
  const [state, formAction, pending] = useActionState(async (previous: Awaited<State>, data: FormData) => {
    const next = await action(previous, data);
    if (next.status === 'success') setOpen(false);
    return next;
  }, initialState);

  return (
    <>
      <Button
        type="button"
        variant="neutral"
        size="sm"
        disabled={disabled}
        aria-label={triggerAriaLabel}
        onClick={() => setOpen(true)}
      >
        {triggerLabel}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        label={title}
        dir={locale === 'ar' ? 'rtl' : 'ltr'}
        size={size}
      >
        {/*
          Keyed on `open` so every opening starts from the server's current
          value. Without it a dialog dismissed mid-edit would reopen holding the
          abandoned text, which reads as an unsaved change the page never
          acknowledged.
        */}
        <form key={String(open)} action={formAction} noValidate>
          <input type="hidden" name="locale" value={locale} />
          {Object.entries(hiddenFields ?? {}).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}

          <DialogHeader title={title} />

          <DialogBody className="flex flex-col gap-4">
            {children(state)}

            {/*
              The catch-all. A caller that can say something more useful about
              its own failure renders that inside `children`; this is what a
              reader sees when the server simply could not write.
            */}
            {state.status === 'error' ? (
              <Callout role="alert" tone="attention">{t('saveFailed')}</Callout>
            ) : null}
          </DialogBody>

          {/*
            Cancel first in the DOM, so Enter inside a text field never lands on
            it and Escape is not the only way out. The primary still reads first
            in both scripts because the footer orders logically.
          */}
          <DialogFooter className="justify-end">
            <Button type="button" variant="neutral" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? t('saving') : t('save')}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </>
  );
}
