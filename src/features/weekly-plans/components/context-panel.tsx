import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { TooltipHint } from '@/components/ui/tooltip-hint';
import { patientToneStyle } from '@/features/booking/patient-color';
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
  embedded = false,
}: {
  context: ClientContext;
  clients: readonly PlannableClient[];
  locale: Locale;
  embedded?: boolean;
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
      className={cn(
        'bg-card px-4 py-3',
        !embedded && 'rounded-lg border border-border shadow-card',
      )}
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center xl:grid-cols-[minmax(17rem,1.05fr)_minmax(34rem,2fr)_auto]">
        {/* `gap-2`, not `gap-3`. The disc and the name are one thing — a person
            — and the same gutter that separates them from the profile button
            made them read as two items in a toolbar. */}
        {/* Two things, always: the disc and the name. Nothing else joins this
            row — the profile control lives in the action column with the other
            profile control, so the header keeps one layout whatever state the
            client is in. */}
        <div className="flex min-w-0 flex-wrap items-center gap-2 xl:flex-nowrap">
          {/*
            The client's calendar colour — the disc heading the week being
            planned is the one their appointments are drawn in. See
            `patient-color.ts`; `contents` keeps this scope out of the row's
            own layout.
          */}
          {selectedClient ? (
            <span className="patient-tone contents" style={patientToneStyle(selectedClient.seq)}>
              <Avatar name={selectedClient.fullName} color="var(--tone-mark)" size="planner" />
            </span>
          ) : null}

          <div className="min-w-44 flex-1">
            <ClientPicker
              clients={clients}
              selectedClientId={context.clientId}
              appearance="bar"
            />
          </div>

        </div>

        <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:col-span-2 lg:grid-cols-5 xl:col-span-1 xl:col-start-2 xl:row-start-1">
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
            wrap
            className={cn(
              allergyText ? 'text-status-medical-fg' : 'text-status-attention-fg',
              'col-span-2 sm:col-span-1',
            )}
          >
            {allergyText || t('allergiesMissing')}
          </SummaryFact>
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-muted/70 p-1 lg:col-start-2 lg:row-start-1 xl:col-start-3 xl:flex-col">
          <Popover>
          <PopoverTrigger
            aria-label={t('planningNotes')}
            title={t('planningNotes')}
            className={buttonVariants({
              variant: 'neutral',
              size: 'icon-sm',
            })}
          >
            <Icon name="info" />
            <span className="sr-only">{t('planningNotes')}</span>
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

          {/*
            One control in two states, in one place — the same rule the publish
            button follows.

            Creating the first profile and editing an existing one open the same
            form and mean the same thing to the layout, so they are the same
            button: a plus until there is a profile, a pencil after. It used to
            be two different controls in two different places — a labelled
            "create profile" button wedged in beside the client's name, and a
            pencil down here — so filling in a profile moved a control across
            the header and changed its shape on the way. The header now has one
            layout, whatever state the client is in.
          */}
          <TooltipHint label={profile ? t('editProfile') : t('createProfile')}>
            <IntakeFormTrigger
              locale={locale}
              clientId={context.clientId}
              aria-label={profile ? t('editProfile') : t('createProfile')}
              className={buttonVariants({ variant: 'neutral', size: 'icon-sm' })}
            >
              <Icon name={profile ? 'edit' : 'add'} />
              <span className="sr-only">{profile ? t('editProfile') : t('createProfile')}</span>
            </IntakeFormTrigger>
          </TooltipHint>
        </div>
      </div>
    </section>
  );
}

function SummaryFact({
  label,
  numeric,
  wrap,
  className,
  children,
}: {
  label: string;
  numeric?: boolean;
  wrap?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex min-h-14 min-w-0 flex-col items-center justify-center rounded-md bg-muted/70 px-2 py-2 text-center',
        className,
      )}
    >
      <p className="text-body-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-0.5 w-full text-body-md font-semibold',
          wrap ? 'leading-snug xl:truncate xl:leading-normal' : 'truncate',
        )}
        dir={numeric ? 'ltr' : 'auto'}
        title={String(children)}
      >
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
