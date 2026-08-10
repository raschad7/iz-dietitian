import { useLocale, useTranslations } from 'next-intl';

import { type PortalProfile } from '@/features/portal/types';
import { type Locale } from '@/i18n/routing';
import { formatDate } from '@/lib/format';

/**
 * The record's own heading, and when the dietitian last saved it.
 *
 * **The screen names itself now.** The shared portal header drops its greeting
 * and avatar on this route (see `bare` in `portal-header.tsx`), so this is the
 * page's `h1` rather than a caption under someone else's title — and it is the
 * same title/subtitle pair the meal-plan screen opens with, so the two tabs that
 * lead with a heading lead with the same one.
 *
 * `clients.updated_at` moves when the dietitian saves the record, so the second
 * line is a fact the client can check against their last visit — not a badge
 * that always says "up to date". It is a subtitle because that is what it is: a
 * qualification of the heading above it, not a fact about the record's contents.
 */
export function ProfileIdentity({ profile }: { profile: PortalProfile }) {
  const locale = useLocale() as Locale;
  const t = useTranslations('portal.profile');

  return (
    <header className="space-y-1.5">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="text-sm text-muted-foreground">
        {t('lastUpdated', { date: formatDate(locale, profile.updatedAt, { dateStyle: 'long' }) })}
      </p>
    </header>
  );
}
