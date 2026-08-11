import { getTranslations } from 'next-intl/server';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { patientToneStyle } from '@/features/booking/patient-color';
import { ClientActionsMenu } from '@/features/clients/components/client-actions-menu';
import { ClientFormTrigger } from '@/features/clients/components/client-form-trigger';
import { type ClientDetail } from '@/features/clients/queries';
import { type Locale } from '@/i18n/routing';

/**
 * Whose record this is, and how to correct it.
 *
 * **The name, and the disc that identifies it.** This strip is repeated above
 * all five tabs, so everything on it is paid for five times over. Successive
 * versions spent that budget on a five-figure summary band, a shortcut to the
 * plan board, and then a line carrying sex, age, phone and email plus a status
 * chip. Every one of them turned out to be repetition:
 *
 * - the **phone and email** are the Info tab's own subject, and that tab was
 *   rendering them in a card directly below this line;
 * - the **age** is a reading on the Nutrition tab, beside the height and weight
 *   it is computed against;
 * - the **status chip** said `نشِط` on almost every record ever opened, and a
 *   marker that is nearly always present marks nothing.
 *
 * What survives is the one fact no tab repeats and every tab needs: who you are
 * looking at — the name, and the coloured disc that is how that person is
 * recognised in every list they appear in. The avatar is the one item from the
 * cut list that earns its place back, because it is not another *fact* about
 * the client competing with a tab that states it in full; it is the same fact
 * the heading already carries, in the form the eye matches fastest. An archived
 * record still says so too, because *that* is the state worth interrupting for
 * — see below.
 *
 * **No allergy chip here either.** Putting one in the header would show it on
 * five tabs while the Nutrition tab drew it again in full, which is the same
 * duplication this header was cut to remove. It lives once, in the allergy card.
 *
 * A server component. The edit dialog and the overflow menu bring their own
 * client boundaries.
 */
export async function ClientRecordHeader({
  client,
  locale,
}: {
  client: ClientDetail;
  locale: Locale;
}) {
  const t = await getTranslations('clients');

  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        {/*
          The record's avatar, in the client's *calendar* colour — the same disc
          the booking picker and every appointment block draw, so the person you
          picked from a list is recognisably the person you are now looking at.
          It is `aria-hidden` inside the component: the name is right beside it,
          and announcing both says the person twice.

          Not `client.color`, which is the stored hex from a fixed ten-colour
          palette and had a default of `#64748b` behind it. That default is the
          reason this changed: a palette of ten wraps on the eleventh client, and
          any row that never got one drew grey — so the profile showed a colour
          that was either shared with somebody else or nobody's at all, while the
          calendar showed the same patient in a hue that was genuinely theirs.
          Two answers to "what colour is Hamza?" is one too many, and the
          calendar's is the one staff actually learn.

          `lg` (44px) rather than the default 36px, because it is paired with a
          24px heading here and a disc smaller than its own label reads as a
          bullet point rather than as a portrait.
        */}
        <span className="patient-tone contents" style={patientToneStyle(client.seq)}>
          <Avatar name={client.fullName} color="var(--tone-mark)" size="lg" />
        </span>

        <h1 className="font-heading text-heading-lg font-semibold" dir="auto">
          {client.fullName}
        </h1>

        {/*
          Only when it is not the normal state. `StatusBadge` used to render on
          every record and spent a chip saying "this client is a client"; an
          archived one is genuinely an exception the reader has to notice before
          they edit anything, so it keeps the marker and the live record drops it.
        */}
        {client.status === 'archived' ? (
          <Badge variant="muted">{t('status.archived')}</Badge>
        ) : null}
      </div>

      {/*
        One action, and the menu. It is the only control on this strip, so it
        takes the solid primary rather than `neutral` — there is nothing here
        for an olive label to compete with.

        **Just "تعديل".** It briefly read "تعديل بيانات المتابع" to tell it
        apart from the Nutrition tab's own edit control, which is a lot of
        button for a word: the two now differ by that tab naming its object
        ("تعديل السجل") while the record-level one stays the short default.
      */}
      <div className="flex shrink-0 items-center gap-3">
        <ClientFormTrigger
          locale={locale}
          clientId={client.id}
          className={buttonVariants({ variant: 'default', size: 'sm' })}
        >
          <Icon name="edit" />
          {t('edit')}
        </ClientFormTrigger>

        <ClientActionsMenu
          locale={locale}
          clientId={client.id}
          clientName={client.fullName}
          archived={client.status === 'archived'}
        />
      </div>
    </header>
  );
}
