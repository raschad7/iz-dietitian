import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { appointmentMarker } from '@/features/portal/appointments';
import { AppointmentCard } from '@/features/portal/components/appointment-card';
import { AppointmentTabs } from '@/features/portal/components/appointment-tabs';
import { PortalSection } from '@/features/portal/components/portal-section';
import { RequestList } from '@/features/portal/components/request-list';
import { loadAppointments } from '@/features/portal/page-data';
import { requirePortalClient } from '@/features/portal/session';
import { Link } from '@/i18n/navigation';
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
 * The ask sits above that switch rather than inside either half. It is about the
 * page, not about the half being read — offering it under "past" would be
 * offering it against a list of things that already happened.
 *
 * Within the upcoming half the soonest appointment is lifted out of the list
 * entirely. It is the one thing anyone opens this page for, and a list where
 * every row looks identical makes them find it by reading dates.
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
    sentence and no state — which is why this stays a query param rather than a
    flash cookie.
  */
  const sent = (await searchParams).sent;
  const justSent = (Array.isArray(sent) ? sent[0] : sent) === '1';

  const context = await requirePortalClient(locale);
  const { upcoming, past, requests } = await loadAppointments(context);

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
  // `upcoming` is sorted soonest-first by `splitAppointments`, so the head is the
  // next appointment and the tail is everything after it.
  const [next, ...later] = upcoming;

  const upcomingPanel = (
    <div className="space-y-7">
      {next === undefined ? (
        <EmptyState
          icon="calendar"
          title={t('appointments.noneUpcomingTitle')}
          description={t('appointments.noneUpcoming')}
        />
      ) : (
        <>
          {/*
            No section heading over this one. `appointmentMarker` always returns
            a marker at position 0 — today, tomorrow, or next — so the card
            opens with a chip that says the same thing the heading did, under a
            fourth calendar glyph in a row that already had three. The card is
            built to lead a page (see `appointment-card.tsx`); a label above it
            only pushed it further down one.
          */}
          <AppointmentCard
            appointment={next}
            tone="featured"
            marker={appointmentMarker(next, 0, context.now)}
          />

          {/*
            Nothing at all when there is no second appointment — not an empty
            state saying so.

            There was one, and it stated the obvious twice over: the client is
            looking at their next appointment, and the only thing under it was a
            card explaining that there was nothing under it. A screen that ends
            is not a screen that failed; the featured card above is a complete
            answer to "when am I next seen?", and the request button in the
            header is already the thing to press if the answer is not enough.
          */}
          {later.length > 0 ? (
            <PortalSection icon="calendar" title={t('appointments.upcoming')} count={later.length}>
              <ul className="space-y-3">
                {later.map((appointment, index) => (
                  <li key={appointment.id}>
                    <AppointmentCard
                      appointment={appointment}
                      // `index + 1`: these start after the featured one, and
                      // `appointmentMarker` reads position 0 as "next".
                      marker={appointmentMarker(appointment, index + 1, context.now)}
                    />
                  </li>
                ))}
              </ul>
            </PortalSection>
          ) : null}
        </>
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
      <ul className="space-y-3">
        {past.map((appointment) => (
          <li key={appointment.id}>
            <AppointmentCard appointment={appointment} tone="past" />
          </li>
        ))}
      </ul>
    );

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <div className="space-y-1">
          {/*
            The page's own `h1`. The portal header above it carries the tab bar
            and a bell, not a title, so every tab screen owns the top of its own
            outline — the profile screen does the same.
          */}
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {t('appointments.title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('appointments.subtitle')}</p>
        </div>

        {/*
          `soft` and full width, matching the switch below it. The solid olive
          it used to be was the loudest thing on a screen whose actual subject —
          the next appointment — sits underneath it, and this page asks for an
          appointment rather than booking one, so a bar that reads like a
          checkout button was overstating what pressing it does.

          `max-w-none` because `buttonVariants` caps every button at 320px, so
          `w-full` alone stops short of the edge on any phone wider than that.
        */}
        <Link
          href="/portal/appointments/request"
          className={buttonVariants({ variant: 'soft', className: 'w-full max-w-none' })}
        >
          <Icon name="bookAppointment" />
          {t('appointments.book')}
        </Link>

        {/*
          Under the button rather than above the title: it is the answer to the
          press, so it belongs against the control that was pressed, not floated
          over the page's heading as a thing that happened to the whole screen.

          `role="status"` because a client arriving here by redirect has had the
          page replaced under them — a screen reader announces the new document,
          not this sentence, unless it is a live region.

          On-track olive rather than a green of its own: the palette already
          spends olive on "this is going the way it should", and a second
          success colour would only be a second success colour.
        */}
        {justSent ? (
          <p
            role="status"
            className="flex items-start gap-2 rounded-lg bg-status-on-track-bg px-4 py-3 text-sm font-medium text-status-on-track-fg"
          >
            <Icon name="check" className="mt-0.5" />
            {t('appointments.requestSent')}
          </p>
        ) : null}
      </header>

      <AppointmentTabs
        label={t('appointments.title')}
        upcomingLabel={t('appointments.tabs.upcoming')}
        pastLabel={t('appointments.tabs.past')}
        upcoming={upcomingPanel}
        past={pastPanel}
      />
    </div>
  );
}
