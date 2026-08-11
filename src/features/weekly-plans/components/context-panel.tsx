import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { TooltipHint } from '@/components/ui/tooltip-hint';
import { IntakeFormTrigger } from '@/features/clients/components/intake-form-trigger';
import { CLIENT_ACTIVITY_LEVELS, CLIENT_GOALS } from '@/features/clients/schema';
import { type Locale } from '@/i18n/routing';
import { isMember, membersOf } from '@/lib/enum';
import { cn } from '@/lib/utils';

import type { ClientContext, PlannableClient } from '../queries';
import { ALLERGENS } from '../schema';

import { ClientPicker } from './client-picker';

/**
 * The client facts needed while planning, now part of the board header instead
 * of a permanent side tab. The short strip answers the common questions; the
 * popover keeps the longer clinical notes one action away without narrowing the
 * seven-day workspace.
 */
export function ContextPanel({
  context,
  clients,
  locale,
}: {
  context: ClientContext;
  clients: readonly PlannableClient[];
  locale: Locale;
}) {
  const t = useTranslations('weeklyPlans');
  const tGoals = useTranslations('clients.goal');
  const tActivity = useTranslations('clients.activity');
  const { targets, profile } = context;

  const allergenTags = profile ? membersOf(ALLERGENS, profile.allergenTags) : [];
  const allergyText = [
    ...allergenTags.map((tag) => t(`allergens.${tag}`)),
    context.allergies?.trim(),
  ]
    .filter(Boolean)
    .join('، ');

  const notes = [
    { key: 'permanentInstructions', label: t('permanentInstructions'), body: profile?.permanentInstructions },
    { key: 'preferences', label: t('preferences'), body: profile?.preferences },
    { key: 'dislikes', label: t('dislikes'), body: profile?.dislikes },
    { key: 'medicalNotes', label: t('medicalNotes'), body: context.medicalNotes },
  ] as const;

  const measurements = [
    profile?.weightKg !== null && profile?.weightKg !== undefined
      ? t('kg', { value: profile.weightKg })
      : null,
    context.heightCm !== null ? t('cm', { value: context.heightCm }) : null,
    context.age !== null ? t('years', { value: context.age }) : null,
  ].filter((entry): entry is string => entry !== null);
  const selectedClient = clients.find((client) => client.id === context.clientId);

  return (
    <section
      aria-label={t('planningSnapshot')}
      className="rounded-lg border border-border bg-card px-3 py-2.5 shadow-card motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-(--duration-sweep)"
    >
      <div className="flex flex-wrap items-stretch gap-y-2">
        <div className="flex min-w-full flex-[1.4] flex-wrap items-center gap-2 pe-3 sm:min-w-64">
          {selectedClient ? (
            <Avatar name={selectedClient.fullName} color={selectedClient.color} />
          ) : null}

          <div className="min-w-44 flex-1">
            <ClientPicker
              clients={clients}
              selectedClientId={context.clientId}
              appearance="bar"
            />
            <p className="text-caption text-muted-foreground">{t('planningSnapshot')}</p>
          </div>

          {profile ? (
            <TooltipHint label={t('editProfile')}>
              <IntakeFormTrigger
                locale={locale}
                clientId={context.clientId}
                aria-label={t('editProfile')}
                className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
              >
                <Icon name="edit" />
              </IntakeFormTrigger>
            </TooltipHint>
          ) : (
            <IntakeFormTrigger
              locale={locale}
              clientId={context.clientId}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <Icon name="add" />
              {t('createProfile')}
            </IntakeFormTrigger>
          )}
        </div>

        <SummaryFact label={t('dailyTarget')} numeric>
          {context.effectiveKcal === null ? t('unset') : t('kcalValue', { value: context.effectiveKcal })}
        </SummaryFact>
        <SummaryFact label={t('fields.proteinTargetGrams')} numeric>
          {context.effectiveProteinGrams === null
            ? t('unset')
            : t('grams', { value: context.effectiveProteinGrams })}
        </SummaryFact>
        <SummaryFact label={t('bmi')} numeric>
          {targets.bmi === null ? t('unset') : targets.bmi.toFixed(1)}
        </SummaryFact>
        <SummaryFact label={t('goal')}>
          {isMember(CLIENT_GOALS, context.goal) ? tGoals(context.goal) : t('unset')}
        </SummaryFact>
        <SummaryFact
          label={t('allergies')}
          className={cn(
            allergyText ? 'text-status-medical-fg' : 'text-status-attention-fg',
            'min-w-44 flex-[1.25]',
          )}
        >
          {allergyText || t('allergiesMissing')}
        </SummaryFact>

        <Popover>
          <PopoverTrigger
            className={buttonVariants({ variant: 'neutral', size: 'sm', className: 'self-center' })}
          >
            <Icon name="info" />
            {t('planningNotes')}
          </PopoverTrigger>
          <PopoverContent align="end" side="bottom" className="max-h-[min(32rem,70vh)] w-80 overflow-y-auto p-4">
            <PopoverTitle className="text-label font-semibold">{t('planningNotes')}</PopoverTitle>

            {targets.missing.length > 0 && (
              <p className="rounded-md bg-status-attention-bg px-3 py-2 text-body-sm text-status-attention-fg">
                {t('missingFields', {
                  fields: targets.missing.map((field) => t(`fields.${field}`)).join('، '),
                })}
              </p>
            )}

            <dl className="grid grid-cols-2 gap-3 border-y border-border py-3 text-body-sm">
              <DetailFact label={t('activityLevel')}>
                {isMember(CLIENT_ACTIVITY_LEVELS, context.activityLevel)
                  ? tActivity(context.activityLevel)
                  : t('unset')}
              </DetailFact>
              <DetailFact label={t('measurements')}>
                {measurements.length ? measurements.join(' · ') : t('unset')}
              </DetailFact>
            </dl>

            <div className="divide-y divide-border">
              {notes.map((note) => (
                <div key={note.key} className="py-2.5 first:pt-0 last:pb-0">
                  <p className="text-caption font-semibold text-muted-foreground">{note.label}</p>
                  <p className="mt-1 text-body-sm leading-relaxed [overflow-wrap:anywhere]" dir="auto">
                    {note.body || t('unset')}
                  </p>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </section>
  );
}

function SummaryFact({
  label,
  numeric,
  className,
  children,
}: {
  label: string;
  numeric?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('min-w-28 border-s border-border px-3', className)}>
      <p className="text-caption text-muted-foreground">{label}</p>
      <p className="truncate text-label font-semibold" dir={numeric ? 'ltr' : 'auto'} title={String(children)}>
        {children}
      </p>
    </div>
  );
}

function DetailFact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="mt-1" dir="auto">{children}</dd>
    </div>
  );
}
