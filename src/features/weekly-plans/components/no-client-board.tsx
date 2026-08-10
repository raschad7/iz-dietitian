'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Avatar } from '@/components/ui/avatar';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { formatMediumDate, formatMinute } from '@/features/booking/format';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

import { plannerClientSuggestions, type PlannerClientSuggestion } from '../client-suggestions';
import type { CatalogEntry, PlannableClient } from '../queries';

import { ClientPicker } from './client-picker';
import { DishCatalogDrawer } from './dish-catalog-drawer';

/** A useful first screen: search plus clients whose plans are most time-sensitive. */
export function NoClientBoard({
  clients,
  catalog,
  locale,
}: {
  clients: readonly PlannableClient[];
  catalog: readonly CatalogEntry[];
  locale: Locale;
}) {
  const t = useTranslations('weeklyPlans');
  const [catalogOpen, setCatalogOpen] = useState(false);
  const suggestions = useMemo(() => plannerClientSuggestions(clients), [clients]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <div className="flex justify-end border-b border-border pb-4">
        <Button type="button" size="sm" variant="outline" onClick={() => setCatalogOpen(true)}>
          <Icon name="dishes" />
          {t('tabs.dishes')}
        </Button>
      </div>

      <section className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-y-auto px-3 py-8 sm:px-6 sm:py-12">
        <div className="w-full max-w-4xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-(--duration-sweep)">
          <div className="mx-auto max-w-xl text-center">
            <h2 className="font-heading text-heading-lg font-semibold [text-wrap:balance]">
              {t('noClientTitle')}
            </h2>
            <p className="mt-2 text-body-sm leading-relaxed text-muted-foreground">
              {t('noClientHint')}
            </p>
            <div className="mt-5 text-start">
              <ClientPicker clients={clients} />
            </div>
          </div>

          {suggestions.length > 0 ? (
            <div className="mt-9">
              <div className="mb-3 flex items-end justify-between gap-4">
                <div>
                  <h3 className="font-heading text-heading-sm font-semibold">
                    {t('suggestedClientsTitle')}
                  </h3>
                  <p className="mt-1 text-caption text-muted-foreground">
                    {t('suggestedClientsHint')}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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

      <DishCatalogDrawer
        open={catalogOpen}
        onOpenChange={setCatalogOpen}
        catalog={catalog}
        usage={{}}
        slot={null}
        editable={false}
        locale={locale}
      />
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
      <Card interactive size="sm" className="h-full">
        <CardHeader className="grid-cols-[auto_1fr] items-center gap-x-3">
          <Avatar name={client.fullName} color={client.color} />
          <CardTitle size="sm" className="truncate" dir="auto">
            {client.fullName}
          </CardTitle>
        </CardHeader>
        <CardContent
          className={cn(
            'flex items-center gap-2 text-caption',
            reason === 'nextAppointment' ? 'text-primary' : 'text-muted-foreground',
          )}
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
