import { useFormatter, useTranslations } from 'next-intl';

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { CopyButton } from '@/components/ui/copy-button';
import { Icon, type IconName } from '@/components/ui/icon';
import { formatMediumDate } from '@/features/booking/format';
import { type ClientVisitSummary } from '@/features/booking/queries';
import { type ClientDetail } from '@/features/clients/queries';
import { PLAN_STATUSES } from '@/features/weekly-plans/schema';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { isMember } from '@/lib/enum';

/**
 * Who this client is, and where their record goes next.
 *
 * ## What this tab stopped carrying
 *
 * It used to be a summary of the other four tabs: a health-alerts card
 * duplicating the Nutrition tab's allergens, the same amber "missing fields" and
 * "target is far from computed" callouts that tab already draws — derived a
 * second time, from a second copy of the arithmetic — and a four-item activity
 * card in which three items read "none" and the fourth restated the Portal tab.
 * Opening a client therefore showed the same warning twice and the same allergy
 * twice, and the largest card on the screen was mostly the word "لا".
 *
 * **The clinical record has one owner now, and it is the Nutrition tab.** What is
 * left here is the person: how to reach them, the reference facts about them, and
 * the two things that are genuinely about to happen.
 *
 * **The WhatsApp conversation is deliberately not here.** It used to hang below
 * this tab whenever the clinic had a linked session, which quietly made a
 * client's identity screen into a messaging screen as well.
 */
