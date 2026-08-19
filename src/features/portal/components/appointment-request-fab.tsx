'use client';

import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

import { buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Link } from '@/i18n/navigation';

/**
 * The one thing a client can start from the appointments screen, as a circle
 * pinned to the block-end corner.
 *
 * **Why it left the header.** It was a full-width box under the page title,
 * above the tab switch — three stacked bands of chrome before the first
 * appointment. On a phone that put the answer to "when am I next seen?" below
 * the fold on the screen whose entire job is to give it. Asking for an
 * appointment is the rarer act; the list is why the page is opened. A corner
 * circle inverts that without taking the action away: it is on screen the whole
 * time, including while the client is halfway down their history, which the
 * header button never was once you scrolled.
 *
 * **Icon only.** `bookAppointment` is the calendar-plus already used for this
 * action everywhere else in the app — the staff day view, the client profile,
 * the request rows — so the glyph is not being invented here, only repeated
 * without its label. The label survives as `aria-label` and as the native
 * `title` tooltip, and the standalone request screen it opens leads with the
 * same words, so the glyph is never the last word on what it does.
 *
 * ⚠ **It must portal to `document.body`, and this is not optional.** Every tab
 * page renders inside `.q-route-stage`, whose entrance animation fills `both` —
 * so a settled stage still computes a transform, and a transformed ancestor is
 * the containing block for every `position: fixed` descendant it has. From
 * inside the page this button would be pinned to the corner of the `max-w-3xl`
 * column rather than the viewport, and clipped by the stage's `clip-path` on
 * the way. `HomeGlow` hit the same wall and was moved up to `(tabs)/layout.tsx`
 * to escape it; a page-specific control cannot go there, so it leaves through
 * the DOM instead. See the note beside `.q-route-stage` in `globals.css`.
 *
 * The cost of that is one frame: a portal has nothing to render on the server,
 * so the button appears at hydration rather than in the first paint, and a
 * browser with no JavaScript never gets it. `/portal/appointments/request` is
 * still a real route and still reachable — it is what a bookmark or a shared
 * link opens — so the ask is not gated on this button existing.
 */

type AppointmentRequestFabProps = {
  /** `portal.appointments.book`. Resolved by the page; this reads no messages. */
  label: string;
};

/*
  "Are we in the browser yet?", as a store that never changes.

  `document.body` does not exist during the server render and cannot be read in
  one, so the portal has to wait for hydration. The obvious spelling of that
  wait — `useState(false)` plus an effect that sets it true — is what
  `react-hooks/set-state-in-effect` exists to catch, and it is right to: nothing
  is being *synchronised* there, the component simply wants to know which
  environment it rendered in, and an effect that only ever fires once to flip a
  boolean buys a second render pass to answer a question React already knows the
  answer to.

  `useSyncExternalStore` answers it in one pass instead. The server snapshot is
  `false` and the client snapshot is `true`, which is exactly the distinction
  being drawn; `subscribe` returns an unsubscribe and is never called again,
  because this value cannot change after hydration. All three are module
  constants so their identities are stable across renders — the hook re-subscribes
  when `subscribe` changes, and an inline arrow would change every time.

  `notifications-bell.tsx` and `use-mobile.ts` reach for the same hook for the
  same reason: an environment fact belongs in a store, not in state seeded by an
  effect.
*/
const subscribeToNothing = () => () => {};
const onClient = () => true;
const onServer = () => false;

export function AppointmentRequestFab({ label }: AppointmentRequestFabProps) {
  const hydrated = useSyncExternalStore(subscribeToNothing, onClient, onServer);

  if (!hydrated) return null;

  return createPortal(
    <Link
      href="/portal/appointments?request=1"
      /*
        The button is its own label. `aria-label` names it for a screen reader,
        `title` gives a pointer the same words on hover — neither is decoration
        here, because there is no visible text to fall back on.
      */
      aria-label={label}
      title={label}
      className={buttonVariants({
        size: 'fab',
        className: [
          /*
            `end-4`, not `right-4`: the corner mirrors with the writing
            direction, so it is the block-end *right* in English and the
            block-end *left* in Arabic — the side a thumb reaches on the hand
            the language is read with.

            `--q-fab-offset-bottom` is set on <body> only while `PortalTabBar`
            is on screen; the `1.5rem` fallback is what a desktop, where the bar
            is gone, gets instead. Set in `globals.css` beside the toast's own
            clearance, which is the same measurement.

            `q-fab` styles nothing here. It is the hook the safe-area rule in
            `globals.css` keys on, and it exists because this is one of the
            places `end-4` is not enough on its own: the inline safe-area insets
            are a *physical* fact about the glass — a sensor housing does not
            swap sides when the reader switches to Arabic — so the rule that
            raises this 1rem to clear a rounded corner in landscape has to say
            `left`/`right`, which no utility on this element can.
          */
          'q-fab fixed bottom-[var(--q-fab-offset-bottom,1.5rem)] end-4 z-40',
          /*
            Above the page, below the surfaces that interrupt it. The tab bar
            is `z-40` too and this sits clear of it by ~11px, so they never
            overlap and the tie never has to be broken; dialogs and sheets are
            `z-50` and cover this deliberately — the request form it opens is
            one of them.
          */
          'shadow-elevated hover:shadow-overlay',
          /*
            The circle grows a touch under the pointer and settles back on
            press, on the button's own 200ms curve — it inherits the transition
            from `buttonVariants`, so nothing new is being timed here. There is
            no entrance animation: this is chrome that is simply present, and a
            control that flies in every time a tab is opened is a control that
            asks to be watched rather than used.
          */
          'hover:scale-105 active:scale-100',
        ].join(' '),
      })}
    >
      <Icon name="bookAppointment" />
    </Link>,
    document.body,
  );
}
