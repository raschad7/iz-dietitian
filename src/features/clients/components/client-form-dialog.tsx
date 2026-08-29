'use client';

import { useTranslations } from 'next-intl';
import { createPortal } from 'react-dom';

import { Dialog, DialogHeader } from '@/components/ui/dialog';
import { useDialogPresence } from '@/components/ui/dialog-motion';
import { ClientForm } from '@/features/clients/components/client-form';
import { type ClientFormValues } from '@/features/clients/types';
import { getLocaleDirection, type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * The client card itself — the surface a client record is written on.
 *
 * Split out of `ClientFormTrigger` when the command palette became a second way
 * to open it. The trigger is a *button that owns a card*; the palette has no
 * button to give, only a row that has already been chosen and a dialog it wants
 * on screen. Both now compose this, so there is one card, one width, one header
 * and one set of Cancel semantics no matter which of them asked for it.
 *
 * **Presentation only.** It does not read the record and it does not decide
 * when to open — `open` and `client` are the caller's. `ClientFormTrigger`
 * fetches an existing client before flipping `open`; the palette only ever
 * creates, so it passes no client at all.
 */
type ClientFormDialogProps = {
  locale: Locale;
  /** The record being edited. Omitted creates a new one. */
  client?: ClientFormValues;
  open: boolean;
  onClose: () => void;
};

export function ClientFormDialog({ locale, client, open, onClose }: ClientFormDialogProps) {
  const t = useTranslations('clients');
  const dialogPresent = useDialogPresence(open);

  if (!dialogPresent) return null;

  /*
   * Portalled to `<body>`. The caller's control can be inside a form — a
   * `<form>` nested in another is invalid HTML and the browser resolves it by
   * quietly dropping one — or inside another `<dialog>`, as it is when the
   * palette opens this over its own modal. `<dialog>` renders in the top layer
   * either way, and a modal opened over a modal stacks on it rather than being
   * trapped behind it.
   */
  return createPortal(
    <Dialog
      open={open}
      onClose={onClose}
      label={client ? t('editTitle') : t('createTitle')}
      dir={getLocaleDirection(locale)}
      flat
      className={cn(
        // No height, no flex, no clip: the responsive dialog frame in
        // `globals.css` gives every `.q-dialog` a viewport-bounded ceiling, a
        // header and footer that stay, and a body that scrolls. This surface
        // used to state all three itself.
        // One width, because there is one set of fields. The card used to
        // animate between 30rem and 50rem as its disclosure opened; the
        // disclosure is gone, and a fixed width is one fewer thing moving under
        // the pointer.
        'sm:w-[min(30rem,calc(100vw-2rem))]',
      )}
    >
      {/*
        No close button: this card's footer already ends in Cancel, and Escape
        and a backdrop click both close it. A third exit in the corner was
        crowding the title of the only surface a client record is written on.
      */}
      <DialogHeader
        title={client ? t('editTitle') : t('createTitle')}
        description={client ? undefined : t('createHint')}
        className="px-4 pt-4 sm:px-5 sm:pt-5"
      />

      <ClientForm
        locale={locale}
        client={client}
        onCancel={onClose}
        onSaved={onClose}
      />
    </Dialog>,
    document.body,
  );
}
