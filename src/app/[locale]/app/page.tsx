import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { AgendaTimeline } from '@/features/dashboard/components/agenda-timeline';
import { ClientsCard } from '@/features/dashboard/components/clients-card';
import { QuickActions } from '@/features/dashboard/components/quick-actions';
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
 * (`xl:h-full`), every row is sized or flexible rather than intrinsic, and the
 * one list that can grow without limit — today's appointments — scrolls inside
 * its own card instead of pushing the page taller.
 *
 * Below `xl` the columns stack and the page scrolls normally: one screen is a
 * desktop promise, and honouring it on a phone would mean four nested scrolls.
 *
 * **The working column sits beside the sidebar; today's agenda sits at the far
 * edge.** The agenda is read-only — every row just links out to the real day
 * view — so it is the one panel on this page that is looked at rather than
 * acted on, and it now sits furthest from the rail that is all about acting.
 * Swapping the grid's two tracks (rather than only reordering the JSX) is what
 * keeps this correct in Arabic: a physical `21rem_1fr` would put the agenda on
 * the wrong edge once the page mirrors, so the grid stays two logical tracks
 * and the columns are declared in the order they should read.
 *
 * Reading order down the working column: the four things you start a session by
 * doing, then one row holding your register beside the clients who have drifted
 * out of it. The four summary counters that used to head this column are gone —
 * every number on them was a count of something one click away in the calendar
 * or the register, and they were costing the page its most valuable row.
 *
 * ## What moved, and why
 *
 * **Requests are under today's agenda, not beside the register.** They belong
 * with the day they are about: an appointment request is a proposal for a slot,
 * and the panel that shows what the slots already look like is directly above
 * it. Putting them in the narrow column also let the card stop disappearing —
 * it used to render nothing at all when nothing was pending, because an empty
 * card beside the register left a hole in the widest row on the page. A panel
 * that comes and goes is one nobody learns the position of. See
 * `PendingRequestsCard`.
 *
 * **Notifications are a bell beside the date, not a card.** They lived behind a
 * menu at the foot of the rail — two deliberate acts from the screen a
 * dietitian keeps open, and a notification nobody goes looking for is not one.
 * A panel in this grid was the other extreme: the dashboard is one screen, and
 * a permanent column listing three names spent real estate on something read
 * once a morning and then irrelevant until it changes. A bell costs one glyph
 * when there is nothing and says how many when there is. See
 * `NotificationsBell`.
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

      <div className="grid gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1fr)_21rem] 2xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="flex min-w-0 flex-col gap-4 xl:min-h-0">
          <QuickActions locale={locale} />

          {/*
            The register takes the whole row. It briefly shared it with an
            attention panel; that list is behind the bell in the header now, so
            the widest row on the page goes back to the one list that is read
            all day rather than glanced at once.
          */}
          <ClientsCard clients={data.recentClients} locale={locale} />
        </div>

        {/*
          Today, and what people are asking of it. The agenda takes whatever
          height is left after the requests card has taken what it needs, so a
          quiet morning gives the day view almost the whole column and a busy
          one splits it.
        */}
        <div className="flex min-w-0 flex-col gap-4 xl:min-h-0">
          <AgendaTimeline
            appointments={data.agenda}
            locale={locale}
            today={data.today}
            nowMinute={data.nowMinute}
            workingDays={data.workingDays}
          />

          <PendingRequestsCard data={data.requests} locale={locale} now={data.now} />
        </div>
      </div>
    </div>
  );
}
