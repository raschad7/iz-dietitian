import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { PersonalProfileSettings } from '@/features/clinic-profile/components/settings-forms';
import { getClinicProfile } from '@/features/clinic-profile/queries';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'settingsWorkspace.profile' });
  return { title: t('title') };
}
export default async function PersonalSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await resolveLocale(params);
  const { clinicId, session } = await requireStaffClinic(locale);
  const profile = await getClinicProfile(clinicId, session.user.id);
  if (!profile) throw new Error('Clinic profile could not be loaded.');
  return <PersonalProfileSettings locale={locale} profile={profile} email={session.user.email} />;
}
