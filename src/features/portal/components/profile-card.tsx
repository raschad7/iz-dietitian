import { useFormatter, useTranslations } from 'next-intl';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { calculateAge } from '@/features/clients/age';
import { CLIENT_ACTIVITY_LEVELS, CLIENT_GOALS, CLIENT_SEXES } from '@/features/clients/schema';
import { type PortalProfile } from '@/features/portal/types';

/**
 * The client's own record, read-only.
 *
 * Nothing here is editable, and that is the design rather than a gap. Height, a
 * goal and an activity level are clinical facts a dietitian records during
 * intake and works from; a client silently changing one would invalidate the
 * plan built on it without anyone being told. The card says who to ask instead.
 *
 * Field labels are borrowed from the `clients` namespace — the same record, the
 * same words, one translation to keep correct.
 */

/**
 * The enum-like columns are `text` in the database, so a value written by an
 * older version of the app may not be a known key. Narrowing means an
 * unrecognised value reads as "not provided" rather than crashing the page with
 * a missing-message error. Same guard as `client-profile.tsx`.
 */
function isMember<T extends string>(values: readonly T[], value: string | null): value is T {
  return value !== null && (values as readonly string[]).includes(value);
}

export function ProfileCard({ profile }: { profile: PortalProfile }) {
  const t = useTranslations('clients');
  const tPortal = useTranslations('portal');
  const format = useFormatter();

  const age = profile.dateOfBirth ? calculateAge(profile.dateOfBirth) : null;

  const sexLabel = isMember(CLIENT_SEXES, profile.sex) ? t(`sex.${profile.sex}`) : null;
  const goalLabel = isMember(CLIENT_GOALS, profile.goal) ? t(`goal.${profile.goal}`) : null;
  const activityLabel = isMember(CLIENT_ACTIVITY_LEVELS, profile.activityLevel)
    ? t(`activity.${profile.activityLevel}`)
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tPortal('profile.personalInfo')}</CardTitle>
        <CardDescription>{tPortal('profile.readOnly')}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <Row label={t('fields.fullName')} value={profile.fullName} />
        <Row label={t('fields.phone')} value={profile.phone} ltr />
        <Row label={t('fields.email')} value={profile.email} ltr />
        <Row label={t('fields.dateOfBirth')} value={profile.dateOfBirth} ltr />
        <Row label={t('fields.age')} value={age === null ? null : t('yearsOld', { count: age })} />
        <Row label={t('fields.sex')} value={sexLabel} />
        <Row
          label={t('fields.heightCm')}
          value={profile.heightCm === null ? null : format.number(profile.heightCm, 'integer')}
        />
        <Row label={t('fields.goal')} value={goalLabel} />
        <Row label={t('fields.activityLevel')} value={activityLabel} />
        <Row label={t('fields.allergies')} value={profile.allergies} />
      </CardContent>
    </Card>
  );
}

function Row({ label, value, ltr = false }: { label: string; value: string | null; ltr?: boolean }) {
  const t = useTranslations('clients');

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium whitespace-pre-line" dir={ltr ? 'ltr' : undefined}>
        {value === null || value === '' ? (
          <span className="font-normal text-muted-foreground">{t('notProvided')}</span>
        ) : (
          value
        )}
      </span>
    </div>
  );
}
