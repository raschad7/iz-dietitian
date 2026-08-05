import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Tooltip } from '@/components/ui/tooltip';
import { CLIENT_ACTIVITY_LEVELS, CLIENT_GOALS } from '@/features/clients/schema';
import { Link } from '@/i18n/navigation';
import { isMember, membersOf } from '@/lib/enum';

import type { ClientContext } from '../queries';
import { ALLERGENS } from '../schema';

/** A compact clinical snapshot for decisions made while building the week. */
export function ContextPanel({ context }: { context: ClientContext }) {
  const t = useTranslations('weeklyPlans');
  const tGoals = useTranslations('clients.goal');
  const tActivity = useTranslations('clients.activity');
  const { targets, profile } = context;

  const notes = [
    { key: 'permanentInstructions', label: t('permanentInstructions'), body: profile?.permanentInstructions },
    { key: 'preferences', label: t('preferences'), body: profile?.preferences },
    { key: 'dislikes', label: t('dislikes'), body: profile?.dislikes },
    { key: 'medicalNotes', label: t('medicalNotes'), body: context.medicalNotes },
  ] as const;

  const measurements = [
    profile?.weightKg !== null && profile?.weightKg !== undefined
      ? { key: 'weight', value: t('kg', { value: profile.weightKg }) }
      : null,
    context.heightCm !== null ? { key: 'height', value: t('cm', { value: context.heightCm }) } : null,
    context.age !== null ? { key: 'age', value: t('years', { value: context.age }) } : null,
  ].filter((entry): entry is { key: string; value: string } => entry !== null);

  const allergenTags = profile ? membersOf(ALLERGENS, profile.allergenTags) : [];
  const hasAllergyRecord = allergenTags.length > 0 || Boolean(context.allergies?.trim());

  return (
    <div className="flex flex-col gap-5 text-body-sm">
      <header className="flex items-start justify-between gap-3 border-b border-border pb-3">
        <div className="min-w-0">
          <h3 className="truncate font-heading text-heading-sm font-semibold" dir="auto">
            {context.fullName}
          </h3>
          <p className="mt-0.5 text-caption text-muted-foreground">{t('planningSnapshot')}</p>
        </div>
        {/*
          Two different jobs, so two different controls.

          With a profile on file this is a quiet "go and change something"
          affordance sitting beside a name — a pen is enough, and a five-word
          link there competed with the client's own name for the corner. Without
          one it is the single most important thing on the panel: nothing can be
          generated until it exists, so it keeps its words and takes a box.

          The pen is icon-only, so it carries a real `aria-label` and a tooltip
          reminding a pointer of the same string — a control whose only label is
          a tooltip is unusable by keyboard and by touch alike.
        */}
        {profile ? (
          <Tooltip label={t('editProfile')} className="shrink-0">
            <Link
              href={`/app/weekly-plans/${context.clientId}/profile`}
              aria-label={t('editProfile')}
              className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
            >
              <Icon name="edit" />
            </Link>
          </Tooltip>
        ) : (
          <Link
            href={`/app/weekly-plans/${context.clientId}/profile`}
            className={buttonVariants({ variant: 'outline', size: 'sm', className: 'shrink-0' })}
          >
            <Icon name="add" />
            {t('createProfile')}
          </Link>
        )}
      </header>

      {targets.missing.length > 0 && (
        <p className="rounded-md bg-status-attention-bg px-3 py-2.5 leading-relaxed text-status-attention-fg">
          {t('missingFields', {
            fields: targets.missing.map((field) => t(`fields.${field}`)).join('، '),
          })}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <Stat label={t('dailyTarget')}>
          {context.effectiveKcal === null ? (
            <Unset label={t('notComputable')} />
          ) : (
            <>
              <strong className="font-heading text-heading-sm font-semibold tabular-nums" dir="ltr">
                {t('kcalValue', { value: context.effectiveKcal })}
              </strong>
              {context.effectiveProteinGrams !== null && (
                <span className="text-caption text-muted-foreground">
                  {t('proteinTarget', { value: context.effectiveProteinGrams })}
                </span>
              )}
              {profile?.dailyKcalTarget !== null && profile?.dailyKcalTarget !== undefined && (
                <span className="text-caption text-primary">{t('override')}</span>
              )}
            </>
          )}
        </Stat>

        <Stat label={t('bmi')}>
          {targets.bmi === null ? (
            <Unset />
          ) : (
            <>
              <strong className="font-heading text-heading-sm font-semibold tabular-nums" dir="ltr">
                {targets.bmi.toFixed(1)}
              </strong>
              {targets.bmiCategory && (
                <span className="text-caption text-muted-foreground">
                  {t(`bmiCategories.${targets.bmiCategory}`)}
                </span>
              )}
            </>
          )}
        </Stat>
      </div>

      <section className="border-y border-border py-3.5">
        <h4 className="text-label font-semibold text-muted-foreground">{t('allergies')}</h4>
        {hasAllergyRecord ? (
          <div className="mt-2 flex flex-col gap-2">
            {allergenTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {allergenTags.map((tag) => (
                  <Badge key={tag} variant="medical">
                    {t(`allergens.${tag}`)}
                  </Badge>
                ))}
              </div>
            )}
            {context.allergies && <p className="leading-relaxed">{context.allergies}</p>}
          </div>
        ) : (
          <p className="mt-2 rounded-md bg-status-attention-bg px-3 py-2 leading-relaxed text-status-attention-fg">
            {t('allergiesMissing')}
          </p>
        )}
      </section>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Section label={t('goal')}>
          {isMember(CLIENT_GOALS, context.goal) ? tGoals(context.goal) : <Unset />}
        </Section>
        <Section label={t('activityLevel')}>
          {isMember(CLIENT_ACTIVITY_LEVELS, context.activityLevel) ? (
            tActivity(context.activityLevel)
          ) : (
            <Unset />
          )}
        </Section>
      </div>

      <Section label={t('measurements')}>
        {measurements.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {measurements.map((measurement) => (
              <span
                key={measurement.key}
                className="rounded-md bg-muted px-2.5 py-1.5 text-label text-muted-foreground"
                dir="auto"
              >
                {measurement.value}
              </span>
            ))}
          </div>
        ) : (
          <Unset />
        )}
      </Section>

      <section>
        <h4 className="mb-2 text-label font-semibold text-muted-foreground">
          {t('sections.preferences')}
        </h4>
        <div className="divide-y divide-border border-y border-border">
          {notes.map((note) => (
            <div key={note.key} className="py-3 first:pt-2.5 last:pb-2.5">
              <p className="text-label font-semibold text-muted-foreground">{note.label}</p>
              {note.body ? (
                <p className="mt-1 leading-relaxed [overflow-wrap:anywhere]" dir="auto">
                  {note.body}
                </p>
              ) : (
                <Unset />
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Card variant="tinted" size="sm" className="min-h-28 shadow-none">
      <CardContent className="flex h-full flex-col items-start gap-1.5">
        <span className="text-label font-medium text-muted-foreground">{label}</span>
        {children}
      </CardContent>
    </Card>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="text-label font-semibold text-muted-foreground">{label}</h4>
      <div className="mt-1">{children}</div>
    </section>
  );
}

function Unset({ label }: { label?: string }) {
  const t = useTranslations('weeklyPlans');
  return <span className="text-label text-muted-foreground">{label ?? t('unset')}</span>;
}
