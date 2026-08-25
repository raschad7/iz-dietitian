import { getTranslations } from 'next-intl/server';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { formatMediumDate } from '@/features/booking/format';
import { ClientVisitRecord } from '@/features/booking/components/client-visit-record';
import { type ClientVisitEntry, type ClientVisitSummary } from '@/features/booking/queries';
import { ClientNutrition } from '@/features/clients/components/client-nutrition';
import { ClientProfilePanel } from '@/features/clients/components/client-profile-panel';
import { ClientProfileTabs } from '@/features/clients/components/client-profile-tabs';
import { ClientProgressPanel } from '@/features/clients/components/client-progress-panel';
import { PortalCredentialsCard } from '@/features/clients/components/portal-credentials-card';
import { type ProfileTab } from '@/features/clients/components/profile-tab';
import { intakeGaps } from '@/features/clients/intake-gaps';
import { type ClientDetail } from '@/features/clients/queries';
import { type ClientDayMeal, type ClientWeekProgress } from '@/features/clients/progress';
import { type ClientIntakeValues } from '@/features/clients/types';
import { ClientPlansCard } from '@/features/weekly-plans/components/client-plans-card';
import type { BillEntry } from '@/features/billing/bill';
import { ClientExpensesPanel } from '@/features/billing/components/client-expenses-panel';
import type { ServicePrices } from '@/features/billing/services';
import { type PlanListEntry } from '@/features/weekly-plans/queries';
import { PLAN_STATUSES } from '@/features/weekly-plans/schema';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { isMember } from '@/lib/enum';
import { type IsoDate } from '@/lib/iso-date';

/**
 * A client's whole record, on the shadcn admin template's `users/view` layout.
 *
 * **A panel that does not move, and four views that do.** The identity column on
 * the inline-start edge carries who this person is and the reference facts about
 * them; the column beside it is one card switched between Account, Nutrition,
 * Security and Plans.
 *
 * ## What the template's tabs became
 *
 * The template is a generic user administration screen. Each surviving view
 * keeps its name and its shape and is filled with what this product holds:
 *
 * | Template | Here |
 * |---|---|
 * | Account — projects table + activity timeline | What is next for this client, and their whole visit record under it |
 * | Security — password, 2FA, devices | The portal sign-in: issuing, reissuing, revoking |
 * | Billing &amp; Plans — plan, invoices | The weekly plans: the live week, and every week before it |
 *
 * **Nothing was invented to fill a view.** This product has no billing, so that
 * view kept the *plans* half of the template's name and is simply called Plans
 * — it says nothing about money, and a tab that half-promised invoices was a
 * tab that had to be opened to find out it did not have any. The `billing` key
 * behind it is the template's, kept so the `?tab=billing` links that redirect
 * here still land. The Security view has no device list either, because the app
 * keeps no per-device sessions to list. A view that would have to be mocked up
 * is a view that states something untrue about a patient.
 *
 * **Two of the template's tabs are gone rather than thinned.** Notifications was
 * the four switches on `client_settings`, and Connections was the phone, the
 * WhatsApp thread, the email address and the portal account as four rows with
 * their state and their action. Both were real, and both were a *tab* spent on
 * something a dietitian opens a patient record for roughly never — while the two
 * facts worth keeping from them, whether there is a sign-in and how to reach
 * this person, are already on the identity panel beside every view. A bar is
 * only as scannable as its narrowest entry: four tabs read at a glance where
 * seven had to be searched.
 *
 * ## Five routes moved in here
 *
 * Nutrition, Visit history, Meal Plans and Portal Access were addresses of their
 * own, reached from a strip of link tabs above this screen; Visit history has
 * since moved again, into the Account view. All four routes redirect to the
 * `?tab=` that replaced them. The record therefore has **one** tab bar rather
 * than two stacked ones, which is what it looked like while this port was
 * half-finished: a link strip asking which section you were in, and a panel
 * strip a row below asking the same thing in a different visual language.
 *
 * The identity strip above the bar went at the same time. It carried the avatar
 * and the name, and the panel on the inline-start edge carries both beside every
 * view — so the record was drawing one person twice, one directly above the
 * other. What is left up there is the breadcrumb and the two controls the panel
 * does not have: see `ClientRecordActions`.
 */
