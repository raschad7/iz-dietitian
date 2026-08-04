'use client';

import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { useRouter } from '@/i18n/navigation';

import type { PlannableClient } from '../queries';

/**
 * Choosing whose week is on screen.
 *
 * A navigation rather than local state: a dietitian works through several
 * clients in a sitting, and each one being its own URL means the back button, a
 * bookmark and a shared link all do the obvious thing — which is what the rail
 * this replaces was for.
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

  const options: ComboboxOption<string>[] = clients.map((client) => ({
    value: client.id,
    label: client.fullName,
    swatch: client.color,
    meta: <ClientStatus client={client} />,
  }));

  return (
    <Combobox
      options={options}
      value={selectedClientId ?? null}
      onValueChange={(clientId) => {
        if (clientId) router.push(`/app/weekly-plans/${clientId}`);
      }}
      label={t('clients')}
      placeholder={t('searchClients')}
      emptyMessage={t('noClients')}
      // Full width on a phone, where it takes the header's first line to
      // itself and everything else wraps under it; a fixed 256px that refuses
      // to shrink is what pushed the rest of the row off the screen.
      className={appearance === 'heading' ? 'w-full min-w-56 sm:w-80' : 'w-full sm:w-64 sm:shrink-0'}
      inputClassName={
        appearance === 'heading'
          ? 'h-10 border-transparent bg-transparent py-0 ps-0 pe-9 font-heading text-heading-md font-semibold shadow-none hover:bg-accent/50 focus:bg-card'
          : undefined
      }
      popupClassName={appearance === 'heading' ? 'min-w-72' : undefined}
    />
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
