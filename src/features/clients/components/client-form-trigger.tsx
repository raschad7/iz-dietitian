'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';

import { Dialog, DialogHeader } from '@/components/ui/dialog';
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
};

export function ClientFormTrigger({
  locale,
  clientId,
  children,
  className,
  'aria-label': ariaLabel,
}: ClientFormTriggerProps) {
  const t = useTranslations('clients');
  const tCommon = useTranslations('common');
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [client, setClient] = useState<ClientFormValues | null>(null);
  const [loading, startLoading] = useTransition();

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
    } else if (hasOpened.current) {
      trigger.current?.focus();
    }
  }, [open]);

  const openCard = () => {
    if (!clientId) {
      // A new record starts from the four core fields, every time.
      setClient(null);
      setExpanded(false);
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
      /*
       * An existing record opens on whatever it already holds. Collapsing a
       * goal, a height and three lines of medical notes out of sight would
       * read as the app having lost them.
       */
      setExpanded(DETAIL_FIELDS.some((field) => values[field] !== null && values[field] !== ''));
      setOpen(true);
    });
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={ariaLabel}
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

      {open
        ? createPortal(
            <Dialog
              open
              onClose={close}
              label={client ? t('editTitle') : t('createTitle')}
              dir={getLocaleDirection(locale)}
              flat
              className={cn(
                // `open:` and not a bare `flex`: a `display` utility on a
                // <dialog> outranks the UA rule that hides it while closed.
                'open:flex open:flex-col max-h-[90dvh] overflow-hidden',
                'transition-[width] duration-200 ease-[cubic-bezier(.2,.6,.2,1)]',
                // The disclosure grows the card in both directions — the extra
                // fields need the height, and the second column needs the width.
                expanded
                  ? 'sm:w-[min(50rem,calc(100vw-2rem))]'
                  : 'sm:w-[min(30rem,calc(100vw-2rem))]',
              )}
            >
              <DialogHeader
                title={client ? t('editTitle') : t('createTitle')}
                description={client ? undefined : t('createHint')}
                onClose={close}
                closeLabel={tCommon('close')}
                className="px-4 pt-4 sm:px-5 sm:pt-5"
              />

              <ClientForm
                locale={locale}
                client={client ?? undefined}
                expanded={expanded}
                onExpandedChange={setExpanded}
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

/**
 * What "this record has more to it" means when deciding whether to open the
 * disclosure. It is the hidden half of the card minus `preferredLocale`, which
 * every record carries — counting it would expand every edit, every time.
 */
const DETAIL_FIELDS = [
  'sex',
  'heightCm',
  'goal',
  'activityLevel',
  'medicalNotes',
  'allergies',
  'notes',
] as const satisfies ReadonlyArray<keyof ClientFormValues>;
