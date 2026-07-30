import { useFormatter, useTranslations } from 'next-intl';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { calculateAge } from '@/features/clients/age';
import { type ClientDetail } from '@/features/clients/queries';
import {
  CLIENT_ACTIVITY_LEVELS,
  CLIENT_GOALS,
  CLIENT_SEXES,
} from '@/features/clients/schema';
import { isMember } from '@/lib/enum';


export function ClientProfile({ client }: { client: ClientDetail }) {
  const t = useTranslations('clients');
  const format = useFormatter();

  const age = client.dateOfBirth ? calculateAge(client.dateOfBirth) : null;

  const sexLabel = isMember(CLIENT_SEXES, client.sex) ? t(`sex.${client.sex}`) : null;
  const goalLabel = isMember(CLIENT_GOALS, client.goal) ? t(`goal.${client.goal}`) : null;
  const activityLabel = isMember(CLIENT_ACTIVITY_LEVELS, client.activityLevel)
    ? t(`activity.${client.activityLevel}`)
    : null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('sections.contact')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Row label={t('fields.phone')} value={client.phone} ltr />
          <Row label={t('fields.email')} value={client.email} ltr />
          <Row
            label={t('fields.preferredLocale')}
            value={client.preferredLocale === 'ar' ? 'العربية' : 'English'}
          />
          <Row
            label={t('fields.createdAt')}
            value={format.dateTime(client.createdAt, 'date')}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('sections.intake')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Row label={t('fields.dateOfBirth')} value={client.dateOfBirth} ltr />
          <Row label={t('fields.age')} value={age === null ? null : t('yearsOld', { count: age })} />
          <Row label={t('fields.sex')} value={sexLabel} />
          <Row
            label={t('fields.heightCm')}
            value={client.heightCm === null ? null : format.number(client.heightCm, 'integer')}
          />
          <Row label={t('fields.goal')} value={goalLabel} />
          <Row label={t('fields.activityLevel')} value={activityLabel} />
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">{t('sections.notes')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Row label={t('fields.medicalNotes')} value={client.medicalNotes} />
          <Row label={t('fields.allergies')} value={client.allergies} />
          <Row label={t('fields.notes')} value={client.notes} />
        </CardContent>
      </Card>
    </div>
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
