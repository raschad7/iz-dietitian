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
}: {
  clients: readonly PlannableClient[];
  selectedClientId?: string;
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
      className="w-64 shrink-0"
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
