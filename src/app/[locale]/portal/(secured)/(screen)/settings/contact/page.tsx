import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { formatMediumDate } from '@/features/booking/format';
import { calculateAge } from '@/features/clients/age';
import { CLIENT_SEXES } from '@/features/clients/schema';
import { DataUpdateRequest } from '@/features/portal/components/data-update-request';
import { InfoRow } from '@/features/portal/components/info-row';
import { PortalScreenHeader } from '@/features/portal/components/portal-screen-header';
import { ProfileSection } from '@/features/portal/components/profile-section';
import { getOpenClientRequest } from '@/features/portal/queries';
import { requirePortalClient } from '@/features/portal/session';
import { resolveLocale } from '@/i18n/params';

type ContactPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: ContactPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'portal.settings.account' });
  return { title: t('profileRow') };
}

/**
 * `الملف الشخصي` — who the clinic has this client down as, and the one way to
 * correct it.
 *
 * **It holds what the profile tab used to open with.** The name, birth date,
 * age, sex and the two identifiers were the first card on `/portal/profile`,
 * above the health record and the clinic. They are not a *clinical* record —
 * nothing here feeds a plan, filters a catalog or was agreed in a consultation —
 * so leading the medical file with them made the file's first screenful the
 * least medical part of it. They are account facts, and this is the account.
 *
 * That leaves each screen with one kind of thing on it, which is the split
 * `settings/page.tsx` already argues for: over there you read what a dietitian
 * wrote, here you read what the clinic has on file about you.
 *
 * **Still read-only, and still one honest way out.** Nothing on this screen is
 * an input. The email and the phone are what a client signs in and receives
 * clinic messages with, so changing either is a verification the clinic runs,
 * not a field on a page — which is what `DataUpdateRequest` reaches, and why it
 * closes the screen rather than sitting beside any one row.
 *
 * The route stays `/portal/settings/contact`: the screen was renamed, not moved,
 * and an existing URL is not worth breaking over a label.
 */
export default async function ContactPage({ params }: ContactPageProps) {
  const locale = await resolveLocale(params);

  const context = await requirePortalClient(locale);
  const openUpdateRequest = await getOpenClientRequest(context.id, 'data_update');

  const t = await getTranslations('portal.settings.account');
  const tProfile = await getTranslations('portal.profile');
  const tClients = await getTranslations('clients');

  const { profile } = context;
  const age = profile.dateOfBirth ? calculateAge(profile.dateOfBirth) : null;

  const sex =
    profile.sex !== null && (CLIENT_SEXES as readonly string[]).includes(profile.sex)
      ? tClients(`sex.${profile.sex as (typeof CLIENT_SEXES)[number]}`)
      : null;

  return (
    <>
      <PortalScreenHeader title={t('profileRow')} fallbackHref="/portal/settings" />

      <main className="min-w-0 flex-1 px-4 py-5 md:px-6">
        <div className="mx-auto w-full max-w-3xl space-y-4">
          {/*
            The section keeps the title the card carried on the profile tab, so
            someone who knew where these facts lived recognises them in their new
            place. The screen header names the destination; this names the group
            inside it.
          */}
          {/*
            No `note`. It read "both are how you sign in and how the clinic
            reaches you; changing either goes through the clinic" — which the
            request control at the foot of this screen already says by being
            the only way to change them.
          */}
          <ProfileSection icon="personOutline" title={tProfile('section.basic')}>
            <InfoRow label={tProfile('field.fullName')} value={profile.fullName} />

            {/*
              Read as a wall-clock date, not as an instant: a birthday is a
              calendar fact, and `formatDate` would shift it across a time zone.
              `formatMediumDate` is the same helper the appointment screens use
              and for the same reason.
            */}
            <InfoRow
              label={tProfile('field.dateOfBirth')}
              value={
                profile.dateOfBirth === null
                  ? null
                  : formatMediumDate(locale, profile.dateOfBirth)
              }
            />
            <InfoRow
              label={tProfile('field.age')}
              value={age === null ? null : tClients('yearsOld', { count: age })}
            />
            <InfoRow label={tProfile('field.sex')} value={sex} />
            <InfoRow
              label={tProfile('field.phone')}
              value={profile.phone}
              icon="phoneOutline"
              ltr
            />
            <InfoRow
              label={tProfile('field.email')}
              value={profile.email}
              icon="emailOutline"
              ltr
            />
          </ProfileSection>

          {/*
            `showNotice={false}`, as on the health record. The paragraph said the
            phone and email are held by the clinic and that changing either
            needs verifying — and with the section's own note gone too, that
            left the screen explaining the same constraint twice above a button
            that states it by existing. The control is the message now.
          */}
          <DataUpdateRequest
            topic="contact"
            showNotice={false}
            openRequest={openUpdateRequest}
            locale={locale}
          />
        </div>
      </main>
    </>
  );
}
