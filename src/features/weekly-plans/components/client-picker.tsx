'use client';

import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

import type { PlannableClient } from '../queries';
import { PLANNER_THEME } from '../theme';

/**
 * Choosing whose week is on screen.
 *
 * A navigation rather than local state: a dietitian works through several
 * clients in a sitting, and each one being its own URL means the back button, a
 * bookmark and a shared link all do the obvious thing — which is what the rail
 * this replaces was for.
 *
 * Composed from the registry combobox rather than the wrapper this used to
 * call. The wrapper existed to carry the swatch and the status badge, which the
 * registry has no props for — but `ComboboxItem` takes children, so the row is
 * simply written out here, where the thing being described lives.
 */
export function ClientPicker({
  clients,
  selectedClientId,
  appearance = 'field',
}: {
  clients: readonly PlannableClient[];
  selectedClientId?: string;
  appearance?: 'field' | 'heading';
}) {
  const t = useTranslations('weeklyPlans');
  const router = useRouter();

  const selected = clients.find((client) => client.id === selectedClientId) ?? null;

  return (
    <Combobox
      items={clients as PlannableClient[]}
      value={selected}
      /*
       * Compare by id, not by reference: any caller deriving its list inside
       * render rebuilds the objects each keystroke, and identity comparison
       * would drop the selection every time it did.
       */
      isItemEqualToValue={(a, b) => a?.id === b?.id}
      itemToStringLabel={(client) => client.fullName}
      onValueChange={(client) => {
        if (client) router.push(`/app/weekly-plans/${client.id}`);
      }}
    >
      <ComboboxInput
        aria-label={t('clients')}
        placeholder={t('searchClients')}
        // Full width on a phone, where it takes the header's first line to
        // itself and everything else wraps under it; a fixed 256px that refuses
        // to shrink is what pushed the rest of the row off the screen.
        className={cn(
          appearance === 'heading' ? 'w-full min-w-56 sm:w-80' : 'w-full sm:w-64 sm:shrink-0',
          // The heading appearance changes the *type*, and nothing else — the
          // box stays, so it still reads as something you can open rather than
          // as a title with a stray chevron beside it.
          appearance === 'heading' && '[&_input]:font-heading [&_input]:text-heading-sm [&_input]:font-semibold',
        )}
      />

      <ComboboxContent className={cn(PLANNER_THEME, appearance === 'heading' && 'min-w-72')}>
        <ComboboxEmpty>{t('noClients')}</ComboboxEmpty>

        <ComboboxList>
          {(client: PlannableClient) => (
            <ComboboxItem key={client.id} value={client}>
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: client.color }}
              />
              <span className="min-w-0 flex-1 truncate" dir="auto">
                {client.fullName}
              </span>
              <ClientStatus client={client} />
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

/**
 * The one-word state of this client's newest plan.
 *
 * "No profile" outranks the plan status: without a weight and a target nothing
 * can be generated, so that is the fact worth surfacing first.
 */
function ClientStatus({ client }: { client: PlannableClient }) {
  const t = useTranslations('weeklyPlans');

  if (!client.hasProfile) return <Badge variant="outline">{t('status.noProfile')}</Badge>;
  if (client.latestPlanStatus === 'published') return <Badge>{t('status.published')}</Badge>;
  if (client.latestPlanStatus === 'draft') return <Badge variant="muted">{t('status.draft')}</Badge>;

  return null;
}
