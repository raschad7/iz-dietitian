'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';

import { Dialog, DialogHeader } from '@/components/ui/dialog';
import { useDialogPresence } from '@/components/ui/dialog-motion';
import { loadClientFormAction } from '@/features/clients/actions';
import { ClientForm } from '@/features/clients/components/client-form';
import { type ClientFormValues } from '@/features/clients/types';
import { useRouter } from '@/i18n/navigation';
import { getLocaleDirection, type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * The client card, and the control that opens it.
 *
 * **This is the only way into a client record.** Adding and editing both open
 * the same card over whatever screen asked for it — there is no `/clients/new`
 * and no `/clients/[id]/edit` page any more. Staff add someone while looking at
 * the people they already have, and an edit does not cost them their place in
 * a list, a booking, or a dashboard.
 *
 * Callers style their own control and pass it as `children`: the register wants
 * a primary button, the dashboard a whole tile, a table row a 40px icon. The
 * trigger is a real `<button type="button">`, so it is safe inside the search
 * form it sits in on the register.
 *
 * The card is portalled to `<body>`. The trigger can be inside a form — a
 * `<form>` nested in another is invalid HTML and the browser resolves it by
 * quietly dropping one — or inside another `<dialog>`, as it is in the
 * calendar's appointment card. `<dialog>` renders in the top layer either way,
 * and a modal opened over a modal stacks on it rather than being trapped
 * behind it.
 */
type ClientFormTriggerProps = {
  locale: Locale;
  /**
   * Editing an existing client. The record is read when the card opens rather
   * than shipped with the screen — see `loadClientFormAction`.
   */
  clientId?: string;
  /** The trigger's own markup. */
  children: React.ReactNode;
  className?: string;
  'aria-label'?: string;
  /**
   * Marks this trigger for the guided tour to point at.
   *
   * Named rather than swept up in a rest spread, because there is exactly one
   * attribute a caller is allowed to add to the control and a spread would be
   * an invitation to reach past the props above. See
   * `src/features/user-guide/steps.ts`.
   */
  'data-guide'?: string;
};

export function ClientFormTrigger({
  locale,
  clientId,
  children,
  className,
  'aria-label': ariaLabel,
  'data-guide': dataGuide,
}: ClientFormTriggerProps) {
  const t = useTranslations('clients');
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [client, setClient] = useState<ClientFormValues | null>(null);
  const [loading, startLoading] = useTransition();
  const dialogPresent = useDialogPresence(open);

  const trigger = useRef<HTMLButtonElement>(null);
  const hasOpened = useRef(false);
  const close = useCallback(() => setOpen(false), []);

  /*
   * Send focus back where it came from. Escape and a backdrop click go through
   * `<dialog>`'s own `close()`, which restores focus natively — but Cancel, the
   * header's close button and a saved edit unmount the card instead, and an
   * unmounted modal leaves the keyboard stranded on `<body>`. Runs after the
   * card is gone, so the focus is not swallowed by a modal that is still in the
   * top layer.
   */
  useEffect(() => {
    if (open) {
      hasOpened.current = true;
    } else if (hasOpened.current && !dialogPresent) {
      trigger.current?.focus();
    }
  }, [dialogPresent, open]);

  const openCard = () => {
    if (!clientId) {
      setClient(null);
      setOpen(true);
      return;
    }

    startLoading(async () => {
      const values = await loadClientFormAction(locale, clientId);

      /*
       * Gone — deleted or archived away in another tab since this screen was
       * rendered. Refreshing is the honest answer: it takes the row that can
       * no longer be edited off the screen, rather than leaving a button that
       * does nothing when pressed.
       */
      if (!values) {
        router.refresh();
        return;
      }

      setClient(values);
      setOpen(true);
    });
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={ariaLabel}
        data-guide={dataGuide}
        // The pending state belongs on the control, not in an empty card: the
        // read takes a round trip, and a card that appears blank and then fills
        // in is a card that looked, for a moment, like it had lost the record.
        aria-busy={loading}
        disabled={loading}
        onClick={openCard}
        className={className}
      >
        {children}
      </button>

      {dialogPresent
        ? createPortal(
            <Dialog
              open={open}
              onClose={close}
              label={client ? t('editTitle') : t('createTitle')}
              dir={getLocaleDirection(locale)}
              flat
              className={cn(
                // `open:` and not a bare `flex`: a `display` utility on a
                // <dialog> outranks the UA rule that hides it while closed.
                'open:flex open:flex-col max-h-[90dvh] overflow-hidden',
                // One width, because there is one set of fields. The card used
                // to animate between 30rem and 50rem as its disclosure opened;
                // the disclosure is gone, and a fixed width is one fewer thing
                // moving under the pointer.
                'sm:w-[min(30rem,calc(100vw-2rem))]',
              )}
            >
              {/*
                No close button: this card's footer already ends in Cancel, and
                Escape and a backdrop click both close it. A third exit in the
                corner was crowding the title of the only surface a client
                record is written on.
              */}
              <DialogHeader
                title={client ? t('editTitle') : t('createTitle')}
                description={client ? undefined : t('createHint')}
                className="px-4 pt-4 sm:px-5 sm:pt-5"
              />

              <ClientForm
                locale={locale}
                client={client ?? undefined}
                onCancel={close}
                onSaved={close}
              />
            </Dialog>,
            document.body,
          )
        : null}
    </>
  );
}
