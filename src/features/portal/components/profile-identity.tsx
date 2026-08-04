import { useLocale, useTranslations } from 'next-intl';

import { type PortalProfile } from '@/features/portal/types';
import { type Locale } from '@/i18n/routing';
import { formatDate } from '@/lib/format';

/**
 * When the dietitian last saved this record.
 *
 * `clients.updated_at` moves when the dietitian saves the record, so this
 * line is a fact the client can check against their last visit — not a badge
 * that always says "up to date". It sits directly under the shared greeting
 * header, small and secondary, because it is a footnote to the record below
 * rather than a heading of its own.
 */
export function ProfileIdentity({ profile }: { profile: PortalProfile }) {
  const locale = useLocale() as Locale;
  const t = useTranslations('portal.profile');

  return (
    <p className="px-1 text-xs text-muted-foreground">
      {t('lastUpdated', { date: formatDate(locale, profile.updatedAt, { dateStyle: 'long' }) })}
    </p>
  );
}
