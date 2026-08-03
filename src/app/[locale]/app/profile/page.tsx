import { ProfileEditor } from '@/features/clinic-profile/components/profile-editor';
import { getClinicProfile } from '@/features/clinic-profile/queries';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';

export default async function ClinicProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await resolveLocale(params);
  const { clinicId, session } = await requireStaffClinic(locale);
  const profile = await getClinicProfile(clinicId, session.user.id);
  if (!profile) throw new Error('Clinic profile could not be loaded.');

  return <ProfileEditor locale={locale} profile={profile} />;
}

