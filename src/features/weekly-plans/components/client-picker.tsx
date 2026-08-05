'use client';

import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
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
      /*
       * The heading appearance changes the *type*, and nothing else.
       *
       * It used to strip the box as well — transparent border, transparent
       * fill, no shadow, `ps-0` — which left the client's name sitting on the
       * page as if it were the title, with a chevron stranded 200px away at the
       * far edge of an invisible 320px control. Nobody reads that as "you can
       * change who this is"; they read it as a heading and a stray arrow.
       *
       * So the box comes back. `.q-field` gives it the neutral resting edge,
       * the olive-50 hover fill and the 20px inset that ties the name to the
       * chevron at the other end — the same language every other control in the
       * app speaks. It is still unmistakably the subject of the page, because
       * the name inside it is still heading type; it just also looks like
       * something you can open.
       *
       * `text-heading-sm`, not `heading-md`: the scale has no `md` step, so that
       * class emitted nothing and the name was rendering at the field's own
       * 16px body size.
       */
      inputClassName={
        appearance === 'heading' ? 'font-heading text-heading-sm font-semibold' : undefined
      }
      popupClassName={cn(PLANNER_THEME, appearance === 'heading' && 'min-w-72')}
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
