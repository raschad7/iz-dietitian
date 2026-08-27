import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import type { Metadata } from 'next';

import { SecuritySettings } from '@/features/auth/components/security-settings';
import { ServicePricesSettings } from '@/features/billing/components/service-prices-settings';
import { FormsSettings } from '@/features/forms/components/forms-settings';
import { MESSAGE_FORM_FIELDS } from '@/features/forms/fields';
import { clinicFormOverrides } from '@/features/forms/queries';
import { defaultMessageBody, PATIENT_MESSAGE_LOCALE } from '@/features/whatsapp/templates';
import { clinicServicePrices } from '@/features/billing/queries';
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

  const [profile, prices, connection, forms, passkeys, accounts] = await Promise.all([
    getClinicProfile(clinicId, session.user.id),
    clinicServicePrices(clinicId),
    readConnection(clinicId),
    clinicFormOverrides(clinicId),
    auth.api.listPasskeys({ headers: requestHeaders }),
    auth.api.listUserAccounts({ headers: requestHeaders }),
  ]);

  /*
    The app's own body for each editable message, read here rather than in the
    editor: `templates.ts` is a server module holding the copy the sender uses,
    and the Forms tab is a client component. Passing it down is what keeps one
    set of words in the file that sends them.

    `PATIENT_MESSAGE_LOCALE` and not `locale`: every outgoing message is written
    in the patient's language whatever the staff are reading the settings page
    in, so the body a dietitian edits here is the body that goes out.
  */
  const messageDefaults = Object.fromEntries(
    MESSAGE_FORM_FIELDS.map((field) => [
      field.key,
      defaultMessageBody(field.message, PATIENT_MESSAGE_LOCALE),
    ]),
  );
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
      /*
        Two sections under one tab: who the clinic is, and what it charges.
        Prices are the clinic's own settings rather than a fifth tab — a tab is
        a place somebody has to know to look, and three rows do not earn one.
      */
      content: (
        <>
          <ClinicSettings locale={locale} profile={profile} />
          <ServicePricesSettings locale={locale} prices={prices} />
        </>
      ),
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
    {
      key: 'forms',
      label: t('tabs.forms'),
      icon: 'forms',
      /*
        A tab of its own rather than rows under Clinic or WhatsApp, and it earns
        one where Service prices did not: what lives here is the wording of two
        different things — a printed document and five automatic messages —
        which belongs with neither the clinic's identity nor its gateway
        connection, and is the one part of Settings a dietitian opens to *write*
        rather than to check.

        Last of the tabs, and not first: everything before it is a fact about
        the clinic that has to be right before anything is sent or printed. This
        one is the wording of what then goes out — the thing you come back to,
        rather than the thing you set up.
      */
      content: (
        <FormsSettings
          locale={locale}
          forms={forms}
          defaults={messageDefaults}
          logo={profile.clinic.logoUrl ?? null}
          clinicName={profile.clinic.name}
          doctorName={profile.professional.name || null}
          clinicAddress={profile.clinic.address || null}
        />
      ),
    },
  ];

  return (
    <SettingsWorkspace label={t('tabsLabel')} sections={sections} initialSection={section ?? 'profile'} />
  );
}
