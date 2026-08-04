import { HeartPulse, UserRound } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { formatMediumDate } from '@/features/booking/format';
import { calculateAge } from '@/features/clients/age';
import { CLIENT_ACTIVITY_LEVELS, CLIENT_GOALS, CLIENT_SEXES } from '@/features/clients/schema';
import { ClinicSection } from '@/features/portal/components/clinic-section';
import { DataUpdateRequest } from '@/features/portal/components/data-update-request';
import { InfoRow } from '@/features/portal/components/info-row';
import { ProfileIdentity } from '@/features/portal/components/profile-identity';
import { ProfileSection } from '@/features/portal/components/profile-section';
import { loadProfilePage } from '@/features/portal/page-data';
import { requirePortalClient } from '@/features/portal/session';
import { defaultCountryCode } from '@/features/whatsapp/config';
import { resolveLocale } from '@/i18n/params';

type ProfilePageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: ProfilePageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'portal.profile' });
  return { title: t('title') };
}

/**
 * `ملفي لدى الأخصائية` — the client's record at their clinic, as they may read
 * it.
 *
 * **This is not an editable profile, and the screen never pretends otherwise.**
 * Almost everything on it was written by a dietitian during intake and is the
 * basis of the plan the client is following: a height feeds the calorie target,
 * an allergy list filters the food catalog, a goal was agreed out loud. A
 * client silently changing one would invalidate the work built on it with
 * nobody told. So there are no edit affordances beside the fields — there is
 * one honest way to correct the record, at the bottom, and it reaches a person.
 *
 * **Three owners, in reading order.** Who you are, what your dietitian has
 * recorded about your health, and who is looking after you. The first two are
 * about the client and the third is about the clinic, which is the order
 * someone opening their own record reads in — and it puts the phone number
 * immediately before the block explaining what to do if something is wrong.
 *
 * **What is deliberately absent.** The dietitian's private notes
 * (`clients.medical_notes`, `clients.notes`) are never selected by
 * `getPortalClient`, and the weight is omitted entirely — not blanked — unless
 * the dietitian shares it (§11 sensitive data; see `getSharedWeight`).
 *
 * One of the portal's five tabs, so it renders like the others in this group:
 * no header of its own, just content under the shared greeting header and
 * above the tab bar, both supplied by `(tabs)/layout.tsx`. `nav.ts` explains
 * why it is a tab.
 */
export default async function ProfilePage({ params }: ProfilePageProps) {
  const locale = await resolveLocale(params);

  const context = await requirePortalClient(locale);
  const { profile, weightKg, clinic, practitioner, openUpdateRequest } =
    await loadProfilePage(context);

  const t = await getTranslations('portal.profile');
  const tClients = await getTranslations('clients');
  const format = await getFormatter();

  const age = profile.dateOfBirth ? calculateAge(profile.dateOfBirth) : null;

  return (
    <div className="space-y-4">
      <ProfileIdentity profile={profile} />

      <ProfileSection icon={UserRound} title={t('section.basic')}>
        <InfoRow label={t('field.fullName')} value={profile.fullName} />
        {/*
          Read as a wall-clock date, not as an instant: a birthday is a
          calendar fact, and `formatDate` would shift it across a time zone.
          `formatMediumDate` is the same helper the appointment screens use
          and for the same reason.
        */}
        <InfoRow
          label={t('field.dateOfBirth')}
          value={profile.dateOfBirth === null ? null : formatMediumDate(locale, profile.dateOfBirth)}
        />
        <InfoRow
          label={t('field.age')}
          value={age === null ? null : tClients('yearsOld', { count: age })}
        />
        <InfoRow
          label={t('field.sex')}
          value={enumLabel(CLIENT_SEXES, profile.sex, (key) => tClients(`sex.${key}`))}
        />
        <InfoRow label={t('field.phone')} value={profile.phone} ltr />
        <InfoRow label={t('field.email')} value={profile.email} ltr />
      </ProfileSection>

      {/*
        The identifier note sits on this section and nowhere else: the phone
        and the email above are what a client signs in and receives clinic
        messages with, so changing one is a verification the clinic runs
        rather than a field on a page.
      */}
      <p className="px-1 text-xs leading-relaxed text-muted-foreground">{t('identifierNote')}</p>

      <ProfileSection
        icon={HeartPulse}
        title={t('section.health')}
        description={t('section.healthDescription')}
      >
        <InfoRow
          label={t('field.height')}
          value={
            profile.heightCm === null
              ? null
              : t('cm', { value: format.number(profile.heightCm, 'integer') })
          }
        />

        {/*
          Absent, not blank. A row reading "hidden" would tell the client
          there is a number being kept from them, which is worse than not
          raising the subject at all — §9.8's `hidden-metric` state.
        */}
        {weightKg === null ? null : (
          <InfoRow
            label={t('field.weight')}
            value={t('kg', { value: format.number(weightKg, 'plain') })}
          />
        )}

        <InfoRow
          label={t('field.goal')}
          value={enumLabel(CLIENT_GOALS, profile.goal, (key) => tClients(`goal.${key}`))}
        />
        <InfoRow
          label={t('field.activityLevel')}
          value={enumLabel(CLIENT_ACTIVITY_LEVELS, profile.activityLevel, (key) =>
            tClients(`activity.${key}`),
          )}
        />
        <InfoRow label={t('field.conditions')} value={profile.conditions} block />
        <InfoRow label={t('field.allergies')} value={profile.allergies} block />
        <InfoRow label={t('field.medications')} value={profile.medications} block />
        <InfoRow label={t('field.careNote')} value={profile.careNote} block />
      </ProfileSection>

      {clinic ? (
        <ClinicSection clinic={clinic} practitioner={practitioner} countryCode={defaultCountryCode()} />
      ) : null}

      <DataUpdateRequest topic="other" openRequest={openUpdateRequest} locale={locale} />
    </div>
  );
}

/**
 * Reads one of the enum-like `clients` columns as a label.
 *
 * Those columns are `text` in the database, so a value written by an older
 * version of the app may not be a known key. Narrowing means an unrecognised
 * value reads as "not recorded" rather than crashing the page with a missing
 * message error — the same guard `client-profile.tsx` uses.
 */
function enumLabel<T extends string>(
  values: readonly T[],
  value: string | null,
  label: (key: T) => string,
): string | null {
  if (value === null || !(values as readonly string[]).includes(value)) return null;

  return label(value as T);
}
