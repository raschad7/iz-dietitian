import { getTranslations } from 'next-intl/server';

import { ClientVisitRecord } from '@/features/booking/components/client-visit-record';
import { type ClientVisitEntry } from '@/features/booking/queries';
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
import { type MeasurementSubject } from '@/features/measurements/compare';
import { MeasurementsPanel } from '@/features/measurements/components/measurements-panel';
import { type MeasurementRow } from '@/features/measurements/queries';
import { type PlanListEntry } from '@/features/weekly-plans/queries';
import { type Locale } from '@/i18n/routing';
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
 * | Account — projects table + activity timeline | This client's whole visit record: what the attendance adds up to, what is booked, what has happened |
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
    /**
     * The whole history: the Visits view's record, and the count of past
     * appointments the identity panel states.
     *
     * It sat beside a `summary` — the next appointment, read by its own query —
     * until the trail card that used it left this screen. Nothing reads a
     * pre-computed summary now, so the page no longer pays for one.
     */
    entries: ClientVisitEntry[];
  };
  plans: PlanListEntry[];
  /**
   * The clinical record — the Nutrition view's whole subject, and the source of
   * the meal-slot denominator the plans card counts a week against.
   */
  intake: ClientIntakeValues;
  /**
   * The Measurements view: this client's readings newest first, the two client
   * facts a comparison needs, the current weight the save form's checkbox would
   * replace, and which comparison `?range=` asked for.
   */
  measurements: {
    rows: MeasurementRow[];
    subject: MeasurementSubject;
    currentWeightKg: number | null;
    range: 'last' | 'start';
    /** Which of the rows have a stored report — see the panel's own note. */
    reportIds: Set<string>;
    /** The portal disclosure switch's state. */
    sharing: { shared: boolean; hasProfile: boolean };
  };
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
  measurements,
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
    measurements: t('profile.tabs.measurements'),
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
          /*
            The visit record, and nothing wrapped around it. It brings its own
            facts, its own two views and its own empty state — see
            `ClientVisitRecord` — and it is built to fill a bounded box and
            scroll its own history inside it, which is exactly what the panel
            hands it.

            ⚠ **There was a "المسار" card above it and it is deliberately
            gone.** Two rows — the next visit and the live plan — each a link to
            the screen that changes it. It cost about 210px of a panel whose
            height is fixed by the window, and it spent that on facts this tab
            already states: the next visit is a row of the record's own facts
            list, and the current plan is what the Plans tab *is*. On a laptop
            768px tall that 210px was the difference between a visit list and a
            card collapsed behind its own scrollbar, which is what a reader
            actually came to this tab for. Do not reinstate it here without
            finding the height somewhere else first.
          */
          account: <ClientVisitRecord visits={visits.entries} locale={locale} today={today} />,
          nutrition: (
            <ClientNutrition
              intake={intake}
              locale={locale}
              /*
                The most recent visit that reported one. `measurements.rows` is
                newest first, so the first hit is the freshest — and a client
                nobody has measured in twelve weeks is already on the
                dashboard's attention list, which is where staleness is
                handled rather than with a second rule here.
              */
              measuredBmrKcal={
                measurements.rows.find((row) => row.basalMetabolicRateKcal !== null)
                  ?.basalMetabolicRateKcal ?? null
              }
            />
          ),
          measurements: (
            <MeasurementsPanel
              clientId={client.id}
              locale={locale}
              today={today}
              measurements={measurements.rows}
              subject={measurements.subject}
              currentWeightKg={measurements.currentWeightKg}
              range={measurements.range}
              reportIds={measurements.reportIds}
              sharing={measurements.sharing}
            />
          ),
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
              phone={client.phone}
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
