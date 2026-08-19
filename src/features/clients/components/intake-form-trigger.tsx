'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';

import { Dialog, DialogHeader } from '@/components/ui/dialog';
import { useDialogPresence } from '@/components/ui/dialog-motion';
import { loadIntakeAction } from '@/features/clients/actions';
import { IntakeForm } from '@/features/clients/components/intake-form';
import { type IntakeSectionId } from '@/features/clients/intake-sections';
import { type ClientIntakeValues } from '@/features/clients/types';
import { useRouter } from '@/i18n/navigation';
import { getLocaleDirection, type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * The intake dialog, and the control that opens it.
 *
 * **This is the only way into a client's clinical record.** It replaces the
 * page at `/app/weekly-plans/[clientId]/profile`, which was reachable only from
 * inside the weekly planner and could write only half of what it reported on.
 *
 * Built the same way as `ClientFormTrigger`, deliberately: callers style their
 * own control and pass it as `children`, the record is read when the dialog
 * opens rather than shipped with the screen, and the dialog is portalled to
 * `<body>` so the trigger is safe inside another form or another `<dialog>`.
 * The two are not merged into one component — they open different forms over
 * different tables, and the only thing they share is the shape of the gesture.
 */
export function IntakeFormTrigger({
  locale,
  clientId,
  section,
  children,
  className,
  'aria-label': ariaLabel,
}: {
  locale: Locale;
  clientId: string;
  /** Which panel the dialog opens on. Defaults to the form's first section. */
  section?: IntakeSectionId;
  children: React.ReactNode;
  className?: string;
  'aria-label'?: string;
}) {
  const t = useTranslations('clients');
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [intake, setIntake] = useState<ClientIntakeValues | null>(null);
  const [loading, startLoading] = useTransition();
  const dialogPresent = useDialogPresence(open);

  const trigger = useRef<HTMLButtonElement>(null);
  const hasOpened = useRef(false);

  const close = useCallback(() => setOpen(false), []);

  /*
   * A saved intake changes the screen behind this dialog — the nutrition tab
   * it was opened from, or the planner's context panel — so the close that
   * follows a save also refreshes. `revalidatePath` in the action marks the
   * data stale; this is what makes the open router segment go and re-read it.
   */
  const closeSaved = useCallback(() => {
    setOpen(false);
    router.refresh();
  }, [router]);

  /*
   * Send focus back where it came from. Escape and a backdrop click go through
   * `<dialog>`'s own `close()`, which restores focus natively — but Cancel and
   * a saved intake unmount the dialog instead, and an unmounted modal leaves
   * the keyboard stranded on `<body>`.
   */
  useEffect(() => {
    if (open) {
      hasOpened.current = true;
    } else if (hasOpened.current && !dialogPresent) {
      trigger.current?.focus();
    }
  }, [dialogPresent, open]);

  const openDialog = () => {
    startLoading(async () => {
      const values = await loadIntakeAction(locale, clientId);

      // Gone — deleted or archived away in another tab since this screen was
      // rendered. Refreshing takes the control that can no longer be used off
      // the screen rather than leaving one that does nothing when pressed.
      if (!values) {
        router.refresh();
        return;
      }

      setIntake(values);
      setOpen(true);
    });
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={ariaLabel}
        // The pending state belongs on the control, not in an empty dialog: the
        // read takes a round trip, and a form that appears blank and then fills
        // in is a form that looked, for a moment, like it had lost the record.
        aria-busy={loading}
        disabled={loading}
        onClick={openDialog}
        className={className}
      >
        {children}
      </button>

      {dialogPresent && intake
        ? createPortal(
            <Dialog
              open={open}
              onClose={close}
              label={intake.hasProfile ? t('intake.editTitle') : t('intake.createTitle')}
              dir={getLocaleDirection(locale)}
              flat
              className={cn(
                // A fixed height rather than a fitted one: the panel scrolls
                // inside the frame, so switching from a two-field section to the
                // meal schedule must not resize the dialog under the pointer
                // that just clicked the rail.
                //
                // `46rem` flat, with no `min()` against the viewport: the
                // responsive dialog frame in `globals.css` caps every dialog at
                // what the screen can actually show — keyboard included — so a
                // second ceiling here would only be a worse copy of it. The flex
                // column and the clip come from there too.
                'h-[46rem]',
                // Wide enough for the section rail *and* two field columns beside it.
                'sm:w-[min(54rem,calc(100vw-3rem))]',
                /*
                  The same measure said a second time, to the coarse-pointer
                  sheet in `globals.css`.

                  Those rules are unlayered and so beat the `sm:w-[…]` above,
                  and this dialog never set the variable they read — so on a
                  *physical* tablet it took the 28rem fallback and drew its 14rem
                  rail beside a two-column grid in the 14rem that was left. The
                  same tablet driven by a mouse got 54rem: one surface, two
                  widths, decided by the input device rather than by the screen.
                  It is deliberately the same number as the line above. See
                  `--q-dialog-sheet-width` in `globals.css`.
                */
                '[--q-dialog-sheet-width:min(54rem,calc(100vw-3rem))]',
              )}
            >
              <DialogHeader
                title={intake.hasProfile ? t('intake.editTitle') : t('intake.createTitle')}
                description={t('intake.forClient', { name: intake.fullName })}
                className="px-4 pt-4 sm:px-5 sm:pt-5"
              />

              <IntakeForm
                intake={intake}
                locale={locale}
                section={section}
                onCancel={close}
                onSaved={closeSaved}
              />
            </Dialog>,
            document.body,
          )
        : null}
    </>
  );
}
