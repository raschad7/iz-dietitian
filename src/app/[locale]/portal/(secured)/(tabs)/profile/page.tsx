import { getFormatter, getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { ALLERGENS } from '@/features/clients/nutrition';
import { CLIENT_ACTIVITY_LEVELS, CLIENT_GOALS } from '@/features/clients/schema';
import { ClinicSection } from '@/features/portal/components/clinic-section';
import { DataUpdateRequest } from '@/features/portal/components/data-update-request';
import { HealthStats, type HealthStat } from '@/features/portal/components/health-stats';
import { InfoRow } from '@/features/portal/components/info-row';
import { ProfileIdentity } from '@/features/portal/components/profile-identity';
import { ProfileSection } from '@/features/portal/components/profile-section';
import { loadProfilePage } from '@/features/portal/page-data';
import { requirePortalClient } from '@/features/portal/session';
import { resolveLocale } from '@/i18n/params';
import { isMember } from '@/lib/enum';

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
  const { profile, clinic, practitioner, openUpdateRequest, allergens } =
    await loadProfilePage(context);

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

  /*
    **The allergy row, assembled from the three places an allergy is recorded.**

    The intake dialog's allergy panel writes three fields and this screen used to
    render only one of them — `clients.allergies`, the optional prose box at the
    bottom of that panel. So a dietitian could tick four allergens, type a fifth
    into "حساسيات أخرى", save, and the client's own record would still read
    `غير مسجل` under "الحساسية الغذائية". `getPortalAllergens` has the full note;
    the short version is that a record claiming nothing is on file when four
    things are is worse than one that says nothing at all.

    The ticks and the free entries are one list — the catalog-filtering
    distinction between them is the dietitian's concern, not the client's, and
    the staff card resolved it the same way (`client-nutrition.tsx`). The prose
    detail follows on its own line, because it qualifies the list rather than
    extending it: "حساسية خفيفة من الجوز دون اللوز" is a sentence about the nuts
    entry, not a sixth allergen.

    Joined with a newline rather than rendered as two rows: `InfoRow`'s value
    panel is `whitespace-pre-line`, and a second row would spend a whole labelled
    line on a heading ("تفاصيل") that the sentence under the list does not need.

    `null` when all three are empty, which is what keeps the unrecorded chip
    honest for a client who genuinely has nothing on file.
  */
  /*
    An unrecognised tag falls back to its own raw value — it is **not** dropped.

    `allergen_tags` is a `text[]`, so a value written by a newer version of the
    app may have no label here. Everywhere else in this file that mismatch reads
    as "not recorded" (see `enumLabel`), and for a goal or an activity level that
    is the right failure: a stale enum is worth less than a wrong label. An
    allergen is the one field on this screen where silently showing less than
    the record holds is the dangerous direction, so an unknown tag is printed
    verbatim. Ugly beats absent here.
  */
  const allergenNames = [
    ...allergens.allergenTags.map((tag) =>
      isMember(ALLERGENS, tag) ? tClients(`allergens.${tag}`) : tag,
    ),
    ...allergens.customAllergens,
  ];

  const allergyDetail = profile.allergies?.trim() ?? '';

  const allergyValue =
    [allergenNames.length > 0 ? format.list(allergenNames, { type: 'unit' }) : '', allergyDetail]
      .filter((part) => part !== '')
      .join('\n') || null;

  return (
    /*
      `space-y-6` rather than `space-y-4`: with the header's greeting gone this
      screen opens on its own heading, and three cards packed at 16px under it
      read as one long form. The extra 8px is what lets each section be a thing
      you finished reading before the next one starts.

      **Every card on this screen is flat.** The lift is what separates a card from the page behind it, and this screen
      is nothing but cards — the record, the clinic's four facts, the contact
      pair, the correction block. A dozen shadows stacked down a phone reads as
      texture rather than as a dozen separate planes, and the hairline ring each
      card already carries draws its edge perfectly well without one.

      Set here rather than on each `Card`, because it is a property of *this
      page* and not of the components: `ClinicSection` and `HealthStats` are
      used with their shadows intact elsewhere, so a `shadow-none` inside them
      would take the lift off screens that never asked. `**:` reaches every
      descendant, so a card nested inside a feature component is covered
      without that component knowing about it.
    */
    <div className="space-y-6 **:data-[slot=card]:shadow-none">
      <ProfileIdentity profile={profile} />

      {/*
        Two shapes in one section, and the split is by the shape of the answer,
        not by importance. A height, a goal and an activity level are a figure or
        one word from a known set, so they are tiles read at a glance; conditions,
        allergies, medications and the dietitian's note are prose, and a paragraph
        in a half-width tile is four words wide.
      */}
      <ProfileSection
        title={t('section.health')}
        lead={<HealthStats stats={healthStats} />}
        /*
          No `note`. It carried "the more complete your record, the more precise
          your plan" — an encouragement to fill the record in, on the one screen
          where the client cannot fill anything in. Every field here is the
          dietitian's to write (see the module note above), so a nudge to
          complete them asked for something this screen does not offer, and it
          spent a sunken strip under the tiles saying it.
        */
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
        {/* Assembled above — see the note there for why this is not `profile.allergies`. */}
        <InfoRow
          label={t('field.allergies')}
          value={allergyValue}
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
        <ClinicSection clinic={clinic} practitioner={practitioner} />
      ) : null}

      {/*
        `showNotice={false}`: the paragraph explaining that this is the clinic's
        record and how to have it corrected is gone from this screen. The module
        note at the top of this file already says the same thing to anyone
        reading the code, and to the client the button itself now carries it —
        "طلب تحديث البيانات" is not a control anyone presses without having
        found something wrong. The contact screen keeps its own notice, which
        says something this one does not (that changing a phone or an email
        needs verifying).
      */}
      <DataUpdateRequest
        topic="other"
        showNotice={false}
        openRequest={openUpdateRequest}
        locale={locale}
      />
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
