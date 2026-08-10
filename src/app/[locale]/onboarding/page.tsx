import { redirect } from 'next/navigation';

import { OnboardingWizard } from '@/features/clinic-profile/components/onboarding-wizard';
import { getClinicProfile } from '@/features/clinic-profile/queries';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';

export default async function OnboardingPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await resolveLocale(params);
  const { clinicId, session } = await requireStaffClinic(locale);
  const profile = await getClinicProfile(clinicId, session.user.id);

  if (!profile) throw new Error('Clinic profile could not be loaded.');
  if (profile.onboardingCompletedAt) redirect(`/${locale}/app`);

  return (
    <main className="q-route-stage min-h-dvh bg-background px-4">
      <OnboardingWizard locale={locale} profile={profile} />
    </main>
  );
}

