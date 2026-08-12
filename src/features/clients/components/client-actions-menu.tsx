'use client';

import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ArchiveButton } from '@/features/clients/components/archive-button';
import { DeleteClientButton } from '@/features/clients/components/delete-client-button';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * Archive and delete, behind one glyph.
 *
 * The record header used to put "edit", "archive" and "delete permanently" in a
 * row as three peers. Two of them wore the olive label the design system uses to
 * mean "act on me", which said it twice and so said it about nothing — and the
 * third was an irreversible delete sitting one mis-aimed click from the button
 * a dietitian presses several times a day.
 *
 * They are not peers. Editing is routine, archiving is occasional, and deleting
 * is a decision. Only the routine one stays on the surface; these two move
 * behind a menu, which is the cost their frequency earns them and the friction
 * the last one deserves.
 *
 * Delete sits last, furthest from the trigger — the same reasoning that puts
 * sign-out at the far end of the rail's profile menu: it is the item a
 * mis-aimed click most wants to miss.
 */
export function ClientActionsMenu({
  locale,
  clientId,
  clientName,
  archived,
  triggerClassName,
}: {
  locale: Locale;
  clientId: string;
  clientName: string;
  archived: boolean;
  /**
   * Restyles the glyph the menu hangs from. The default is the round ghost
   * chip every icon-only control in the app wears; the record's identity panel
   * pairs it with a full-width Edit and squares it off to match, which is a
   * property of *that row* rather than of this menu.
   */
  triggerClassName?: string;
}) {
  const t = useTranslations('clients');

  return (
    <Popover>
      <PopoverTrigger
        aria-label={t('actions.more')}
        className={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), triggerClassName)}
      >
        <Icon name="moreActions" className="size-5" />
      </PopoverTrigger>

      {/*
        `align="end"` so the panel hangs from the trigger's own edge in both
        directions — Base UI resolves `end` logically, so this needs no `:dir()`
        and no locale branch.
      */}
      <PopoverContent align="end" className="w-64 gap-1 p-1.5">
        <ArchiveButton
          locale={locale}
          clientId={clientId}
          archived={archived}
          variant="ghost"
          size="sm"
          className="w-full max-w-none justify-start"
        />
        <DeleteClientButton
          locale={locale}
          clientId={clientId}
          clientName={clientName}
          variant="destructiveGhost"
          size="sm"
          className="w-full max-w-none justify-start"
        />
      </PopoverContent>
    </Popover>
  );
}
