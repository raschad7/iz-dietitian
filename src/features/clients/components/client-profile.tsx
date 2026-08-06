import { useFormatter, useTranslations } from 'next-intl';

import { Card, CardContent, CardField, CardHeader, CardTitle } from '@/components/ui/card';
import { calculateAge } from '@/features/clients/age';
import { type ClientDetail } from '@/features/clients/queries';
import { CLIENT_SEXES } from '@/features/clients/schema';
import { isMember } from '@/lib/enum';

/**
 * Who this client is: how to reach them, and the demographics every other
 * screen computes from.
 *
 * Height, goal, activity level and the three notes fields used to be here too.
 * They are the Nutrition tab now — they are clinical rather than identifying,
 * the planner reads them, and having them on two screens that could each write
 * only half of what they showed is what this tab was split to fix.
 */
export function ClientProfile({ client }: { client: ClientDetail }) {
  const t = useTranslations('clients');
  const format = useFormatter();

  const age = client.dateOfBirth ? calculateAge(client.dateOfBirth) : null;
  const sexLabel = isMember(CLIENT_SEXES, client.sex) ? t(`sex.${client.sex}`) : null;

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
            {t('sections.demographics')}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Value label={t('fields.dateOfBirth')} value={client.dateOfBirth} dir="ltr" />
          <Value label={t('fields.age')} value={age === null ? null : t('yearsOld', { count: age })} />
          <Value label={t('fields.sex')} value={sexLabel} />
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
