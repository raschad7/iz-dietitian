import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { StatGrid, StatTile } from '@/components/ui/stat-tile';
import { listAuditForTarget } from '@/features/admin/audit';
import { AuditLine } from '@/features/admin/components/audit-table';
import {
  ClinicStatusBadge,
  clinicStatusOf,
  HealthBadge,
  HealthSignals,
  PlanBadge,
} from '@/features/admin/components/clinic-status';
import { PlanForm } from '@/features/admin/components/plan-form';
import { SuspendClinicForm } from '@/features/admin/components/suspend-clinic-form';
import { monthlyPriceOf, planOf } from '@/features/admin/plans';
import { countClinicGenerations, getClinic, listClinicStaff } from '@/features/admin/queries';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/params';
import { formatCurrency, formatDate, formatDateTime, formatNumber } from '@/lib/format';

type ClinicPageProps = {
  params: Promise<{ locale: string; clinicId: string }>;
};

export async function generateMetadata({ params }: ClinicPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const { clinicId } = await params;
  const [clinic, t] = await Promise.all([
    getClinic(clinicId, new Date()),
    getTranslations({ locale, namespace: 'admin.clinics' }),
  ]);

  return { title: clinic?.name ?? t('notFound') };
}

/** One labelled fact. `empty` is what stands in when there is nothing to show. */
function Detail({
  label,
  value,
  empty,
}: {
  label: string;
  value: string | null;
  empty: string;
}) {
  return (
    <div className="space-y-0.5">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className={value ? '' : 'text-muted-foreground'}>{value ?? empty}</dd>
    </div>
  );
}

/**
 * One practice, everything the platform knows about it, and the two things it
 * can do to it.
 *
 * ## Ordered by what a reader came for
 *
 * The health verdict and its reasons are at the top, because a clinic is opened
 * from a queue that already said something was wrong and the first question is
 * "what". Then the plan — the thing most likely to be *changed* here. Then the
 * facts, then the people, then the record of what has been done.
 *
 * ## The log is on this page, not only on the audit screen
 *
 * "Why is this clinic suspended" is a question about this clinic, and making the
 * reader go to a second screen and filter it is making them do a join by hand.
 * `listAuditForTarget` is one indexed read.
 *
 * ## Two administrative states are shown, not one
 *
 * `ClinicStatusBadge` says what the platform has done — suspended, still setting
 * up, running. `HealthBadge` says how the practice is going. They answer
 * different questions and a clinic can be "active" and dormant at the same time,
 * which is exactly the row worth looking at.
 */
