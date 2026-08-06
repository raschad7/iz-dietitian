import { useFormatter, useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Callout } from '@/components/ui/callout';
import { Card, CardContent, CardDivider, CardHeader, CardTitle } from '@/components/ui/card';
import { CopyButton } from '@/components/ui/copy-button';
import { Icon, type IconName } from '@/components/ui/icon';
import { formatMediumDate } from '@/features/booking/format';
import { type ClientVisitSummary } from '@/features/booking/queries';
import { calculateAge } from '@/features/clients/age';
import { ALLERGENS } from '@/features/clients/nutrition';
import { type ClientDetail } from '@/features/clients/queries';
import { type ClientIntakeValues } from '@/features/clients/types';
import { suggestTargets } from '@/features/weekly-plans/targets';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { isMember, membersOf } from '@/lib/enum';
import { PLAN_STATUSES } from '@/features/weekly-plans/schema';
import { cn } from '@/lib/utils';

/**
 * Who this client is: how to reach them, anything flagged about them, and what
 * has happened lately.
 *
 * **The previous version showed seven facts and then stopped**, leaving roughly
 * two thirds of the screen empty — contact details and demographics in two thin
 * cards, every value at identical weight, none of them clickable, and a
 * registration date shouting exactly as loudly as the phone number. What a
 * dietitian actually opens a client to check — when they last came in, whether a
 * plan is live, whether anything is flagged — was a tab away.
 *
 * Reference facts are demoted rather than deleted: preferred language, date of
 * birth and registration date sit under a divider at caption size, because they
 * are things you look up rather than things you came for.
 *
 * **The WhatsApp conversation is deliberately not here.** It used to hang below
 * this tab whenever the clinic had a linked session, which quietly made a
 * client's identity screen into a messaging screen as well.
 */
