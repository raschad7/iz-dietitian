import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { CLIENT_ACTIVITY_LEVELS, CLIENT_GOALS } from '@/features/clients/schema';
import { Link } from '@/i18n/navigation';
import { isMember, membersOf } from '@/lib/enum';

import type { ClientContext } from '../queries';
import { ALLERGENS } from '../schema';

/**
 * The client's clinical context, shown in the end-side rail until a meal is opened.
 *
 * Exactly the facts the dietitian asked to see before generating: target, goal,
 * BMI, allergies, preferences, dislikes, standing instructions, and the schedule.
 * Nothing is invented here — every value is either stored or derived by
 * `targets.ts`, and a value that has not been recorded says so rather than showing a
 * dash the reader has to interpret.
 */
export function ContextPanel({ context }: { context: ClientContext }) {
  const t = useTranslations('weeklyPlans');
  const tGoals = useTranslations('clients.goal');
  const tActivity = useTranslations('clients.activity');

  const { targets, profile } = context;

  return (
    <div className="flex flex-col gap-4 text-xs">
      <div>
        <h3 className="text-sm font-semibold">{context.fullName}</h3>
        <Link
          href={`/app/weekly-plans/${context.clientId}/profile`}
          className="text-xs text-primary underline-offset-2 hover:underline"
        >
          {profile ? t('editProfile') : t('createProfile')}
        </Link>
      </div>

      {targets.missing.length > 0 && (
        <p className="rounded-md bg-amber-500/10 px-2.5 py-2 text-amber-700 dark:text-amber-400">
          {t('missingFields', {
            fields: targets.missing.map((field) => t(`fields.${field}`)).join('، '),
          })}
        </p>
      )}

      <Section label={t('dailyTarget')}>
        {context.effectiveKcal === null ? (
          <span className="text-muted-foreground">{t('notComputable')}</span>
        ) : (
          <>
            <span className="font-semibold">{t('kcalValue', { value: context.effectiveKcal })}</span>
            {/* An overridden target must be distinguishable from a computed one —
                otherwise nobody can tell whose number they are looking at. */}
            {profile?.dailyKcalTarget !== null && profile?.dailyKcalTarget !== undefined && (
              <Badge variant="outline" className="ms-1.5">
                {t('override')}
              </Badge>
            )}
            {context.effectiveProteinGrams !== null && (
              <span className="block text-muted-foreground">
                {t('proteinTarget', { value: context.effectiveProteinGrams })}
              </span>
            )}
          </>
        )}
      </Section>

      <Section label={t('goal')}>
        {isMember(CLIENT_GOALS, context.goal) ? tGoals(context.goal) : <Unset />}
      </Section>

      <Section label={t('bmi')}>
        {targets.bmi === null ? (
          <Unset />
        ) : (
          <>
            <span className="font-semibold">{targets.bmi.toFixed(1)}</span>
            {targets.bmiCategory && (
              <span className="ms-1.5 text-muted-foreground">
                {t(`bmiCategories.${targets.bmiCategory}`)}
              </span>
            )}
          </>
        )}
      </Section>

      <Section label={t('measurements')}>
        <span className="text-muted-foreground">
          {[
            profile?.weightKg !== null && profile?.weightKg !== undefined
              ? t('kg', { value: profile.weightKg })
              : null,
            context.heightCm !== null ? t('cm', { value: context.heightCm }) : null,
            context.age !== null ? t('years', { value: context.age }) : null,
            isMember(CLIENT_ACTIVITY_LEVELS, context.activityLevel)
              ? tActivity(context.activityLevel)
              : null,
          ]
            .filter(Boolean)
            .join(' · ') || t('unset')}
        </span>
      </Section>

      <Section label={t('allergies')}>
        {profile?.allergenTags.length ? (
          <span className="flex flex-wrap gap-1">
            {membersOf(ALLERGENS, profile.allergenTags).map((tag) => (
              <Badge key={tag} variant="outline" className="border-destructive/40">
                {t(`allergens.${tag}`)}
              </Badge>
            ))}
          </span>
        ) : (
          <Unset />
        )}
        {/* The prose sits under the tags: it carries detail six checkboxes cannot,
            and it is what goes to the model as context. */}
        {context.allergies && <span className="mt-1 block leading-relaxed">{context.allergies}</span>}
      </Section>

      {profile?.preferences && <Section label={t('preferences')}>{profile.preferences}</Section>}
      {profile?.dislikes && <Section label={t('dislikes')}>{profile.dislikes}</Section>}

      {profile?.permanentInstructions && (
        <Section label={t('permanentInstructions')}>
          <span className="leading-relaxed">{profile.permanentInstructions}</span>
        </Section>
      )}

      {context.medicalNotes && (
        <Section label={t('medicalNotes')}>
          <span className="leading-relaxed">{context.medicalNotes}</span>
        </Section>
      )}

      {profile && (
        <Section label={t('schedule')}>
          <ul className="flex flex-col gap-0.5">
            {context.budgets.map((slot) => (
              <li key={slot.slotKey} className="flex justify-between gap-2">
                <span className="truncate text-muted-foreground">
                  {slot.label} · {slot.timeOfDay}
                </span>
                <span className="shrink-0 tabular-nums">{slot.kcal}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </h4>
      <div>{children}</div>
    </section>
  );
}

function Unset() {
  const t = useTranslations('weeklyPlans');
  return <span className="text-muted-foreground">{t('unset')}</span>;
}
