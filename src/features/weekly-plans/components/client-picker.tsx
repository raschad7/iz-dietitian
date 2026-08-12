'use client';

import { useTranslations } from 'next-intl';
import { useTransition } from 'react';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Combobox,
  ComboboxCollection,
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
 * ## One surface, not two
 *
 * The combobox is the search box. A separate field inside the open list asked
 * the reader to move from the thing they had just clicked to a second box
 * underneath it to do the one thing the control exists for; typing where the
 * name is takes the caret to where the eye already is, and the chevron is what
 * says a list is behind it.
 *
 * No brand colour anywhere on it either. `outline` and `ghost` fill lime when
 * pressed and draw their label in olive — which is the system saying "act on
 * me", and this control is not an action; it is where you are. Neutral tones,
 * a black label, and the warm grey fill for hover and open.
 */
export function ClientPicker({
  clients,
  selectedClientId,
  appearance = 'field',
}: {
  clients: readonly PlannableClient[];
  selectedClientId?: string;
  /**
   * `field` is a control on a page — the first screen, where nobody is chosen
   * yet. `bar` is the planner header, where the control *is* the client's name
   * and must not read as a box drawn around it.
   */
  appearance?: 'field' | 'bar';
}) {
  const t = useTranslations('weeklyPlans');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const selected = clients.find((client) => client.id === selectedClientId) ?? null;
  const bar = appearance === 'bar';

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
        placeholder={t('selectClient')}
        // `neutral`, in both places. The brand focus ring belongs to fields that
        // take an answer; this one takes you somewhere.
        focusTone={bar ? 'borderless' : 'neutral'}
        className={cn(
          // Full width on a phone, where it takes the header's first line to
          // itself and everything else wraps under it; a fixed 256px that
          // refuses to shrink is what pushed the rest of the row off the screen.
          bar ? 'h-11 w-full min-w-44 border-transparent' : 'h-12 w-full',
          /*
            The warm grey the rest of the app hovers with — `--accent`, the same
            fill a neutral button takes — held while the list is open so the
            control does not go flat the moment it is doing something. Open is
            read with `has-`, because `aria-expanded` sits on the input inside
            the group rather than on the group.

            Marked important: the `borderless` tone the header uses declares its
            own transparent fill unconditionally, and two utilities of equal
            specificity are settled by stylesheet order rather than by intent.
            This one is the intent.
          */
          'transition-colors hover:bg-accent! has-aria-expanded:bg-accent!',
          // The header's copy is the client's name — the subject of the screen,
          // in the display face. `font-medium`, not semibold: it needs no help
          // being read, and at semibold it competed with the figures beside it.
          bar && '[&_input]:text-center [&_input]:font-heading [&_input]:text-heading-sm [&_input]:font-medium',
          pending && 'pointer-events-none opacity-60',
        )}
      />

      <ComboboxContent className={cn(PLANNER_THEME, 'min-w-72')}>
        <ComboboxEmpty>{t('noClients')}</ComboboxEmpty>

        <ComboboxList>
          <ComboboxCollection>
            {(client: PlannableClient) => (
              <ComboboxItem
                key={client.id}
                value={client}
                /*
                  The mark has to fill its disc.

                  `ComboboxItem` sizes every unclassed `svg` inside it to 16px —
                  right for the tick and the chevrons it was written for, and
                  wrong for an avatar, which is a 28px circle with its glyph
                  drawn edge to edge. At 16px the glyph sat in the middle of the
                  disc as a small square on a pale ground, which is what made
                  these read as squares in circles. `[&>svg]` on the avatar
                  itself cannot win that, and neither does an equally specific
                  override here — two utilities that tie are settled by
                  stylesheet order — so it is marked important, which is the
                  only way to say "the avatar's own sizing wins" and mean it.
                */
                className="py-1.5 [&_[data-slot=avatar]>svg]:size-full!"
              >
                {/*
                  The client's own mark, in their calendar colour — the same
                  disc the planner header and the suggestion cards head them
                  with, so the person in this list is recognisably the person on
                  the board. `patient-tone` is the scope `--tone-mark` and
                  `--tone-fill` are defined in; see `patient-color.ts`.
                */}
                <span
                  className="patient-tone contents"
                  style={patientToneStyle(client.seq)}
                  aria-hidden
                >
                  <Avatar name={client.fullName} color="var(--tone-mark)" size="sm" />
                </span>
                <span className="min-w-0 flex-1 truncate" dir="auto">
                  {client.fullName}
                </span>
                <ClientStatus client={client} />
              </ComboboxItem>
            )}
          </ComboboxCollection>
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