export type ClientProfileProps = {
  client: ClientDetail;
  locale: Locale;
  /** Resolved once by the page, so every view splits past from upcoming on the same day. */
  today: IsoDate;
  /** Which view to open on, from `?tab=`. See `ClientProfileTabs`. */
  defaultTab: ProfileTab;
  visits: {
    /** The next appointment, which the Account view leads with. */
    summary: ClientVisitSummary;
    /** The whole history, for the Account view's visit record and the panel's count. */
    entries: ClientVisitEntry[];
  };
  plans: PlanListEntry[];
  /**
   * The clinical record — the Nutrition view's whole subject, and the source of
   * the meal-slot denominator the plans card counts a week against.
   */
  intake: ClientIntakeValues;
  /** The selected week's adherence, for the Progress view. */
  progress: ClientWeekProgress;
  /**
   * `plans`, narrowed to the weeks that actually hold meals — the Progress
   * view's week picker. An empty draft is real for Billing & Plans, which
   * still reads `plans` whole, but has nothing a client could have followed.
   */
  progressWeeks: PlanListEntry[];
  /** The selected week's plan meals by day of week, for the Progress view's per-meal detail. */
  mealsByDay: Map<number, ClientDayMeal[]>;
  /**
   * The money, for the Expenses view: this subscriber's ledger, the clinic's
   * current price list, and whether a consultation is already on the account.
   *
   * Read on the page beside everything else rather than inside the panel, so a
   * record opens with one round of reads however many views it has.
   */
  billing: {
    entries: BillEntry[];
    prices: ServicePrices;
    consulted: boolean;
  };
  portal: {
    /** What they already sign in with, or null when there is no account. */
    username: string | null;
    /** Server-computed suggestion, editable before the account is created. */
    suggestedUsername: string;
  };
  /**
   * Whether issuing a sign-in will actually reach this client over WhatsApp: the
   * clinic has a live gateway session *and* this client has a number.
   */
  canSendWhatsapp: boolean;
};

export async function ClientProfile({
  client,
  locale,
  today,
  defaultTab,
  visits,
  plans,
  intake,
  progress,
  progressWeeks,
  mealsByDay,
  billing,
  portal,
  canSendWhatsapp,
}: ClientProfileProps) {
  const t = await getTranslations('clients');

  const labels: Record<ProfileTab, string> = {
    account: t('profile.tabs.account'),
    nutrition: t('profile.tabs.nutrition'),
    progress: t('profile.tabs.progress'),
    security: t('profile.tabs.security'),
    billing: t('profile.tabs.billing'),
    expenses: t('profile.tabs.expenses'),
  };

  return (
    /*
      **Two shapes, and the breakpoint is the whole difference.**

      From `lg` up this fills the record shell: one grid row of `minmax(0,1fr)`,
      so both columns are exactly as tall as the space there is and each scrolls
      its own content. Below it, an ordinary column at natural height, because
      filling a phone's viewport with a 500px identity panel leaves a scroll port
      too short to read anything in.

      `23rem` and not a fraction: the panel holds label/value pairs at a fixed
      type size, and a percentage track re-wraps every one of those rows at every
      window width.

      ⚠ **Every pixel it has gained over the original `17.5rem` belongs to the
      detail list, and all of it went into one gap.** That list is a two-column
      grid whose labels are as wide as `البريد الإلكتروني`; the values begin
      after them, and how far in they sit is the gap and nothing else. The
      binding constraint is the widest value on the panel — a phone number, about
      115px of tabular digits — so at 17.5rem there were only about 11px of slack
      and opening the gap broke a phone number across two lines. The track has
      been widened three times to buy that room: 17.5 → 19 → 21 → 23rem, against
      `gap-x-6` → `gap-x-10` → `gap-x-18` → `gap-x-24` in `ClientProfilePanel`.

      ⚠ **Stop here.** At 23rem the values start about 201px in and have roughly
      135px left to render 115px of phone number. The next step does not belong
      in this file: widening the track again charges the record's own views for a
      gap inside a sidebar, and 88px is already the most that trade is worth. See
      the note on the detail grid in `ClientProfilePanel` for the structural
      change that lifts the ceiling instead.

      The views column pays the 88px. It holds a spine of full-width rows whose
      lattices reflow on their own, so it is the side that can absorb it.
    */
    <div className="flex flex-col gap-3 lg:grid lg:h-full lg:min-h-0 lg:grid-cols-[23rem_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
      <ClientProfilePanel
        client={client}
        locale={locale}
        visitCount={visits.entries.filter((visit) => visit.date < today).length}
        planCount={plans.length}
      />

      <ClientProfileTabs
        label={t('profile.viewsLabel')}
        labels={labels}
        defaultTab={defaultTab}
        nutritionGaps={intakeGaps(intake).length}
        panels={{
          account: (
            <AccountView
              client={client}
              locale={locale}
              today={today}
              visits={visits}
              plans={plans}
            />
          ),
          nutrition: <ClientNutrition intake={intake} locale={locale} />,
          progress: (
            <ClientProgressPanel
              clientId={client.id}
              locale={locale}
              weeks={progressWeeks}
              progress={progress}
              mealsByDay={mealsByDay}
            />
          ),
          security: (
            <PortalCredentialsCard
              locale={locale}
              clientId={client.id}
              hasPortalAccess={client.hasPortalAccess}
              username={portal.username}
              suggestedUsername={portal.suggestedUsername}
              canSendWhatsapp={canSendWhatsapp}
            />
          ),
          billing: (
            <ClientPlansCard
              clientId={client.id}
              plans={plans}
              slotsPerDay={intake.mealSchedule.length}
              locale={locale}
            />
          ),
          expenses: (
            <ClientExpensesPanel
              locale={locale}
              clientId={client.id}
              clientName={client.fullName}
              today={today}
              entries={billing.entries}
              prices={billing.prices}
              consulted={billing.consulted}
            />
          ),
        }}
      />
    </div>
  );
}

