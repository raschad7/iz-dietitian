import { getTranslations } from 'next-intl/server';

import { buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ClientActionsMenu } from '@/features/clients/components/client-actions-menu';
import { ClientFormTrigger } from '@/features/clients/components/client-form-trigger';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * What you can do to this record: correct it, or the overflow menu.
 *
 * **This was the record header, and it no longer says who the client is.** It
 * carried the avatar, the name and an archived badge above the tab bar — all
 * three of which the identity panel now draws, in the column beside every view.
 *
 * **It sits at the foot of that panel.** It was briefly on the breadcrumb line
 * instead, which put the record's two controls as far from the record as the
 * page allows and left them competing with a "back to clients" link for the same
 * row. The panel is where the client *is*; the way to correct the client belongs
 * under it, the way an editable card ends in the button that edits it.
 *
 * It replaced a link to the plan board there. That was a good button on the
 * wrong panel: this column is who somebody is, and the board is a week's work —
 * it is one click away from the Billing &amp; Plans view, which is where a plan
 * is the subject rather than a shortcut.
 *
 * **Edit fills the row and the menu is a square beside it.** The glyph wears the
 * app's round ghost chip everywhere else, and next to a full-width button that
 * read as a stray bubble at the end of a bar; squared to the 8px `radius-sm` it
 * reads as the second half of one control. It is still 40px, so it still clears
 * the touch minimum on its own.
 *
 * A server component. The edit dialog and the menu bring their own client
 * boundaries.
 */
export async function ClientRecordActions({
  clientId,
  clientName,
  archived,
  locale,
  className,
}: {
  clientId: string;
  /** Only for the delete confirmation, which names who it is about. */
  clientName: string;
  archived: boolean;
  locale: Locale;
  /** For the panel that pins this row to its own floor. See `ClientProfilePanel`. */
  className?: string;
}) {
  const t = await getTranslations('clients');

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/*
        The solid primary. It is the only thing in this column you can press, so
        there is nothing here for an olive label to compete with.
      */}
      <ClientFormTrigger
        locale={locale}
        clientId={clientId}
        className={buttonVariants({ variant: 'default', className: 'min-w-0 flex-1' })}
      >
        <Icon name="edit" />
        {t('edit')}
      </ClientFormTrigger>

      <ClientActionsMenu
        locale={locale}
        clientId={clientId}
        clientName={clientName}
        archived={archived}
        triggerClassName="shrink-0 rounded-sm"
      />
    </div>
  );
}
