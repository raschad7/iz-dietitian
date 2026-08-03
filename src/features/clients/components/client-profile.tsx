import { useFormatter, useTranslations } from 'next-intl';

import { Card, CardContent, CardField, CardHeader, CardTitle } from '@/components/ui/card';
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
          <CardTitle icon="contact" className="text-base">
            {t('sections.contact')}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <Value label={t('fields.phone')} value={client.phone} dir="ltr" />
          <Value label={t('fields.email')} value={client.email} dir="ltr" />
          <Value
            label={t('fields.preferredLocale')}
            value={client.preferredLocale === 'ar' ? 'العربية' : 'English'}
          />
          <Value label={t('fields.createdAt')} value={format.dateTime(client.createdAt, 'date')} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle icon="profile" className="text-base">
            {t('sections.intake')}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Value label={t('fields.dateOfBirth')} value={client.dateOfBirth} dir="ltr" />
          <Value label={t('fields.age')} value={age === null ? null : t('yearsOld', { count: age })} />
          <Value label={t('fields.sex')} value={sexLabel} />
          <Value
            label={t('fields.heightCm')}
            value={client.heightCm === null ? null : format.number(client.heightCm, 'integer')}
          />
          <Value label={t('fields.goal')} value={goalLabel} />
          <Value label={t('fields.activityLevel')} value={activityLabel} />
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle icon="notes" className="text-base">
            {t('sections.notes')}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Value label={t('fields.medicalNotes')} value={client.medicalNotes} multiline />
          <Value label={t('fields.allergies')} value={client.allergies} multiline />
          <Value label={t('fields.notes')} value={client.notes} multiline />
        </CardContent>
      </Card>
    </div>
  );
}

function Value({
  label,
  value,
  dir,
  multiline = false,
}: {
  label: string;
  value: string | null;
  dir?: 'ltr' | 'auto';
  multiline?: boolean;
}) {
  const t = useTranslations('clients');

  return (
    <CardField
      label={label}
      dir={dir}
      value={
        value === null || value === '' ? (
          <span className="font-normal text-muted-foreground">{t('notProvided')}</span>
        ) : multiline ? (
          <span className="whitespace-pre-line">{value}</span>
        ) : (
          value
        )
      }
    />
  );
}
