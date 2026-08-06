import { getTranslations } from 'next-intl/server';

import { Avatar } from '@/components/ui/avatar';
import { buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { calculateAge } from '@/features/clients/age';
import { ClientActionsMenu } from '@/features/clients/components/client-actions-menu';
import { ClientFormTrigger } from '@/features/clients/components/client-form-trigger';
import { StatusBadge } from '@/features/clients/components/status-badge';
import { type ClientDetail } from '@/features/clients/queries';
import { CLIENT_SEXES } from '@/features/clients/schema';
import { type ClientIntakeValues } from '@/features/clients/types';
import { formatMediumDate } from '@/features/booking/format';
import { type ClientVisitSummary } from '@/features/booking/queries';
import { suggestProteinGrams, suggestTargets } from '@/features/weekly-plans/targets';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { isMember } from '@/lib/enum';

/**
 * Who this client is, and the five numbers every tab of their record wants.
 *
 * **This strip is the only chrome all five tabs share, which is the argument for
 * spending height on it.** It used to carry a name, a status badge and three
 * buttons — so a dietitian on the Plans tab could not see the calorie target the
 * plan is built against, and one on the Visits tab could not see the phone
 * number they were about to ring. Both were a tab switch away, and the tab
 * switch lost their place.
 *
 * A server component. The three interactive pieces — the edit dialog, the
 * overflow menu, and nothing else — bring their own boundaries.
 */
export async function ClientRecordHeader({
  client,
  intake,
  visits,
  locale,
}: {
  client: ClientDetail;
  intake: ClientIntakeValues;
  visits: ClientVisitSummary;
  locale: Locale;
}) {
  const t = await getTranslations('clients');

  const age = client.dateOfBirth ? calculateAge(client.dateOfBirth) : null;
  const sexLabel = isMember(CLIENT_SEXES, client.sex) ? t(`sex.${client.sex}`) : null;

  const targets = suggestTargets({
    weightKg: intake.weightKg,
    heightCm: intake.heightCm,
    age,
    sex: intake.sex,
    activityLevel: intake.activityLevel,
    goal: intake.goal,
  });

  const kcal = intake.dailyKcalTarget ?? targets.suggestedKcal;
  const protein = intake.proteinTargetGrams ?? suggestProteinGrams(intake.weightKg);

  return (
    <header className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-3">
          {/*
            The person's own stored colour, the same mark the calendar, the
            dashboard agenda and the top-clients list draw them with. Their own
            record was the one screen in the app where they had no face.
          */}
          <Avatar name={client.fullName} color={client.color} size="lg" />

          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="font-heading text-heading-lg font-semibold" dir="auto">
                {client.fullName}
              </h1>
              <StatusBadge status={client.status} />
            </div>

            <IdentityLine
              sexLabel={sexLabel}
              sex={client.sex}
              age={age}
              ageLabel={age === null ? null : t('yearsOld', { count: age })}
              phone={client.phone}
              email={client.email}
            />
          </div>
        </div>

        {/*
          One decision on the surface, and one shortcut to the thing this record
          exists to produce. `neutral` on the edit rather than `outline`: two
          olive-labelled controls in a row say "act on me" twice, and the design
          system's answer to a row of peers is to give the colour back to the
          button that earned it.
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

          <Link
            href={`/app/weekly-plans/${client.id}`}
            className={buttonVariants({ variant: 'default', size: 'sm' })}
          >
            <Icon name="weeklyPlans" />
            {t('openPlanner')}
          </Link>

          <ClientActionsMenu
            locale={locale}
            clientId={client.id}
            clientName={client.fullName}
            archived={client.status === 'archived'}
          />
        </div>
      </div>

      <FactStrip
        items={[
          {
            key: 'kcal',
            label: t('intake.dailyTarget'),
            value: kcal,
            unit: t('units.kcal'),
            /*
             * A manual target far below what the measurements imply is the one
             * inconsistency this record can hold and never mention. Flagged
             * here rather than only on the Nutrition tab, because the number is
             * on every tab and a figure that needs checking should say so
             * wherever it is read. Amber, not clay: something to look at, not a
             * medical fact.
             */
            flagged:
              intake.dailyKcalTarget !== null &&
              targets.suggestedKcal !== null &&
              Math.abs(intake.dailyKcalTarget - targets.suggestedKcal) / targets.suggestedKcal > 0.2,
          },
          {
            key: 'protein',
            label: t('fields.proteinTargetGrams'),
            value: protein,
            unit: t('units.g'),
          },
          { key: 'weight', label: t('fields.weightKg'), value: intake.weightKg, unit: t('units.kg') },
          {
            key: 'bmi',
            label: t('intake.bmi'),
            value: targets.bmi === null ? null : targets.bmi.toFixed(1),
            unit: targets.bmiCategory ? t(`bmiCategories.${targets.bmiCategory}`) : undefined,
          },
          {
            key: 'nextVisit',
            label: t('nextVisit'),
            value: visits.next ? formatMediumDate(locale, visits.next.date) : null,
            emptyText: t('noUpcomingVisit'),
          },
        ]}
      />
    </header>
  );
}

