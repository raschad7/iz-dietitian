import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { resolveLocale } from '@/i18n/params';
import { requireStaffSession } from '@/lib/session';

type CalendarPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: CalendarPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'calendar' });
  return { title: t('title') };
}

/** Placeholder. Navigation and the guarded route exist; the feature does not. */
export default async function CalendarPage({ params }: CalendarPageProps) {
  const locale = await resolveLocale(params);
  await requireStaffSession(locale);

  const t = await getTranslations('calendar');
  const tCommon = await getTranslations('common');

  return (
    <div className="space-y-2 text-start">
      <h2 className="text-2xl font-semibold tracking-tight">{t('title')}</h2>
      <p className="text-muted-foreground">{t('placeholder')}</p>
      <p className="inline-block rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
        {tCommon('comingSoon')}
      </p>
    </div>
  );
}
