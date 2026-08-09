import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { ProfileEditor } from '@/features/clinic-profile/components/profile-editor';
import { getClinicProfile } from '@/features/clinic-profile/queries';
import type { ProfileSection } from '@/features/clinic-profile/validation';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';

type ProfilePageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ section?: string }>;
};

export async function generateMetadata({ params }: ProfilePageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'clinicProfile' });
  return { title: t('profileTitle') };
}

const SECTIONS: readonly ProfileSection[] = ['clinic', 'schedule', 'professional'];

/**
 * The section lives in the query string, resolved here.
 *
 * It was `useState` inside the editor, which made the tabs unlinkable and reset
 * them on every reload. Resolving it on the server means the first paint is
 * already the right section — no flash of "Clinic details" on the way to
 * `?section=schedule` — and an unknown or missing value falls back rather than
 * rendering an empty page.
 */
function resolveSection(value: string | undefined): ProfileSection {
  return SECTIONS.find((section) => section === value) ?? 'clinic';
}

export default async function ClinicProfilePage({ params, searchParams }: ProfilePageProps) {
  const locale = await resolveLocale(params);
  const { clinicId, session } = await requireStaffClinic(locale);

  const [profile, { section }] = await Promise.all([
    getClinicProfile(clinicId, session.user.id),
    searchParams,
  ]);
  if (!profile) throw new Error('Clinic profile could not be loaded.');

  return <ProfileEditor locale={locale} profile={profile} section={resolveSection(section)} />;
}