/**
 * Sex, age, phone and email on one line — the facts that identify someone,
 * rather than the facts about their body.
 *
 * The phone and the email are the only two things on a client record that are
 * *instructions to do something outside the app*, so they are the only two here
 * that are links. `tel:` and `mailto:` rather than plain text: the register
 * already isolates both as LTR, and a phone number nobody can tap is a phone
 * number everybody retypes.
 */
function IdentityLine({
  sexLabel,
  sex,
  age,
  ageLabel,
  phone,
  email,
}: {
  sexLabel: string | null;
  sex: string | null;
  age: number | null;
  ageLabel: string | null;
  phone: string | null;
  email: string | null;
}) {
  const parts: React.ReactNode[] = [];

  if (sexLabel) {
    parts.push(
      <span key="sex" className="inline-flex items-center gap-1.5">
        {sex === 'male' || sex === 'female' ? (
          <Icon name={sex} className="size-3.5" />
        ) : null}
        {sexLabel}
      </span>,
    );
  }

  if (age !== null && ageLabel) parts.push(<span key="age">{ageLabel}</span>);

  if (phone) {
    parts.push(
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
            <span aria-hidden className="size-[3px] rounded-full bg-border" />
          ) : null}
          {part}
        </span>
      ))}
    </div>
  );
}

/**
 * The record's five figures, in one ruled band.
 *
 * Not `StatGrid`: that draws tiles at `heading-lg` for a screen that is *about*
 * those numbers, and this is a header. The band keeps the same rules and the
 * same tabular figures one step down, so the numbers still line up with the
 * Nutrition tab's tiles without competing with the client's own name above them.
 */
function FactStrip({
  items,
}: {
  items: {
    key: string;
    label: string;
    value: string | number | null;
    unit?: string;
    emptyText?: string;
    flagged?: boolean;
  }[];
}) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md bg-border sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => {
        const empty = item.value === null || item.value === '';

        return (
          <div key={item.key} className="flex min-w-0 flex-col gap-0.5 bg-muted px-4 py-2.5">
            <dt className="truncate text-caption text-muted-foreground">{item.label}</dt>
            <dd
              className={
                empty
                  ? 'truncate text-body-sm text-muted-foreground'
                  : item.flagged
                    ? 'flex items-baseline gap-1.5 text-body-md font-semibold text-status-attention-fg'
                    : 'flex items-baseline gap-1.5 text-body-md font-semibold text-foreground'
              }
            >
              {empty ? (
                (item.emptyText ?? '—')
              ) : (
                <>
                  <span dir="ltr" className="tabular-nums">
                    {item.value}
                  </span>
                  {item.unit ? (
                    <span className="truncate text-caption font-normal text-muted-foreground">
                      {item.unit}
                    </span>
                  ) : null}
                </>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
