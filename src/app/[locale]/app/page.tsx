import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { AppointmentsPanel } from '@/features/dashboard/components/appointments-panel';
import { StatCards } from '@/features/dashboard/components/stat-cards';
import { loadDashboard } from '@/features/dashboard/page-data';
import { NotificationsBell } from '@/features/notifications/components/notifications-bell';
import { PendingRequestsCard } from '@/features/requests/components/pending-requests-card';
import { formatLongDate } from '@/features/booking/format';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';

type DashboardPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: DashboardPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'dashboard' });
  return { title: t('title') };
}

/**
 * Resolves params, guards the route, and composes the feature's own components
 * — nothing more.
 *
 * **The whole dashboard fits one screen from `xl` up, and does not scroll.**
 * That is the constraint everything else on this page answers to: it is the
 * screen a dietitian leaves open all day, and a number you have to scroll to
 * find is a number you stop checking. The page claims the shell's full height
 * (`xl:h-full`), the top band is sized and the panel below it flexes, and the
 * one list that can grow without limit — a day's appointments — scrolls inside
 * its own table instead of pushing the page taller.
 *
 * Below `xl` the bands stack and the page scrolls normally: one screen is a
 * desktop promise, and honouring it on a phone would mean nested scrolls.
 *
 * ## The page is a stack now, not two columns
 *
 * It was a working column beside a narrow rail: stat cards over the register on
 * one side, today's timeline over the requests card on the other. Both panels
 * in that layout are gone, and with them the reason for the layout.
 *
 * **The register card went because the sidebar already goes there.** It listed
 * name, age and phone for the eight newest clients — a thinner copy of
 * `/app/clients`, sitting in the widest row on the page. That is the same fault
 * the three quick-action tiles were removed for a release earlier: the most
 * valuable band on the screen spending itself on a second route to somewhere
 * the rail already reaches. A dashboard should say what needs doing, not
 * enumerate what exists.
 *
 * **Today's timeline went because the appointments panel covers it.** A
 * vertical column read top to bottom answered one day; the panel answers that
 * day and the four around it, in a table, with the live appointment marked and
 * the next one pointed at. Keeping both would have put today on the screen
 * twice.
 *
 * So the page reads as three bands: who you are and what is waiting, then the
 * two numbers the practice runs on plus anything a client has asked for, then
 * the diary.
 *
 * **Requests moved into the top row as the third card.** It used to sit under
 * the timeline in the narrow column, where an empty panel left a hole — which
 * is why the card was written never to disappear, and why the hole was the
 * price of that. As one of three equal cards it holds a fixed position with
 * nothing beneath it to leave empty. See `PendingRequestsCard`.
 *
 * **Notifications stay a bell beside the date.** Unchanged, and for the reason
 * recorded when it moved there: a permanent column listing three names spends
 * real estate on something read once a morning, while a bell costs one glyph
 * when there is nothing and says how many when there is.
 */
export default async function DashboardPage({ params }: DashboardPageProps) {
  const locale = await resolveLocale(params);
  const { session, clinicId } = await requireStaffClinic(locale);

  const [t, data] = await Promise.all([getTranslations('dashboard'), loadDashboard(clinicId)]);

  return (
    <div className="flex flex-col gap-4 text-start xl:h-full xl:min-h-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2 xl:shrink-0">
        <h1 className="font-heading text-heading-lg font-semibold tracking-tight" dir="auto">
          {t('welcome', { name: session.user.name })}
        </h1>
        {/*
          The date, and the bell beside it. `body-md` (16px) rather than the
          12px caption: with no app bar above it this line is the top of the
          page, and today's date is a fact you read at a glance rather than
          fine print under something else.
        */}
        <div className="flex items-center gap-2">
          <p className="text-body-md text-muted-foreground">{formatLongDate(locale, data.today)}</p>

          {/*
            The bell reads the same two lists the cards below it do — requests
            and drifted clients — rather than a feed of its own. `now` is passed
            in so every "10 minutes ago" on this page, in the panel and in the
            requests card alike, measures from the one instant `loadDashboard`
            read.
          */}
          <NotificationsBell
            attention={data.attention}
            attentionTotal={data.attentionTotal}
            requests={data.requests}
            locale={locale}
            now={data.now}
          />
        </div>
      </div>

      {/*
        Three cards across, all the same height. The two stat cards used to
        share this band alone at half the width each; the requests card joining
        them is what let it stop being a panel that vanished when there was
        nothing in it.
      */}
      <div className="grid gap-4 xl:shrink-0 lg:grid-cols-3">
        <StatCards stats={data.stats} today={data.today} locale={locale} />
        <PendingRequestsCard data={data.requests} locale={locale} now={data.now} />
      </div>

      {/*
        The diary takes everything the band above it leaves, and stops exactly
        at the bottom of the screen: `min-h-0` here, `h-full` on the card, and
        the table inside taking the rest and scrolling. Without the `min-h-0` a
        flex child refuses to shrink below its content, and a busy Tuesday would
        push the card's own footer off the viewport — which is precisely the
        "have to scroll a bit" this replaced.
      */}
      <div className="flex min-w-0 flex-col xl:min-h-0 xl:flex-1">
        <AppointmentsPanel
          appointments={data.weekAppointments}
          weekStart={data.weekStart}
          workingDays={data.workingDays}
          today={data.today}
          nowMinute={data.nowMinute}
          locale={locale}
        />
      </div>
    </div>
  );
}
