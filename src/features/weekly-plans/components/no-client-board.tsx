'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';

import { Avatar } from '@/components/ui/avatar';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { formatMediumDate, formatMinute } from '@/features/booking/format';
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
      <section className="flex min-h-0 min-w-0 flex-1 justify-center overflow-y-auto px-4 py-12 sm:px-6 lg:py-20">
        <div className="w-full max-w-3xl">
          <div className="mx-auto max-w-xl text-center">
            <h2 className="font-heading text-heading-lg font-semibold [text-wrap:balance]">
              {t('noClientTitle')}
            </h2>
            <p className="mt-2 text-body-sm leading-relaxed text-muted-foreground">
              {t('noClientHint')}
            </p>
            <div className="mx-auto mt-6 max-w-lg text-start">
              <ClientPicker clients={clients} />
            </div>
          </div>

          {suggestions.length > 0 ? (
            <div className="mt-12">
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
      <Card interactive size="sm" className="h-full min-h-40 justify-center shadow-none">
        <CardHeader className="grid-cols-1 justify-items-center gap-y-2 text-center">
          <Avatar name={client.fullName} color={client.color} size="lg" />
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
