'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { Dialog, DialogBody, DialogHeader } from '@/components/ui/dialog';
import { RequestForm } from '@/features/portal/components/request-form';
import { type RequestPageData } from '@/features/portal/types';
import { usePathname, useRouter } from '@/i18n/navigation';
import { getLocaleDirection, type Locale } from '@/i18n/routing';

/**
 * Asking for an appointment, over the appointments page rather than on a screen
 * of its own.
 *
 * **The URL still owns whether this is open**, and that is what keeps the form
 * working. Choosing a day is a server round trip on purpose — `loadRequestPage`
 * computes availability with the same rule engine a real booking uses, and
 * shipping the month's bookings to the browser to do it client-side would tell
 * every client when everybody else is booked. `DayStrip` therefore navigates,
 * rebuilding the query from `useSearchParams()`, so `?request=1` rides along
 * with `?date=` and the dialog stays open across the day being changed. Holding
 * "is it open" in local state instead would close it on the first tap of the
 * strip.
 *
 * It is mounted only when the URL says so, so the page pays for none of this —
 * `loadRequestPage` reads the clinic's hours and a month of its bookings, and
 * that read does not happen on an ordinary visit to the appointments list.
 *
 * **Closing is a navigation, but the exit animation still plays.** `close()`
 * drops the local flag first and then navigates inside `startTransition`, which
 * keeps the current tree on screen until the new page is ready — so `Dialog`
 * gets its 140ms `data-closing` pass before this component is unmounted by the
 * route it just asked for. Sending is the same story from the other end:
 * `requestAppointmentAction` redirects to `?sent=1`, which carries no
 * `request`, so the dialog closes itself and the page it lands on is the one
 * showing the confirmation.
 *
 * No portal, for the reason set out on `data-update-request.tsx`: this page
 * renders inside `.q-route-stage`, whose route-enter animation puts a
 * `transform` and a `clip-path` on an ancestor, and a dialog opened with
 * `showModal()` is promoted to the top layer where neither reaches it.
 */
export function AppointmentRequestDialog({
  data,
  locale,
}: {
  data: RequestPageData;
  locale: Locale;
}) {
  const t = useTranslations('portal');

  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  /*
    True from the first render: this component exists only because the URL asked
    for it. The flag is not a second source of truth for "is the form open" —
    it is what lets the close animation run before the navigation that actually
    closes it lands.
  */
  const [open, setOpen] = useState(true);

  function close() {
    setOpen(false);

    // Bare `pathname`, so `request`, `date`, `kind` and `appointmentId` all go
    // at once. `replace`, not `push`: opening and closing a form should not put
    // an entry in history that the back button walks back into.
    startTransition(() => router.replace(pathname));
  }

  const title = t(`request.heading.${data.kind}`);

  return (
    <Dialog
      open={open}
      onClose={close}
      label={title}
      dir={getLocaleDirection(locale)}
      flat
      // `open:` rather than a bare `flex`: a `display` utility on a <dialog>
      // outranks the UA rule that hides it while closed.
      className="open:flex open:flex-col max-h-[90dvh] overflow-hidden"
    >
      {/*
        No corner close, matching the correction dialog: the way out is the
        backdrop, or Escape on a keyboard. §Fields — "a third exit only crowds
        the corner the title starts from".

        Stated honestly, because this dialog has no footer to leave by either:
        that makes the backdrop the *only* exit a touch client has, and it is
        an unlabelled one. It is the shape asked for, and it is consistent
        across both of the portal's dialogs, which is the argument for it — a
        client who learns to dismiss one has learned to dismiss the other.
      */}
      <DialogHeader title={title} />

      <DialogBody className="min-h-0 flex-1 overflow-y-auto">
        {/* The sentence that stops this reading as a booking screen: the
            dietitian confirms, and until they do nothing is held. */}
        <p className="text-sm text-muted-foreground">{t(`request.description.${data.kind}`)}</p>

        <RequestForm {...data} locale={locale} />
      </DialogBody>
    </Dialog>
  );
}