export function ClientProfile({
  client,
  intake,
  visits,
  currentPlan,
  locale,
}: {
  client: ClientDetail;
  intake: ClientIntakeValues;
  visits: ClientVisitSummary;
  currentPlan: { weekStartDate: string; status: string } | null;
  locale: Locale;
}) {
  const t = useTranslations('clients');
  const tPlans = useTranslations('weeklyPlans');
  const format = useFormatter();

  const age = client.dateOfBirth ? calculateAge(client.dateOfBirth) : null;

  const targets = suggestTargets({
    weightKg: intake.weightKg,
    heightCm: intake.heightCm,
    age,
    sex: intake.sex,
    activityLevel: intake.activityLevel,
    goal: intake.goal,
  });

  const allergenTags = membersOf(ALLERGENS, intake.allergenTags);
  const hasAllergens = allergenTags.length > 0 || intake.customAllergens.length > 0;

  /*
   * A manual target more than a fifth away from what the measurements imply.
   * The record can hold this contradiction indefinitely and, until now, never
   * mentioned it — a 1,200 kcal target against a weight-gain goal reads as
   * deliberate right up until somebody checks the arithmetic.
   */
  const kcalMismatch =
    intake.dailyKcalTarget !== null &&
    targets.suggestedKcal !== null &&
    Math.abs(intake.dailyKcalTarget - targets.suggestedKcal) / targets.suggestedKcal > 0.2
      ? { manual: intake.dailyKcalTarget, computed: targets.suggestedKcal }
      : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle icon="contact" size="sm">
              {t('sections.contact')}
            </CardTitle>
          </CardHeader>

          <CardContent className="flex flex-col">
            <ContactRow
              icon="contact"
              label={t('fields.phone')}
              value={client.phone}
              href={client.phone ? `tel:${client.phone}` : null}
              copyLabel={t('copy.phone')}
              copiedLabel={t('copy.copied')}
              emptyText={t('notProvided')}
              numeric
            />
            <ContactRow
              icon="email"
              label={t('fields.email')}
              value={client.email}
              href={client.email ? `mailto:${client.email}` : null}
              copyLabel={t('copy.email')}
              copiedLabel={t('copy.copied')}
              emptyText={t('notProvided')}
            />
          </CardContent>

          <CardDivider />

          {/*
            Reference, not headline. These three used to render at the same
            weight as the phone number, which made the least useful fact on the
            card exactly as loud as the most useful one.
          */}
          <CardContent className="flex flex-wrap gap-x-6 gap-y-1.5 text-caption text-muted-foreground">
            <Reference label={t('fields.preferredLocale')}>
              {client.preferredLocale === 'ar' ? 'العربية' : 'English'}
            </Reference>
            <Reference label={t('fields.dateOfBirth')}>
              {client.dateOfBirth ? (
                <span dir="ltr" className="tabular-nums">
                  {client.dateOfBirth}
                </span>
              ) : (
                t('notProvided')
              )}
            </Reference>
            <Reference label={t('fields.createdAt')}>
              <span className="tabular-nums">{format.dateTime(client.createdAt, 'date')}</span>
            </Reference>
          </CardContent>
        </Card>

        {/*
          Allergies and conditions live on the Nutrition tab, which meant you
          could open a client and be told nothing at all about them. This
          summarises and links through rather than duplicating the record.
        */}
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle icon="medical" size="sm">
              {t('healthSummary.title')}
            </CardTitle>
            <Link
              href={`/app/clients/${client.id}/nutrition`}
              className="inline-flex shrink-0 items-center gap-1 text-caption text-muted-foreground underline-offset-4 hover:text-secondary-foreground hover:underline"
            >
              {t('healthSummary.toNutrition')}
              <Icon name="chevronEnd" className="size-3" />
            </Link>
          </CardHeader>

          <CardContent className="flex flex-col gap-3">
            {hasAllergens ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {allergenTags.map((tag) => (
                  <Badge key={tag} variant="medical">
                    {t(`allergens.${tag}`)}
                  </Badge>
                ))}
                {/*
                  Outlined, not filled — the same distinction the intake dialog
                  draws. A solid clay badge means "the catalog excludes this";
                  these are recorded and exclude nothing.
                */}
                {intake.customAllergens.map((tag) => (
                  <Badge key={tag} variant="outline" className="border-dashed" dir="auto">
                    {tag}
                  </Badge>
                ))}
              </div>
            ) : (
              <Callout>{t('intake.noAllergens')}</Callout>
            )}

            {targets.missing.length > 0 ? (
              <Callout tone="attention">
                {t('healthSummary.missingForTargets', {
                  fields: targets.missing.map((field) => t(`fields.${field}`)).join('، '),
                })}
              </Callout>
            ) : null}

            {kcalMismatch ? (
              <Callout tone="attention" title={t('healthSummary.kcalMismatch')}>
                {t('healthSummary.kcalMismatchDetail', {
                  manual: kcalMismatch.manual,
                  computed: kcalMismatch.computed,
                })}
              </Callout>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle icon="history" size="sm">
            {t('recentActivity.title')}
          </CardTitle>
        </CardHeader>

        <CardContent className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          <ActivityItem
            icon="calendar"
            label={t('lastVisit')}
            value={visits.last ? formatMediumDate(locale, visits.last.date) : null}
            emptyText={t('noPreviousVisit')}
            note={visits.last?.reason ?? undefined}
          />
          <ActivityItem
            icon="bookAppointment"
            label={t('nextVisit')}
            value={visits.next ? formatMediumDate(locale, visits.next.date) : null}
            emptyText={t('noUpcomingVisit')}
            note={visits.next?.reason ?? undefined}
          />
          <ActivityItem
            icon="mealPlans"
            label={t('recentActivity.currentPlan')}
            value={
              currentPlan
                ? tPlans('weekOf', { date: formatMediumDate(locale, currentPlan.weekStartDate) })
                : null
            }
            emptyText={t('recentActivity.noPlan')}
            badge={
              currentPlan && isMember(PLAN_STATUSES, currentPlan.status) ? (
                <Badge variant={currentPlan.status === 'published' ? 'onTrack' : 'muted'}>
                  {tPlans(`status.${currentPlan.status}`)}
                </Badge>
              ) : undefined
            }
          />
          <ActivityItem
            icon="security"
            label={t('recentActivity.portalAccess')}
            value={client.hasPortalAccess ? t('recentActivity.portalGranted') : t('recentActivity.portalNone')}
          />
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * One way of reaching this person: the value, and the two things you do with it.
 *
 * The phone number and the email address are the only facts on a client record
 * that are instructions to act *outside* the app, which is why they are the only
 * two drawn as rows with their own affordances rather than as text in a grid.
 */
function ContactRow({
  icon,
  label,
  value,
  href,
  copyLabel,
  copiedLabel,
  emptyText,
  numeric = false,
}: {
  icon: IconName;
  label: string;
  value: string | null;
  href: string | null;
  copyLabel: string;
  copiedLabel: string;
  emptyText: string;
  numeric?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-2 not-first:border-t not-first:border-border">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary">
        <Icon name={icon} className="size-4 text-primary" />
      </span>

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-caption text-muted-foreground">{label}</span>
        {value && href ? (
          <a
            href={href}
            dir="ltr"
            className={cn(
              'truncate text-body-md font-medium underline-offset-4 hover:text-secondary-foreground hover:underline',
              numeric && 'tabular-nums',
            )}
          >
            {value}
          </a>
        ) : (
          <span className="text-body-md text-muted-foreground">{emptyText}</span>
        )}
      </span>

      {value ? <CopyButton value={value} label={copyLabel} copiedLabel={copiedLabel} /> : null}
    </div>
  );
}

function Reference({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      <span className="font-medium text-foreground">{children}</span>
    </span>
  );
}

function ActivityItem({
  icon,
  label,
  value,
  emptyText,
  note,
  badge,
}: {
  icon: IconName;
  label: string;
  value: string | null;
  emptyText?: string;
  note?: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted">
        <Icon name={icon} className="size-4 text-muted-foreground" />
      </span>

      <div className="flex min-w-0 flex-col items-start gap-0.5">
        <span className="text-caption text-muted-foreground">{label}</span>
        {value === null ? (
          <span className="text-body-sm text-muted-foreground">{emptyText ?? '—'}</span>
        ) : (
          <span className="text-body-sm font-medium text-foreground" dir="auto">
            {value}
          </span>
        )}
        {note ? (
          <span className="truncate text-caption text-muted-foreground" dir="auto">
            {note}
          </span>
        ) : null}
        {badge}
      </div>
    </div>
  );
}