export function ClientProfile({
  client,
  visits,
  currentPlan,
  locale,
}: {
  client: ClientDetail;
  visits: ClientVisitSummary;
  currentPlan: { weekStartDate: string; status: string } | null;
  locale: Locale;
}) {
  const t = useTranslations('clients');
  const tPlans = useTranslations('weeklyPlans');
  const format = useFormatter();

  return (
    <div className="grid items-start gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle as="h2" icon="contact" size="sm">
            {t('sections.contact')}
          </CardTitle>
        </CardHeader>

        {/*
          `gap-2` between rows rather than a rule under each. The card was
          drawing three horizontal lines that each stopped short of its own
          edge — two row separators inside the content padding and an inset
          `CardDivider` — which together read as a border that had broken
          rather than as structure. There is one rule on this card now, and it
          is the footer's, which is full-bleed.
        */}
        <CardContent className="flex flex-col gap-2">
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

        {/*
          Reference, not headline — but not fine print either. These were at
          12px, the size the design system reserves for text nobody needs;
          a date of birth is something a dietitian actually reads.

          **Both dates are set in the same style**, which they were not: the date
          of birth printed as a bare ISO string (`1973-08-07`) beside a
          localised registration date (`2026/08/06`), so one row held two date
          formats. They still go through two different formatters, and have to:
          a date of birth is a wall clock and is pinned to UTC by
          `formatMediumDate`, while `createdAt` is a real instant and is rendered
          in the clinic's display zone. Only the *style* is shared.
        */}
        <CardFooter className="flex-wrap gap-x-8 gap-y-2 text-body-sm">
          <Reference label={t('fields.preferredLocale')}>
            {client.preferredLocale === 'ar' ? 'العربية' : 'English'}
          </Reference>
          <Reference label={t('fields.dateOfBirth')}>
            {client.dateOfBirth ? formatMediumDate(locale, client.dateOfBirth) : t('notProvided')}
          </Reference>
          <Reference label={t('fields.createdAt')}>
            {format.dateTime(client.createdAt, { dateStyle: 'medium' })}
          </Reference>
        </CardFooter>
      </Card>

      {/*
        Two facts, both of them about what happens next, and both of them a link
        to the place that changes it. This replaces a four-item grid of static
        text in which "last visit", "current plan" and "portal access" were a
        tab's own subject restated — and in which an empty row was a dead end
        rather than an invitation.
      */}
      <Card>
        <CardHeader>
          <CardTitle as="h2" icon="history" size="sm">
            {t('trail.title')}
          </CardTitle>
        </CardHeader>

        <CardContent className="flex flex-col">
          <TrailRow
            icon="bookAppointment"
            label={t('nextVisit')}
            value={visits.next ? formatMediumDate(locale, visits.next.date) : null}
            emptyText={t('noUpcomingVisit')}
            note={visits.next?.reason ?? null}
            href={`/app/clients/${client.id}/visits`}
            emptyAction={t('trail.bookVisit')}
          />

          <div aria-hidden className="h-px bg-border" />

          <TrailRow
            icon="mealPlans"
            label={t('trail.currentPlan')}
            value={
              currentPlan
                ? tPlans('weekOf', { date: formatMediumDate(locale, currentPlan.weekStartDate) })
                : null
            }
            emptyText={t('trail.noPlan')}
            note={
              currentPlan && isMember(PLAN_STATUSES, currentPlan.status)
                ? tPlans(`status.${currentPlan.status}`)
                : null
            }
            href={`/app/weekly-plans/${client.id}`}
            emptyAction={t('trail.createPlan')}
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
 *
 * ⚠ **The value is isolated, the link is not.** `dir="ltr"` used to sit on the
 * `<a>` itself — which is a flex item here, so it is blockified, so the
 * attribute re-resolved `text-align: start` against the *value's* direction and
 * flushed the phone number to the opposite edge of the card from the label above
 * it. In Arabic the label sat right and the number sat left, while the email
 * row beside it (whose empty state carries no `dir`) stayed right; two rows of
 * one card, aligned two different ways. `<bdi>` keeps the digits in Latin order
 * and leaves the box in the page's direction. See "RTL" in
 * docs/design-system.md — `Table`'s `numeric` prop documents the same trap.
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
    <div className="flex items-center gap-3 rounded-md bg-muted px-3 py-2.5">
      {/*
        A neutral disc, not an olive one. Olive marks what you can act on and
        this glyph is not a target — the row's own link is. The Trail card's
        discs beside it were already neutral, so the two cards on this tab were
        drawing the same 36px shape two different ways.
      */}
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-card">
        <Icon name={icon} className="size-4 text-muted-foreground" />
      </span>

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-label text-muted-foreground">{label}</span>
        {value && href ? (
          <a
            href={href}
            className="truncate text-body-md font-medium underline-offset-4 hover:text-secondary-foreground hover:underline"
          >
            <bdi dir="ltr" className={numeric ? 'tabular-nums' : undefined}>
              {value}
            </bdi>
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
    <span className="inline-flex items-center gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{children}</span>
    </span>
  );
}

/**
 * Something that is about to happen, and the way to change it.
 *
 * The whole row is the link, so an empty one is somewhere to go rather than a
 * sentence saying no. `emptyAction` names what the click will do — a row reading
 * "no plan yet" is only useful next to the word "create".
 */
function TrailRow({
  icon,
  label,
  value,
  emptyText,
  note,
  href,
  emptyAction,
}: {
  icon: IconName;
  label: string;
  value: string | null;
  emptyText: string;
  note: string | null;
  href: string;
  emptyAction: string;
}) {
  return (
    <Link
      href={href}
      className="group/row flex items-center gap-3 py-3 no-underline outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-focus-halo"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted">
        <Icon name={icon} className="size-4 text-muted-foreground" />
      </span>

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-label text-muted-foreground">{label}</span>
        {value === null ? (
          <span className="text-body-md text-muted-foreground">{emptyText}</span>
        ) : (
          // No `dir="ltr"` anywhere near this: the value is a *formatted* date
          // and `auto` is what keeps "7 أغسطس 2026" in the right order.
          <span className="text-body-md font-semibold text-foreground" dir="auto">
            {value}
          </span>
        )}
        {note ? (
          <span className="truncate text-body-sm text-muted-foreground" dir="auto">
            {note}
          </span>
        ) : null}
      </span>

      <span className="shrink-0 text-body-sm font-semibold text-secondary-foreground opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-visible/row:opacity-100">
        {value === null ? emptyAction : null}
      </span>
      <Icon name="chevronEnd" className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
