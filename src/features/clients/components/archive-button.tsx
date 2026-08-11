'use client';

import { useTranslations } from 'next-intl';

import { ConfirmSubmitButton } from '@/components/ui/confirm-submit-button';
import { setClientStatusAction } from '@/features/clients/actions';
import { type Locale } from '@/i18n/routing';

/**
 * Archive / restore.
 *
 * **Archiving asks first; restoring does not.** The two are not mirror images
 * of each other from where the reader sits. Archiving is the one that makes a
 * client disappear from the list you are looking at — on a register row it sits
 * two glyphs from "edit", and the dietitian who mis-aims is left staring at a
 * list that silently lost someone, with no clue which row went or where it
 * went to. One sentence naming the other page is what turns that into a
 * recoverable mistake. Restoring puts a record back where it can be seen, so
 * there is nothing to warn about and nothing to undo.
 *
 * The dialog is `ConfirmDialog` by way of {@link ConfirmSubmitButton} — passing
 * a `confirmMessage` is the whole of it.
 */
export function ArchiveButton({
  locale,
  clientId,
  archived,
  variant = 'outline',
  size = 'default',
  iconOnly = false,
  className,
}: {
  locale: Locale;
  clientId: string;
  archived: boolean;
  variant?: 'outline' | 'ghost' | 'neutral' | 'destructiveGhost';
  size?: 'default' | 'sm';
  /** Table rows use the glyph; the record page keeps the words. */
  iconOnly?: boolean;
  className?: string;
}) {
  const t = useTranslations('clients');

  const label = archived ? t('actions.restore') : t('actions.archive');

  return (
    <form action={setClientStatusAction} className="flex">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="intent" value={archived ? 'restore' : 'archive'} />
      <ConfirmSubmitButton
        label={label}
        /*
          Only the archive direction warns, and only that direction is clay.
          Restore is the way back out of this, so it stays a neutral glyph —
          painting both ends of a reversible pair red would say the colour
          means "changes something" rather than "think about this one".
        */
        confirmMessage={archived ? undefined : t('actions.confirmArchive')}
        confirmTitle={archived ? undefined : t('actions.confirmArchiveTitle')}
        /*
          On a register row the glyph is clay: archive is the only action in
          that cell that removes the row from the list, and the two beside it
          (open the planner, edit) merely go somewhere. Clay is this system's
          one alarm colour and `destructiveGhost` is its quietest form — no
          fill until the pointer arrives — which is as loud as a row action
          should get twenty times down a page. It also tints the confirmation
          dialog to match, so the question wears the colour of the button that
          asked it.
        */
        variant={iconOnly ? (archived ? 'ghost' : 'destructiveGhost') : variant}
        size={iconOnly ? 'icon-sm' : size}
        icon={archived ? 'restore' : 'archive'}
        className={className}
      />
    </form>
  );
}