export default async function ClinicPage({ params }: ClinicPageProps) {
  const locale = await resolveLocale(params);
  const { clinicId } = await params;
  const now = new Date();

  const [t, tPlans, clinic] = await Promise.all([
    getTranslations('admin.clinics'),
    getTranslations('admin.plans'),
    getClinic(clinicId, now),
  ]);

  if (!clinic) notFound();

  const [staff, generations, history] = await Promise.all([
    listClinicStaff(clinicId),
    countClinicGenerations(clinicId),
    listAuditForTarget('clinic', clinicId, 10),
  ]);

  const plan = planOf(clinic.plan);
  const money = (minor: number) => formatCurrency(locale, minor / 100);

  /*
    The price field is prefilled only when the clinic carries an override.
    Prefilling it with the tier's list price would turn every save into a
    negotiated price — the field would stop meaning "the default applies" the
    first time anybody pressed the button without touching it.
  */
  const priceInput = clinic.planPriceMinor === null ? '' : (clinic.planPriceMinor / 100).toString();
  const trialInput = clinic.trialEndsAt ? clinic.trialEndsAt.toISOString().slice(0, 10) : '';

  return (
    <div className="space-y-6 text-start">
      <div className="space-y-3">
        <Link
          href="/admin/clinics"
          className="inline-flex items-center gap-1 text-body-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          <Icon name="back" className="size-4" />
          {t('back')}
        </Link>

        <header className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-heading-lg font-semibold tracking-tight">{clinic.name}</h1>
          <ClinicStatusBadge status={clinicStatusOf(clinic)} />
          <HealthBadge band={clinic.health.band} />
          <PlanBadge clinic={clinic} now={now} />
        </header>

        <HealthSignals signals={clinic.health.signals} locale={locale} />
      </div>

      <StatGrid columns={4}>
        <StatTile label={t('columns.staff')} value={formatNumber(locale, clinic.staff)} />
        <StatTile label={t('columns.clients')} value={formatNumber(locale, clinic.clients)} />
        <StatTile label={t('columns.plans')} value={formatNumber(locale, clinic.plans)} />
        <StatTile label={t('detail.generations')} value={formatNumber(locale, generations)} />
        <StatTile
          label={t('detail.plansRecent')}
          value={formatNumber(locale, clinic.activity.plansRecent)}
          note={t('detail.plansPrevious', {
            count: formatNumber(locale, clinic.activity.plansPrevious),
          })}
        />
        <StatTile
          label={t('columns.mrr')}
          value={money(monthlyPriceOf(clinic))}
          note={clinic.planPriceMinor === null ? tPlans('listPrice') : tPlans('custom')}
        />
        <StatTile
          label={t('detail.billed')}
          value={money(clinic.billedMinor)}
          note={t('detail.collected', { value: money(clinic.collectedMinor) })}
        />
        <StatTile
          label={t('columns.lastActive')}
          value={clinic.health.lastActiveAt ? formatDate(locale, clinic.health.lastActiveAt) : null}
          emptyText={t('never')}
          textual
        />
      </StatGrid>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-heading text-heading-sm font-semibold">{tPlans('form.heading')}</h2>
            <p className="text-caption text-muted-foreground">
              {plan.seats === null ? tPlans('seatsAny') : tPlans('seats', { count: plan.seats })} ·{' '}
              {plan.aiPlansPerMonth === null
                ? tPlans('aiAny')
                : tPlans('aiLimit', { count: plan.aiPlansPerMonth })}
            </p>
          </div>

          <PlanForm
            clinicId={clinic.id}
            locale={locale}
            plan={clinic.plan}
            priceInput={priceInput}
            trialEndsAt={trialInput}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 p-4">
            <h2 className="font-heading text-heading-sm font-semibold">{t('detail.contact')}</h2>
            <dl className="space-y-2 text-body-sm">
              <Detail label={t('detail.phone')} value={clinic.phone} empty={t('detail.noPhone')} />
              <Detail
                label={t('detail.email')}
                value={clinic.contactEmail}
                empty={t('detail.noEmail')}
              />
              <Detail label={t('detail.address')} value={clinic.address} empty={t('detail.noAddress')} />
              <Detail
                label={t('detail.joined')}
                value={formatDate(locale, clinic.createdAt)}
                empty="—"
              />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-4">
            <h2 className="font-heading text-heading-sm font-semibold">{t('detail.staff')}</h2>

            {staff.length === 0 ? (
              <p className="text-body-sm text-muted-foreground">{t('detail.staffEmpty')}</p>
            ) : (
              <ul className="divide-y divide-border">
                {staff.map((member) => (
                  <li key={member.id} className="flex flex-wrap items-baseline gap-x-2 py-2">
                    <span className="font-medium">{member.name}</span>
                    <span className="text-caption text-muted-foreground" dir="ltr">
                      {member.email}
                    </span>
                    {member.disabledAt ? (
                      <Badge variant="attention">{t('detail.disabled')}</Badge>
                    ) : null}
                    {!member.emailVerified ? (
                      <Badge variant="incomplete">{t('detail.unverified')}</Badge>
                    ) : null}
                    <span className="ms-auto text-caption text-muted-foreground whitespace-nowrap">
                      {member.lastSeenAt
                        ? t('detail.lastSeen', { when: formatDate(locale, member.lastSeenAt) })
                        : t('detail.neverSeen')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="font-heading text-heading-sm font-semibold">{t('detail.history')}</h2>

          {history.length === 0 ? (
            <p className="text-body-sm text-muted-foreground">{t('detail.historyEmpty')}</p>
          ) : (
            <ul className="divide-y divide-border">
              {history.map((entry) => (
                <li key={entry.id} className="space-y-0.5 py-2">
                  <AuditLine entry={entry} locale={locale} />
                  {entry.reason ? (
                    <p className="text-body-sm text-muted-foreground wrap-anywhere">{entry.reason}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="font-heading text-heading-sm font-semibold">{t('suspend.heading')}</h2>
          <p className="max-w-2xl text-body-sm text-muted-foreground">
            {clinic.suspendedAt
              ? t('statusHint.suspended', { when: formatDateTime(locale, clinic.suspendedAt) })
              : t('suspend.hint')}
          </p>

          <SuspendClinicForm
            clinicId={clinic.id}
            clinicName={clinic.name}
            locale={locale}
            suspended={clinic.suspendedAt !== null}
          />
        </CardContent>
      </Card>
    </div>
  );
}
