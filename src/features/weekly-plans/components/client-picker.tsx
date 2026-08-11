'use client';

import { useTranslations } from 'next-intl';
import { useTransition } from 'react';

import { Badge } from '@/components/ui/badge';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import { patientToneStyle } from '@/features/booking/patient-color';
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
  appearance?: 'field' | 'heading' | 'bar';
}) {
  const t = useTranslations('weeklyPlans');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

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
        /*
         * Re-picking whoever is already on screen is not a navigation. The
         * transition keeps the current board interactive while the next one
         * loads, and `pending` fades the control so the delay has somewhere
         * visible to live.
         */
        if (!client || client.id === selectedClientId) return;
        startTransition(() => router.push(`/app/weekly-plans/${client.id}`));
      }}
    >
      <ComboboxInput
        aria-label={t('clients')}
        placeholder={t('searchClients')}
        focusTone={appearance === 'field' ? 'neutral' : appearance === 'bar' ? 'borderless' : 'brand'}
        // Full width on a phone, where it takes the header's first line to
        // itself and everything else wraps under it; a fixed 256px that refuses
        // to shrink is what pushed the rest of the row off the screen.
        className={cn(
          appearance === 'heading'
            ? 'h-12 w-full min-w-56 sm:w-80'
            : appearance === 'bar'
              ? 'h-11 w-full min-w-44 border-transparent bg-transparent'
              : 'h-12 w-full',
          // The header selector is the client's title. The chevron is enough
          // affordance here: opening the list must not redraw the title as a
          // nested field inside the planner header.
          appearance === 'heading' &&
            '[&_input]:font-heading [&_input]:text-heading-sm [&_input]:font-semibold',
          appearance === 'bar' &&
            '[&_input]:text-center [&_input]:font-heading [&_input]:text-heading-sm [&_input]:font-semibold',
          pending && 'pointer-events-none opacity-60',
        )}
      />

      <ComboboxContent className={cn(PLANNER_THEME, appearance !== 'field' && 'min-w-72')}>
        <ComboboxEmpty>{t('noClients')}</ComboboxEmpty>

        <ComboboxList>
          {(client: PlannableClient) => (
            <ComboboxItem key={client.id} value={client}>
              {/*
                The client's calendar colour, not the hex on their record — the
                dot here and the appointment block on the grid are the same
                person, so they are the same colour. `--tone-mark` is the deep
                step of the ramp, which is what a 10px dot needs: the pale card
                fill at that size reads as no colour at all.
              */}
              <span
                aria-hidden
                className="patient-tone size-2.5 shrink-0 rounded-full bg-(--tone-mark)"
                style={patientToneStyle(client.seq)}
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
