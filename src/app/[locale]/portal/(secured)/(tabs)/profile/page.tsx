import { getFormatter, getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { CLIENT_ACTIVITY_LEVELS, CLIENT_GOALS } from '@/features/clients/schema';
import { ClinicSection } from '@/features/portal/components/clinic-section';
import { DataUpdateRequest } from '@/features/portal/components/data-update-request';
import { HealthStats, type HealthStat } from '@/features/portal/components/health-stats';
import { InfoRow } from '@/features/portal/components/info-row';
import { ProfileIdentity } from '@/features/portal/components/profile-identity';
import { ProfileSection, SectionNote } from '@/features/portal/components/profile-section';
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
 * **Two owners, in reading order.** What your dietitian has recorded about your
 * health, then who is looking after you — the record, then the people behind
 * it. That order puts the clinic's phone number immediately before the block
 * explaining what to do if something on the screen is wrong.
 *
 * **The identity card is not here any more.** Name, birth date, age, sex and the
 * two identifiers used to open this screen; they now live at
 * `/portal/settings/contact`, under `الملف الشخصي`. Nothing in that set is
 * clinical — none of it feeds a plan, filters a catalog, or was agreed in a
 * consultation — so leading the medical file with it made the file's first
 * screenful the least medical part of it. This screen is now only the things a
 * dietitian wrote, which is the same split `settings/page.tsx` draws from the
 * other side.
 *
 * **What is deliberately absent.** The dietitian's private notes
 * (`clients.medical_notes`, `clients.notes`) are never selected by
 * `getPortalClient`. Neither is the weight: it was shown only when a dietitian
 * ticked a switch that no longer exists, and rather than leave a read that
 * could never return anything, it is off this screen entirely (§11 sensitive
 * data). The same goes for the care note the dialog used to write.
 *
 * One of the portal's five tabs, so it renders like the others in this group:
 * no header of its own, just content under the shared greeting header and
 * above the tab bar, both supplied by `(tabs)/layout.tsx`. `nav.ts` explains
 * why it is a tab.
 */
export default async function ProfilePage({ params }: ProfilePageProps) {
  const locale = await resolveLocale(params);

  const context = await requirePortalClient(locale);
  const { profile, clinic, practitioner, openUpdateRequest } = await loadProfilePage(context);

  const t = await getTranslations('portal.profile');
  const tClients = await getTranslations('clients');
  const format = await getFormatter();

  /*
    The health record's headline facts, as tiles.

    **There is no weight tile**, and that is upstream of this screen rather than
    a layout choice: `09b1f36` dropped the share-weight switch, so the dietitian
    has no way to publish a weight and `loadProfilePage` no longer returns one.
    A tile reading "not recorded" would be stating something the page cannot
    know is true — §11: hidden is hidden, and the screen does not raise the
    subject. Height, goal and activity carry no such flag and are always
    offered.

    Three tiles is therefore the only case, and the grid takes its column count
    from the tile count, so they sit in one row with no hole.
  */
  const healthStats: HealthStat[] = [
    {
      label: t('field.goal'),
      value: enumLabel(CLIENT_GOALS, profile.goal, (key) => tClients(`goal.${key}`)),
      kind: 'category',
      icon: 'goalOutline',
    },
    {
      label: t('field.height'),
      // The figure and its unit are separate here, not `t('cm')`: the tile draws
      // the number large and the unit under it, so it needs the two apart.
      value: profile.heightCm === null ? null : format.number(profile.heightCm, 'integer'),
      unit: t('unitCm'),
      kind: 'measure',
      icon: 'heightOutline',
    },
    {
      label: t('field.activityLevel'),
      value: enumLabel(CLIENT_ACTIVITY_LEVELS, profile.activityLevel, (key) =>
        tClients(`activity.${key}`),
      ),
      kind: 'category',
      icon: 'activityOutline',
    },
  ];

  return (
    /*
      `space-y-6` rather than `space-y-4`: with the header's greeting gone this
      screen opens on its own heading, and three cards packed at 16px under it
      read as one long form. The extra 8px is what lets each section be a thing
      you finished reading before the next one starts.
    */
    <div className="space-y-6">
      <ProfileIdentity profile={profile} />

      {/*
        Two shapes in one section, and the split is by the shape of the answer,
        not by importance. A height, a goal and an activity level are a figure or
        one word from a known set, so they are tiles read at a glance; conditions,
        allergies, medications and the dietitian's note are prose, and a paragraph
        in a half-width tile is four words wide.
      */}
      <ProfileSection
        icon="heartOutline"
        title={t('section.health')}
        description={t('section.healthDescription')}
        lead={<HealthStats stats={healthStats} />}
        /*
          The note says what the blanks are *for*, which is the one thing the
          dashed chips above it cannot. It is an invitation to fill the record in
          rather than a warning that it is incomplete — `infoOutline` and the
          muted strip, never `attention`, which §Status reserves for something
          actually owed.
        */
        note={<SectionNote>{t('healthNote')}</SectionNote>}
      >
        {/*
          Height and goal are deliberately *not* rows here, though `main` added
          them as such: they are two of the `healthStats` tiles above. A figure
          and a one-word category are what that grid is for, and stating them
          again 40px below it would be the same fact twice in two shapes.
        */}
        <InfoRow
          label={t('field.conditions')}
          value={profile.conditions}
          icon="conditionsOutline"
          block
        />
        <InfoRow
          label={t('field.allergies')}
          value={profile.allergies}
          icon="allergiesOutline"
          block
        />
        <InfoRow
          label={t('field.medications')}
          value={profile.medications}
          icon="medicationsOutline"
          block
        />
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
