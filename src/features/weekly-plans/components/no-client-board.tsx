'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';

import { Avatar } from '@/components/ui/avatar';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { formatMediumDate, formatMinute } from '@/features/booking/format';
import { patientToneStyle } from '@/features/booking/patient-color';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';

import { plannerClientSuggestions, type PlannerClientSuggestion } from '../client-suggestions';
import type { PlannableClient } from '../queries';

import { ClientPicker } from './client-picker';

/** A useful first screen: search plus clients whose plans are most time-sensitive. */
export function NoClientBoard({
  clients,
  locale,
}: {
  clients: readonly PlannableClient[];
  locale: Locale;
}) {
  const t = useTranslations('weeklyPlans');
  const suggestions = useMemo(() => plannerClientSuggestions(clients).slice(0, 4), [clients]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/*
        ── The whitespace answers to the screen's height, not to its width ──

        This was `py-12 lg:py-20`: 96px of padding, and 160px once the window was
        wide. Width was the wrong thing to ask. A laptop is *wide and short* —
        1536×864, or 1920×1080 at 125% scaling — so it took the largest step of
        padding on the screen with the least height to spend it, and the four
        suggestion cards ran past the frame. The section scrolls, so nothing was
        lost; but the fourth subscriber was below the fold on the screen whose
        whole job is to offer four subscribers.

        `clamp()` rather than another breakpoint. The floor keeps the block off
        the frame's edge on a phone, the ceiling keeps a 4K monitor from pushing
        the picker into the middle distance, and between them the padding is a
        share of the height it is actually spending — which is the quantity that
        was never being read.

        ⚠ `vh` here is padding, never a surface's size. The rule against sizing in
        `vh` (see "Viewport height, the keyboard, and the safe area" in
        docs/design-system.md) is about boxes that must fit the screen; this box
        is bounded by the shell already and this value only ever moves
        whitespace, so an address bar sliding away costs a few pixels of gap and
        nothing else.
      */}
      <section className="flex min-h-0 min-w-0 flex-1 justify-center overflow-y-auto px-4 py-[clamp(1.5rem,6vh,5rem)] sm:px-6">
        <div className="w-full max-w-3xl">
          <div className="mx-auto max-w-xl text-center">
            <h2 className="font-heading text-heading-lg font-semibold [text-wrap:balance]">
              {t('noClientTitle')}
            </h2>
            <p className="mt-2 text-body-sm leading-relaxed text-muted-foreground">
              {t('noClientHint')}
            </p>
            <div data-guide="planner-picker" className="mx-auto mt-6 max-w-lg text-start">
              <ClientPicker clients={clients} />
            </div>
          </div>

          {suggestions.length > 0 ? (
            /* The tour's planner-board step points here. It is `optional` in
               `steps.ts` because a clinic with no plans yet has no suggestions
               to make, and the step falls back to a centred card. */
            /* The same rule as the section's padding, and the same reason: this
               was a flat `mt-12`, which is a comfortable gap on a tall screen
               and 48px a laptop cannot spare. See the note on the section. */
            <div data-guide="planner-suggestions" className="mt-[clamp(1.5rem,4vh,3rem)]">
              <div className="mb-4 text-center">
                  <h3 className="font-heading text-heading-sm font-semibold">
                    {t('suggestedClientsTitle')}
                  </h3>
                  <p className="mt-1 text-caption text-muted-foreground">
                    {t('suggestedClientsHint')}
                  </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {suggestions.map((suggestion) => (
                  <SuggestedClientCard key={suggestion.client.id} suggestion={suggestion} locale={locale} />
                ))}
              </div>
            </div>
          ) : (
            <Card variant="empty" className="mx-auto mt-9 max-w-xl">
              <CardHeader>
                <CardTitle icon="clients">{t('noClients')}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-4">
                <p className="text-body-sm text-muted-foreground">{t('noActiveClientsHint')}</p>
                <Link href="/app/clients" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                  {t('browseClients')}
                  <Icon name="chevronEnd" />
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

    </div>
  );
}

function SuggestedClientCard({
  suggestion,
  locale,
}: {
  suggestion: PlannerClientSuggestion;
  locale: Locale;
}) {
  const t = useTranslations('weeklyPlans');
  const { client, reason } = suggestion;
  const appointment = reason === 'nextAppointment' ? client.nextAppointment : client.lastAppointment;
  const when = appointment
    ? `${formatMediumDate(locale, appointment.date)} · ${formatMinute(
        locale,
        appointment.date,
        appointment.startMinute,
      )}`
    : null;

  return (
    <Link
      href={`/app/weekly-plans/${client.id}`}
      className="rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {/*
        `min-h-32`, down from `min-h-40`.

        The floor is what keeps a card squarish rather than letting a disc, a
        name and one line of text collapse into a strip — it is not carrying the
        card's real height, which comes from that content. 40 was 20px of empty
        card per row, and there are two rows of these: 40px of a laptop's frame
        spent on nothing, on the screen that has the least of it to spend.
      */}
      <Card interactive size="sm" className="h-full min-h-32 justify-center shadow-none">
        <CardHeader className="grid-cols-1 justify-items-center gap-y-2 text-center">
          {/* The client's calendar colour, so a suggestion card and the block
              their next appointment sits in are the same person in the same
              hue. `contents` keeps this scope out of the header's grid. */}
          <span className="patient-tone contents" style={patientToneStyle(client.seq)}>
            <Avatar name={client.fullName} color="var(--tone-mark)" size="lg" />
          </span>
          <CardTitle size="sm" className="w-full truncate text-center" dir="auto">
            {client.fullName}
          </CardTitle>
        </CardHeader>
        <CardContent
          className="flex items-center justify-center gap-2 text-center text-caption text-muted-foreground"
        >
          <Icon name={reason === 'activeClient' ? 'clients' : 'calendar'} className="size-4 shrink-0" />
          <span className="truncate">
            {when ? t(`suggestionReason.${reason}`, { when }) : t(`suggestionReason.${reason}`)}
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
