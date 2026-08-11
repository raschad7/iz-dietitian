import { LifeBuoy, SlidersHorizontal, UserCog } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { Card, CardContent } from '@/components/ui/card';
import { updateLanguageAction } from '@/features/portal/actions';
import { AccountDeletionRequest } from '@/features/portal/components/account-deletion-request';
import { PortalScreenHeader } from '@/features/portal/components/portal-screen-header';
import { PortalSignOut } from '@/features/portal/components/portal-sign-out';
import { SettingsChoiceRow, SettingsLinkRow } from '@/features/portal/components/settings-rows';
import { SettingsSection } from '@/features/portal/components/settings-section';
import { getOpenClientRequest } from '@/features/portal/queries';
import { requirePortalClient } from '@/features/portal/session';
import { resolveLocale } from '@/i18n/params';
import { locales } from '@/i18n/routing';

type SettingsPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: SettingsPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'portal.settings' });
  return { title: t('title') };
}

/**
 * The client's account settings — everything they own, and nothing they do not.
 *
 * **Why this is a separate screen from the profile.** The profile is a clinical
 * record somebody else wrote; this is the handful of things the client actually
 * decides. Mixing them would put a working switch beside a read-only height and
 * leave a client with no way to tell which of the two kinds of thing they were
 * looking at. Two screens, one rule each: over there you read, here you choose.
 *
 * **A list of destinations, not a list of controls.** Notifications, the two
 * identifiers, and contacting the clinic each used to render inline here —
 * four switches, two read-only rows, and a pair of call/WhatsApp buttons all
 * competing with the one thing that actually belongs on this list: the
 * language picker. They moved to their own screens, the same shape `security`
 * already had, so this list is now one kind of row almost everywhere: a name
 * and a chevron. Only language stays inline, because a two-way choice is
 * exactly what the segmented control (`docs/design-system.md` §9.3) was built
 * for — sending that through a whole extra screen would be a worse tap, not a
 * tidier one. The app has one appearance now, so there is no theme picker to
 * sit beside it.
 *
 * **Four groups, then the way out.** What the clinic may send, the language,
 * the account and its identifiers, and where to get help. Sign-out and the
 * deletion request close the screen, in that order — the everyday exit
 * first, the one that needs a person second.
 */
export default async function SettingsPage({ params }: SettingsPageProps) {
  const locale = await resolveLocale(params);

  const context = await requirePortalClient(locale);
  const openDeletionRequest = await getOpenClientRequest(context.id, 'account_deletion');

  const t = await getTranslations('portal.settings');
  const tSwitcher = await getTranslations('localeSwitcher');

  return (
    <>
      <PortalScreenHeader title={t('title')} fallbackHref="/portal/profile" />

      <main className="min-w-0 flex-1 px-4 py-5 md:px-6">
        <div className="mx-auto w-full max-w-3xl space-y-4">
          <SettingsSection icon={UserCog} title={t('account.title')}>
            {/*
              A person, not a phone. The row used to be "email and phone number"
              and carried the handset glyph to say so; it now holds the whole of
              what the clinic has written down about who this client *is* — the
              name, the birth date, the two identifiers — so it takes the person
              glyph and the profile's own name.
            */}
            <SettingsLinkRow
              href="/portal/settings/contact"
              icon="profile"
              label={t('account.profileRow')}
              description={t('account.profileRowDescription')}
            />

            <SettingsLinkRow
              href="/portal/settings/security"
              icon="security"
              label={t('account.security')}
              description={t('account.securityDescription')}
            />
          </SettingsSection>

          <SettingsSection icon={SlidersHorizontal} title={t('preferences.title')}>
            <SettingsLinkRow
              href="/portal/settings/notifications"
              icon="notifications"
              label={t('notifications.title')}
              description={t('notifications.description')}
            />

            <SettingsChoiceRow
              action={updateLanguageAction}
              name="preferredLocale"
              options={locales.map((option) => ({ value: option, label: tSwitcher(option) }))}
              current={locale}
              label={t('preferences.language.label')}
              description={t('preferences.language.description')}
              locale={locale}
            />
          </SettingsSection>

          <SettingsSection icon={LifeBuoy} title={t('support.title')}>
            <SettingsLinkRow
              href="/portal/settings/help"
              icon="help"
              label={t('support.help')}
              description={t('support.helpDescription')}
            />

            <SettingsLinkRow
              href="/portal/settings/contact-clinic"
              icon="chat"
              label={t('support.contactClinic')}
              description={t('support.contactClinicDescription')}
            />

            <SettingsLinkRow
              href="/portal/settings/privacy"
              icon="privacy"
              label={t('support.privacy')}
              description={t('support.privacyDescription')}
            />

            <SettingsLinkRow
              href="/portal/settings/terms"
              icon="terms"
              label={t('support.terms')}
              description={t('support.termsDescription')}
            />
          </SettingsSection>

          {/*
            The two ways out, in one card and in this order. Both are clay, and
            the difference between them is the register rather than the hue:
            sign-out is `destructiveGhost` — a clay label with no box, the shape
            §Buttons gives a destructive action sitting *among* other controls —
            while deleting an account is the one that closes a decision. See
            `portal-sign-out.tsx`.
          */}
          <Card>
            <CardContent className="flex flex-col divide-y divide-border">
              <div className="pb-1">
                <PortalSignOut locale={locale} />
              </div>

              <div className="pt-1">
                <AccountDeletionRequest openRequest={openDeletionRequest} locale={locale} />
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
