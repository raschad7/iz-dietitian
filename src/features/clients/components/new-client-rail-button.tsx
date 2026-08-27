'use client';

import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ClientFormTrigger } from '@/features/clients/components/client-form-trigger';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * "New client", in the sidebar's head.
 *
 * The **same control** as the one on the register — `ClientFormTrigger`, which
 * opens the client card over whatever screen asked for it — wearing rail
 * dimensions instead of toolbar ones. Not a copy: the card, the loading state
 * and the focus return all come from the one component, so the two entry points
 * cannot drift.
 *
 * ## Why it is re-dressed rather than reused as-is
 *
 * The register's button is `size="default"` — 48px tall, `px-5`, a 10px radius
 * — which is right for a control in a toolbar of its peers and much too big for
 * a 16rem column whose rows are 40px. Four things change and nothing else:
 *
 * - **40px tall**, matching the destination rows below it exactly, so the head
 *   of the rail and the column under it sit on one rhythm.
 * - **`rounded-md`**, the rail's radius rather than the button's. Every other
 *   filled thing in this column — the active row, the folded trigger — is that
 *   shape, and a 10px radius beside them reads as a control that wandered in
 *   from a page.
 * - **`justify-start` with `px-3`**, so its glyph lands in the same 12px column
 *   as every row's glyph. Centred, the icon floated between two invisible
 *   columns and the button stopped belonging to the list.
 * - **A 20px glyph**, the rail's size, not the button's 16px.
 *
 * The fill is untouched: this is `variant="default"`, solid olive with a white
 * label, and it is the only filled thing in the rail's head. That is the whole
 * of its emphasis — it does not need to be taller or louder than the rows to be
 * read as the primary action, it needs to be the one thing with a background.
 *
 * ## Folded
 *
 * At 56px the label goes and the button becomes a 40px square, still solid,
 * still the first thing under the logo. `aria-label` carries the name in both
 * states — `ClientFormTrigger` renders a real `<button>` and takes it directly —
 * so the control is never a bare glyph to a screen reader.
 */
export function NewClientRailButton({ locale }: { locale: Locale }) {
  const t = useTranslations('nav');
  const label = t('newClient');

  return (
    <ClientFormTrigger
      locale={locale}
      aria-label={label}
      className={cn(
        buttonVariants({ variant: 'default' }),
        'h-10 w-full justify-start gap-3 rounded-md px-3 text-sm',
        'group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0',
      )}
    >
      <Icon name="addClient" className="size-5" />
      <span className="truncate group-data-[collapsible=icon]:hidden">{label}</span>
    </ClientFormTrigger>
  );
}
