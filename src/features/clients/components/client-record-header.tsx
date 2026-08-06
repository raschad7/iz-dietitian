import { getTranslations } from 'next-intl/server';

import { buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { calculateAge } from '@/features/clients/age';
import { ClientActionsMenu } from '@/features/clients/components/client-actions-menu';
import { ClientFormTrigger } from '@/features/clients/components/client-form-trigger';
import { StatusBadge } from '@/features/clients/components/status-badge';
import { type ClientDetail } from '@/features/clients/queries';
import { CLIENT_SEXES } from '@/features/clients/schema';
import { type Locale } from '@/i18n/routing';
import { isMember } from '@/lib/enum';

/**
 * Who this client is, and the one action you take on the record itself.
 *
 * **Deliberately small.** This strip is repeated above all five tabs, so
 * everything on it is paid for five times over — and an earlier version spent
 * that budget on an avatar, a five-figure summary band and a shortcut to the
 * plan board. All three turned out to be repetition rather than reference: the
 * figures are the Nutrition tab's own subject and were being read twice on the
 * one screen that already showed them properly, the plan board is reachable from
 * both the rail and the Plans tab, and the initials disc restated a name written
 * beside it in full.
 *
 * What is left is what no tab repeats: the name, whether the record is live, how
 * to reach the person, and how to correct any of it.
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

  const age = client.dateOfBirth ? calculateAge(client.dateOfBirth) : null;
  const sexLabel = isMember(CLIENT_SEXES, client.sex) ? t(`sex.${client.sex}`) : null;

  return (
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="font-heading text-heading-lg font-semibold" dir="auto">
            {client.fullName}
          </h1>
          <StatusBadge status={client.status} />
        </div>

        <IdentityLine
          sexLabel={sexLabel}
          sex={client.sex}
          ageLabel={age === null ? null : t('yearsOld', { count: age })}
          phone={client.phone}
          email={client.email}
        />
      </div>

      {/*
        One action, and the menu. `neutral` rather than `outline`: the design
        system draws an olive label to mean "act on me", and this row no longer
        contains anything competing for that.
      */}
      <div className="flex shrink-0 items-center gap-3">
        <ClientFormTrigger
          locale={locale}
          clientId={client.id}
          className={buttonVariants({ variant: 'neutral', size: 'sm' })}
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

/**
 * Sex, age, phone and email on one line — the facts that identify someone,
 * rather than the facts about their body.
 *
 * The phone and the email are the only things on a client record that are
 * *instructions to act outside the app*, so they are the only two here that are
 * links. `body-sm` and not `caption`: this line is the whole of what the header
 * tells you now, and 12px is the size the design system reserves for text
 * nobody needs.
 */
function IdentityLine({
  sexLabel,
  sex,
  ageLabel,
  phone,
  email,
}: {
  sexLabel: string | null;
  sex: string | null;
  ageLabel: string | null;
  phone: string | null;
  email: string | null;
}) {
  const parts: React.ReactNode[] = [];

  if (sexLabel) {
    parts.push(
      <span key="sex" className="inline-flex items-center gap-1.5">
        {sex === 'male' || sex === 'female' ? <Icon name={sex} className="size-4" /> : null}
        {sexLabel}
      </span>,
    );
  }

  if (ageLabel) parts.push(<span key="age">{ageLabel}</span>);

  if (phone) {
    parts.push(
      // `dir="ltr"` is correct here and only here: a phone number is bare
      // digits and punctuation, which have no direction of their own. A
      // *formatted date* must never get this — "7 أغسطس 2026" reorders.
      <a
        key="phone"
        href={`tel:${phone}`}
        dir="ltr"
        className="tabular-nums underline-offset-4 hover:text-secondary-foreground hover:underline"
      >
        {phone}
      </a>,
    );
  }

  if (email) {
    parts.push(
      <a
        key="email"
        href={`mailto:${email}`}
        dir="ltr"
        className="min-w-0 truncate underline-offset-4 hover:text-secondary-foreground hover:underline"
      >
        {email}
      </a>,
    );
  }

  if (parts.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-muted-foreground">
      {parts.map((part, index) => (
        <span key={index} className="inline-flex items-center gap-x-2">
          {index > 0 ? (
            // A dot, not a pipe or a slash: it separates without reading as
            // "or". `aria-hidden` because a screen reader announcing "bullet"
            // between every fact is noise.
            <span aria-hidden className="size-[3px] rounded-full bg-current opacity-50" />
          ) : null}
          {part}
        </span>
      ))}
    </div>
  );
}
