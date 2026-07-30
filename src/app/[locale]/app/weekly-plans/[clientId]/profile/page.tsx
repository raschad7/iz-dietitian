import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { NutritionProfileForm } from '@/features/weekly-plans/components/nutrition-profile-form';
import { getClientContext } from '@/features/weekly-plans/queries';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';

type PageProps = { params: Promise<{ locale: string; clientId: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'weeklyPlans' });
  return { title: t('profileTitle') };
}

export default async function NutritionProfilePage({ params }: PageProps) {
  const locale = await resolveLocale(params);
  const { clientId } = await params;
  const { clinicId } = await requireStaffClinic(locale);

  const context = await getClientContext(clinicId, clientId);
  if (!context) notFound();

  const t = await getTranslations('weeklyPlans');

  return (
    <div className="space-y-6 text-start">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t('profileTitle')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('profileSubtitle', { name: context.fullName })}
        </p>
      </div>

      <NutritionProfileForm context={context} locale={locale} />
    </div>
  );
}
