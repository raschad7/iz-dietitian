import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import type { Metadata } from 'next';

import { SecuritySettings } from '@/features/auth/components/security-settings';
import { ClinicSettings, PersonalProfileSettings } from '@/features/clinic-profile/components/settings-forms';
import { getClinicProfile } from '@/features/clinic-profile/queries';
import {
  SettingsWorkspace,
  type SettingsSectionDef,
} from '@/features/settings/components/settings-workspace';
import { WhatsappSettings } from '@/features/whatsapp/components/whatsapp-settings';
import { readConnection } from '@/features/whatsapp/connection';
import { resolveLocale } from '@/i18n/params';
import { auth } from '@/lib/auth';
import { requireStaffClinic } from '@/lib/session';

type SettingsPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ section?: string }>;
};

export async function generateMetadata({ params }: SettingsPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'settingsWorkspace' });
  return { title: t('title') };
}

/**
 * The one settings route. It loads every section's data once and hands each
 * already-rendered section to `SettingsWorkspace`, which swaps between them in
 * the client without navigating — see that component for why the four routes
 * this replaced are gone.
 */
export default async function SettingsPage({ params, searchParams }: SettingsPageProps) {
  const locale = await resolveLocale(params);
  const { section } = await searchParams;
  const { clinicId, session } = await requireStaffClinic(locale);
  const requestHeaders = await headers();

  const [profile, connection, passkeys, accounts] = await Promise.all([
    getClinicProfile(clinicId, session.user.id),
    readConnection(clinicId),
    auth.api.listPasskeys({ headers: requestHeaders }),
    auth.api.listUserAccounts({ headers: requestHeaders }),
  ]);
  if (!profile) throw new Error('Clinic profile could not be loaded.');

  const t = await getTranslations({ locale, namespace: 'settingsWorkspace' });

  const sections: SettingsSectionDef[] = [
    {
      key: 'profile',
      label: t('tabs.profile'),
      icon: 'profile',
      content: (
        <PersonalProfileSettings locale={locale} profile={profile} email={session.user.email} />
      ),
    },
    {
      key: 'clinic',
      label: t('tabs.clinic'),
      icon: 'contact',
      content: <ClinicSettings locale={locale} profile={profile} />,
    },
    {
      key: 'whatsapp',
      label: t('tabs.whatsapp'),
      icon: 'whatsapp',
      content: <WhatsappSettings locale={locale} connection={connection} />,
    },
    {
      key: 'security',
      label: t('tabs.security'),
      icon: 'security',
      content: (
        <SecuritySettings
          locale={locale}
          passkeys={passkeys.map((entry) => ({
            id: entry.id,
            name: entry.name ?? null,
            createdAt: entry.createdAt.toISOString(),
          }))}
          providers={accounts.map((entry) => entry.providerId)}
        />
      ),
    },
  ];

  return (
    <SettingsWorkspace label={t('tabsLabel')} sections={sections} initialSection={section ?? 'profile'} />
  );
}
