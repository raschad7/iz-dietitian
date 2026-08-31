import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { EmptyState } from '@/components/ui/empty-state';
import { appointmentMarker } from '@/features/portal/appointments';
import { AppointmentCard } from '@/features/portal/components/appointment-card';
import { AppointmentRequestDialog } from '@/features/portal/components/appointment-request-dialog';
import { AppointmentRequestFab } from '@/features/portal/components/appointment-request-fab';
import { AppointmentTabs } from '@/features/portal/components/appointment-tabs';
import { PortalSection } from '@/features/portal/components/portal-section';
import { RequestList } from '@/features/portal/components/request-list';
import { RequestSentToast } from '@/features/portal/components/request-sent-toast';
import { loadAppointments, loadRequestPage } from '@/features/portal/page-data';
import { requestSearchSchema } from '@/features/portal/schema';
import { requirePortalClient } from '@/features/portal/session';
import { resolveLocale } from '@/i18n/params';

type AppointmentsPageProps = {
  params: Promise<{ locale: string }>;
  /** `?sent=1`, set by the redirect out of the request form. See below. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: AppointmentsPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('myAppointments') };
}

/**
 * This client's appointments: what is coming, what has been, and the one thing
 * they can start from here.
 *
 * **One action, and it asks rather than books.** Requesting an appointment files
 * a row the dietitian answers; it does not hold a slot, and the button's own
 * screen says so. Rescheduling and cancelling stay the dietitian's — a client
 * who needs either says so in the note on a request, or contacts the clinic.
 * Keeping the page to a single action is what lets the rest of the layout stay
 * as quiet as it is.
 *
 * **The two halves are a switch, not two stacked sections.** They used to be:
 * upcoming, then requests, then history, all on one scroll. That made the past
 * — the half nobody opens this page for — permanent furniture under the half
 * everybody does, and on a phone it pushed the request list to somewhere between
 * them. A client's two questions are "when am I next seen?" and, occasionally,
 * "when was that last one?"; the second is a different visit to this page, not a
 * scroll on the first.
 *
 * The ask sits outside that switch rather than inside either half. It is about
 * the page, not about the half being read — offering it under "past" would be
 * offering it against a list of things that already happened. It used to say so
 * by sitting above the switch, in the header; it says so now by floating over
 * both halves as a corner button, which is the same claim made without spending
 * a band of the first screenful on it. See `AppointmentRequestFab`.
 *
 * Within the upcoming half every appointment is one row of one list, the
 * soonest included. It used to be lifted out above the section as a card of its
 * own; the marker chip on each row already says which one is next, so the lift
 * bought a different-looking first card and a heading that appeared to start at
 * the second appointment. See the note on the list itself.
 *
 * Both halves are rendered here, on the server, and handed to `AppointmentTabs`
 * as slots — see that file for why the choice is local state rather than `?view=`.
 */
export default async function AppointmentsPage({ params, searchParams }: AppointmentsPageProps) {
  const locale = await resolveLocale(params);

  /*
    Set by the redirect at the end of `requestAppointmentAction`, and read for
    one thing only: saying that the send worked. The filed request does appear
    further down this page, but a note lands inside a section a client has to
    scroll to and recognise, and "did that go through?" deserves an answer where
    they land rather than one they have to go looking for.

    Nothing else depends on it, so a stale or hand-typed `?sent=1` costs a
    toast and no state — which is why this stays a query param rather than a
    flash cookie. `RequestSentToast` strips it once it has been said, so it is
    a flash in practice as well as in intent.
  */
  const search = await searchParams;
  const sent = search.sent;
  const justSent = (Array.isArray(sent) ? sent[0] : sent) === '1';

  /*
    `?request=1` opens the ask as a modal over this page.

    A query param rather than local state, because the form underneath is not
    self-contained: choosing a day is a server round trip (`loadRequestPage`
    recomputes availability from the clinic's own rules rather than shipping a
    month of its bookings to the browser), and `RequestForm`'s day strip
    navigates to do it. The URL is the only thing that survives that
    navigation, so it is the only place "the form is open" can live.

    It also keeps the entry point a real `<Link>` — middle-click, open in a new
    tab, and a working control before hydration, none of which an `onClick`
    trigger would have.
  */
  const requested = search.request;
  const requestOpen = (Array.isArray(requested) ? requested[0] : requested) === '1';

  const context = await requirePortalClient(locale);

  /*
    Loaded only when the modal is actually open. `loadRequestPage` reads the
    clinic's opening hours and a month of its bookings to work out which days
    have room; an ordinary visit to this list should not pay for that.
  */
  const [{ upcoming, past, requests }, requestData] = await Promise.all([
    loadAppointments(context),
    requestOpen ? loadRequestPage(context, requestSearchSchema.parse(search)) : Promise.resolve(null),
  ]);

  const t = await getTranslations('portal');

  /*
    Only what is still waiting on the dietitian.

    This used to be everything except `withdrawn` — the client's own change of
    mind, which would have been a list of things they decided not to do. The
    same argument turned out to cover the answered ones: an approved request
    becomes an appointment, which is already on this page in the half above, and
    a declined one is a closed question. Leaving both on screen meant the
    section only ever grew, so a client who had asked three times read three
    settled rows to find the one that was not.

    `pending` is now the whole list, which is what makes the section disappear
    by itself once the dietitian has answered — the behaviour `request-list.tsx`
    already describes.
  */
  const visibleRequests = requests.filter((request) => request.status === 'pending');

  /*
    The button is always offered.

    It used to hide behind an open request, because two identical asks in the
    dietitian's inbox meant they could approve the same thing twice. Asking is
    now a note, which nobody approves — so a client who thinks of something else
    a week later should be able to say it, and a button that disappears after
    one use would read as the portal having taken the offer away.
  */
  const upcomingPanel = (
    <div className="space-y-7">
      {/*
        **One list, heading and all — the next appointment included.**

        It used to be lifted out: the soonest one was drawn on its own as a
        `tone="featured"` card above the section, with no heading over it,
        because it is the one thing anyone opens this page for. That made the
        screen's first card a different *kind* of card from the ones underneath
        it, and the heading below it then read as though "المواعيد القادمة"
        began at the second appointment — which is exactly backwards.

        `appointmentMarker` is what actually answers "when am I next seen?": it
        chips position 0 as today, tomorrow or next, so the soonest row still
        says so from inside the list. It is sorted soonest-first by
        `splitAppointments`, so the index passed here is its real position.
      */}
      {upcoming.length === 0 ? (
        <EmptyState
          icon="calendar"
          title={t('appointments.noneUpcomingTitle')}
          description={t('appointments.noneUpcoming')}
        />
      ) : (
        <PortalSection icon="calendar" title={t('appointments.upcoming')} count={upcoming.length}>
          {/*
            Two to a row from `lg`, one below it. An appointment card is a date
            tile, a reason and a time range — it settles at around 400px and
            gains nothing after that, so a single column on a desktop was a
            stack of 1136px-wide rows each with half a metre of card to the
            inline-end of the last word. `items-start` keeps a card that wrapped
            its reason onto a second line from stretching its neighbour to
            match; these are separate appointments, not a table.
          */}
          <ul className="grid gap-3 lg:grid-cols-2 lg:items-start">
            {upcoming.map((appointment, index) => (
              <li key={appointment.id}>
                <AppointmentCard
                  appointment={appointment}
                  marker={appointmentMarker(appointment, index, context.now)}
                />
              </li>
            ))}
          </ul>
        </PortalSection>
      )}

      {/*
        Filed requests live with the upcoming half rather than beside the switch:
        a request is about something that has not happened yet, and a pending row
        sitting above the past list would be the one thing on that panel that is
        not history.
      */}
      {visibleRequests.length > 0 ? (
        <PortalSection
          icon="chat"
          title={t('appointments.requests')}
          count={visibleRequests.length}
        >
          <RequestList requests={visibleRequests} />
        </PortalSection>
      ) : null}
    </div>
  );

  const pastPanel =
    past.length === 0 ? (
      <EmptyState icon="clock" title={t('appointments.nonePast')} />
    ) : (
      // The same grid the upcoming list uses, for the same reason — see the
      // note there. History is the longer of the two lists, so it is the half
      // that benefits most from a second column.
      <ul className="grid gap-3 lg:grid-cols-2 lg:items-start">
        {past.map((appointment) => (
          <li key={appointment.id}>
            <AppointmentCard appointment={appointment} tone="past" />
          </li>
        ))}
      </ul>
    );

  return (
    <div className="space-y-6">
      {/*
        A title and a line under it, and nothing else — one `space-y-1` where
        there used to be a `space-y-4` wrapper around a nested block, because
        the thing the outer spacing separated the title from has left.
      */}
      <header className="space-y-1">
        {/*
          The page's own `h1`. The portal header above it carries the tab bar
          and a bell, not a title, so every tab screen owns the top of its own
          outline — the profile screen does the same.
        */}
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          {t('appointments.title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('appointments.subtitle')}</p>

        {/*
          The ask is no longer in this header.

          It was a full-width `neutral` box here, and before that a `soft` one,
          and before that a solid olive bar — three attempts at getting the
          volume of a button right, all of which left it in the wrong *place*.
          Whatever it was painted, it was a band of chrome between the page
          title and the tab switch, so on a phone the first appointment — the
          one fact this screen exists to state — started below the fold. It also
          scrolled away the moment a client looked at anything, which is the one
          thing a screen's only action should not do.

          It is `AppointmentRequestFab` now, at the foot of the page. See that
          file, and note it renders last here for a reason that is about data,
          not layout: it portals to <body> regardless of where it is written.
        */}

        {/*
          The confirmation is a toast, not a panel here.

          It used to be a green bar under the request button, and it never went
          away:
          `?sent=1` survives a refresh and every navigation back to this tab, so
          nothing in the page could take it down again. `RequestSentToast`
          renders nothing, says the sentence once and clears the param behind
          itself — see that file.
        */}
        {justSent ? (
          <RequestSentToast
            title={t('appointments.requestSent')}
            description={t('appointments.requestSentDetail')}
          />
        ) : null}
      </header>

      <AppointmentTabs
        label={t('appointments.title')}
        upcomingLabel={t('appointments.tabs.upcoming')}
        pastLabel={t('appointments.tabs.past')}
        upcoming={upcomingPanel}
        past={pastPanel}
      />

      {/*
        The page's one action, floating over everything above it. Written last
        and positioned by nothing here: it portals to `document.body`, because
        `.q-route-stage` — the wrapper every tab page renders inside — is a
        containing block for `fixed` descendants. The note in that file has the
        whole of it.
      */}
      <AppointmentRequestFab label={t('appointments.book')} />

      {/*
        Last in the page, and only present while `?request=1` is. It portals to
        `document.body` and opens in the top layer, so its position here decides
        nothing visually — it is here because this is where the data it needs
        was loaded.
      */}
      {requestData ? <AppointmentRequestDialog data={requestData} locale={locale} /> : null}
    </div>
  );
}