/* ── Account ─────────────────────────────────────────────────────────────── */

/**
 * What is about to happen, and the whole record of what already has.
 *
 * The template's account tab is a table of the user's projects above a timeline
 * of their activity. What leads here is the pair of facts that are genuinely
 * *ahead* of the reader — the next visit and the live plan — each of them a link
 * to the screen that changes it, so an empty row is somewhere to go rather than
 * a sentence saying no.
 *
 * **Under it is the visit record, entire.** It was a view of its own on the bar
 * for one release, and before that a route; it is here because this is the tab
 * that answers "how is this person doing", and a visit history is most of that
 * answer. What it replaced was first a merged run of appointments, plans and the
 * registration date — three kinds of entry on one rail, so every row had to name
 * its own kind before it said anything — and then a six-entry window on the
 * visits with a link to the rest. The window was the right subject and the wrong
 * size: a link that says "there is more of this elsewhere" is worth less than
 * the more itself, once "elsewhere" is a tab the reader now has to hunt for.
 *
 * `ClientVisitRecord` brings its own facts strip, its own three views and its
 * own empty state, so nothing here wraps it: a card around it would be a card
 * around two cards.
 */
async function AccountView({
  client,
  locale,
  today,
  visits,
  plans,
}: {
  client: ClientDetail;
  locale: Locale;
  today: IsoDate;
  visits: ClientProfileProps['visits'];
  plans: PlanListEntry[];
}) {
  const [t, tPlans] = await Promise.all([
    getTranslations('clients'),
    getTranslations('weeklyPlans'),
  ]);

  // Newest week first is already the read's order — see `listPlans` — so the
  // head of the list *is* the current plan.
  const [currentPlan] = plans;

  return (
    /*
      The trail holds its natural height and the record takes what is left: from
      `lg` up this panel is a bounded box, and the visit record is built to fill
      one and scroll its own history inside it.
    */
    <div className="flex flex-col gap-3 lg:h-full lg:min-h-0">
      <Card className="shrink-0">
        <CardHeader>
          <CardTitle as="h2" icon="history" size="sm">
            {t('trail.title')}
          </CardTitle>
        </CardHeader>

        <CardContent className="flex flex-col">
          <TrailRow
            icon="bookAppointment"
            label={t('nextVisit')}
            value={visits.summary.next ? formatMediumDate(locale, visits.summary.next.date) : null}
            emptyText={t('noUpcomingVisit')}
            note={visits.summary.next?.reason ?? null}
            /*
              Into the calendar, on the day itself. It used to point at the Visit
              history tab, which is the panel directly below this row now — a
              link to what you are already looking at.
            */
            href={
              visits.summary.next
                ? `/app/calendar?view=day&date=${visits.summary.next.date}`
                : '/app/calendar?view=day'
            }
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

      <ClientVisitRecord visits={visits.entries} locale={locale} today={today} />
    </div>
  );
}

/**
 * Something that is about to happen, and the way to change it.
 *
 * The whole row is the link, so an empty one is somewhere to go rather than a
 * dead end. `emptyAction` names what the click will do — a row reading "no plan
 * yet" is only useful next to the word "create".
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
  icon: 'bookAppointment' | 'mealPlans';
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
          // No `dir="ltr"` anywhere near this: the value is a *formatted* date,
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

      {/*
        The row's call to action — "Book visit", "Create plan" — revealed on
        hover and on keyboard focus.

        ⚠ **Visible from the start on a touch screen**, because there is no
        third state there: a finger has no hover, and the focus ring arrives
        only *after* the tap that has already navigated. On a phone or a tablet
        this label was painted at `opacity-0` for its whole life, so a row whose
        only purpose is to offer the action showed nothing but a chevron, and
        the offer was invisible on exactly the devices that cannot discover it
        any other way.

        `pointer-coarse:opacity-100` rather than dropping the reveal: on a mouse
        the fade is doing real work — a column of permanent olive labels down a
        record that mostly has values already is noise — and that reading holds
        wherever a pointer can hover. The variant asks the one question that
        actually separates the two cases.
      */}
      <span className="shrink-0 text-body-sm font-semibold text-secondary-foreground opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-visible/row:opacity-100 pointer-coarse:opacity-100">
        {value === null ? emptyAction : null}
      </span>
      <Icon name="chevronEnd" className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
