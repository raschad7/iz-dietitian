'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Segmented } from '@/components/ui/segmented';
import { AuthSplitCard } from '@/features/auth/components/auth-split-card';
import { ClientLoginForm } from '@/features/auth/components/client-login-form';
import { StaffLoginForm } from '@/features/auth/components/staff-login-form';
import { StaffSignUpForm } from '@/features/auth/components/staff-signup-form';
import { type Locale } from '@/i18n/routing';

/**
 * The whole sign-in / sign-up screen: title, role switch, and the one card the
 * forms live in.
 *
 * ## The role switch is TEMPORARY
 *
 * The intended flow is one form: whoever signs in is looked up, their role is
 * read off the account, and they land in the dietitian area or the portal
 * accordingly. Until that exists, staff and clients authenticate through two
 * different Better Auth paths — email + password versus username + password —
 * so the page has to know which one to post to before anything is typed.
 *
 * Deleting the `Segmented` and pinning `role` to `'staff'` is the whole removal;
 * nothing else here depends on it.
 *
 * ## Two columns, one gesture
 *
 * The screen is a single `AuthSplitCard`, built to `v5.html`: the form in a
 * column at the inline-start and the illustration in a rounded panel at the
 * inline-end. The title, the tagline and the role switch all ride at the head of
 * the *form* column — the other side is a picture and has nowhere to put a
 * control. The layout mirrors with the locale, so the picture is on the right in
 * English and on the left in Arabic.
 *
 * Changing role or mode does one thing, and the columns do not move for it: the
 * fields fade out, are replaced while they are invisible, and fade back up in
 * place. That is `view` versus `shown` below.
 *
 * The card used to animate as well — the two halves sliding past each other
 * between sign-in and sign-up, and the whole card shrinking around the form on
 * the client view. Both needed a card with room around it to move in, and the
 * panels are the page now: there is nothing for them to slide within and no
 * width to give up. The crossfade is what survived, and it is the part that was
 * doing the work, because it is what stops a form being swapped out from under a
 * pointer that is already in a field.
 */

type Role = 'staff' | 'client';
type Mode = 'signIn' | 'signUp';

/** What the card is showing, and what it is on its way to showing. */
type View = { role: Role; mode: Mode };

const ROLES = [
  { value: 'staff', labelKey: 'roleStaff' },
  { value: 'client', labelKey: 'roleClient' },
] as const satisfies readonly { value: Role; labelKey: string }[];

/**
 * How long to hold the faded-out form before swapping what is inside it, in
 * milliseconds. **This mirrors `--duration-reverse` in `globals.css`**, which is
 * the speed `AuthSplitCard`'s fade runs out at — the CSS takes the fields down
 * and this decides when they are safe to replace, and the two have to agree or
 * the new form appears while the old one is still on screen. Change them
 * together.
 *
 * It used to be a pair, 220ms and 420ms, because the card had two gestures of
 * different sizes to wait out: the halves sliding past each other, and the card
 * resizing around the form. The panels have neither. All that is left is
 * the crossfade, so there is one number and it is the fade's own.
 */
const CROSSFADE_MS = 140;

/**
 * The URL each face of the card is addressable at.
 *
 * The three routes are one screen opened on a different face, and the card can
 * turn to any of them without navigating — so the address bar has to be kept
 * honest, or the card's state and the URL drift apart. That drift is what made
 * the language switcher look broken: it navigates (the locale is a path
 * segment, so it must), the page reloads, and whatever `initialRole` /
 * `initialMode` the *URL* carries wins over what you were actually looking at.
 * Toggling to the clinic team on `/client-login` and then changing language put
 * you back on the client form.
 */
function pathForView(view: View): string {
  if (view.role === 'client') return 'client-login';
  return view.mode === 'signUp' ? 'signup' : 'login';
}

type AuthScreenProps = {
  locale: Locale;
  /** Google OAuth is only wired up when credentials exist; read server-side so
   * a client component never needs `@/lib/auth`, which pulls in the database. */
  showGoogle: boolean;
  /** Carries `?redirect=` from `src/proxy.ts` through to the server action,
   * which validates it against an allow-list — this screen only relays it. */
  redirectTo?: string;
  /** An error code from the OAuth round trip; see `StaffLoginForm`. */
  oauthError?: string;
  /** `/signup` opens on the sign-up form, `/login` on sign-in. */
  initialMode?: Mode;
  /** `/client-login` opens on the client view. */
  initialRole?: Role;
};

export function AuthScreen({
  locale,
  showGoogle,
  redirectTo,
  oauthError,
  initialMode = 'signIn',
  initialRole = 'staff',
}: AuthScreenProps) {
  const t = useTranslations('login');

  /*
   * Two copies of the same shape, and that is the point.
   *
   * `view` is where the card is going, and drives its geometry immediately.
   * `shown` is what is rendered inside it, and lags by exactly one gesture.
   * While they disagree the contents are faded out, so what actually moves is
   * an empty card — the fields fade away where they stood and the new ones fade
   * up in their own place, rather than sliding past under the pointer.
   */
  const [view, setView] = useState<View>({ role: initialRole, mode: initialMode });
  const [shown, setShown] = useState<View>({ role: initialRole, mode: initialMode });
  const swapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /*
   * `goTo` needs to know where the card currently is, and it cannot read it out
   * of a `setView` updater: scheduling the timer in there makes the updater
   * impure, and React runs updaters twice in development to catch exactly that.
   * The ref is written from the event handler, never during a render.
   */
  const viewRef = useRef<View>({ role: initialRole, mode: initialMode });

  useEffect(
    () => () => {
      if (swapTimer.current) clearTimeout(swapTimer.current);
    },
    [],
  );

  const goTo = useCallback((next: Partial<View>) => {
    const current = viewRef.current;
    const target: View = { ...current, ...next };
    if (target.role === current.role && target.mode === current.mode) return;

    viewRef.current = target;
    setView(target);

    /*
     * Point the address bar at the face now showing, without navigating.
     * `history.replaceState` is shallow — Next syncs `usePathname` from it, so
     * the locale switcher reads the right path, but nothing remounts and
     * nothing typed into the form is lost. A real `router.replace` here would
     * throw the form away on every toggle.
     *
     * `replaceState` rather than `pushState`: turning the card over is not a
     * destination, and stacking every toggle would make Back walk backwards
     * through them instead of leaving the screen. The query string rides along
     * so `?redirect=` survives.
     */
    window.history.replaceState(null, '', `/${locale}/${pathForView(target)}${window.location.search}`);

    /*
     * `prefers-reduced-motion` collapses the fade globally, and holding a blank
     * form panel through a transition that is not running is just dead time.
     *
     * There is no width test here any more. There used to be one — below the
     * card's breakpoint it had no split to swap and no width to lose — but the
     * panels crossfade identically at every width, so the only question left is
     * whether the fade runs at all.
     */
    const instant = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (swapTimer.current) clearTimeout(swapTimer.current);
    swapTimer.current = setTimeout(() => setShown(target), instant ? 0 : CROSSFADE_MS);
  }, [locale]);

  /*
   * The title names what the card in front of you is for, so the client view
   * outranks the mode — clients never sign up, and `mode` is still carrying
   * whichever staff form you were on before you switched.
   */
  const title =
    view.role === 'client' ? t('clientTitle') : view.mode === 'signUp' ? t('signUpHeading') : t('title');

  return (
    /*
     * A bare wrapper, and deliberately nothing more. No background, no padding,
     * no `max-w-*` and nothing centred out here: `AuthSplitCard` owns the page
     * colour, the column padding and the form's width cap, and a second set of
     * any of them at this level would show up as a margin nobody asked for.
     *
     * `min-h-dvh` and no `overflow-hidden`, deliberately — see the note at the
     * top of `AuthSplitCard`. Capping this at `h-dvh` is what once hid the
     * passkey and Google buttons below the fold of a scroll container nobody
     * could see.
     *
     * `q-route-stage` stays absent from this route. Its enter animation starts
     * from `clip-path: inset(0 1rem 0 0 round var(--enzyme-radius-lg))`, which
     * clips against the element's own box — and this element's box is the full
     * viewport, not the card, so the strip it opens from is bare document
     * background down the edge of the screen rather than a surface sliding in.
     * Staging the *card* would be the way to give this screen an entrance; the
     * wrapper is the wrong element for it.
     */
    <main className="min-h-dvh w-full">
      <AuthSplitCard
        contentVisible={view.role === shown.role && view.mode === shown.mode}
        /*
         * The role switch, which now lives at the top of the form panel — the
         * left panel is a photograph and has nowhere to put a control.
         */
        header={
          <>
            {/*
              v5.html's `.title-group` — heading and one line under it, centred,
              24px clear of the control below.

              The heading is visible; it spent a revision `sr-only` because the
              full-bleed layout had no room above the fields for it. **The words
              are the catalogue's own** — `title` / `signUpHeading` /
              `clientTitle`, unchanged. v5.html says "Welcome Back" over its own
              subtitle, but copy is localisation, not styling, and replacing
              approved Arabic with a mockup's placeholder is not a visual change.

              `font-heading` picks up Readex Pro in English and Almarai in
              Arabic. `font-bold` is v5.html's 800 as near as the loaded weights
              go. No `tracking-*` even though v5.html asks for -0.02em:
              docs/design-system.md forbids letter spacing on Arabic, and Arabic
              is this app's default locale.
            */}
            {/*
              Second of the entrance's five parts — see `q-auth-enter` in
              `globals.css`. The heading and its tagline rise together, because
              they are one thing to read and splitting them would put a beat
              between a sentence and its own second line.

              The two position classes in this file are the only reason
              `AuthScreen` knows the entrance exists at all. They are here rather
              than in `AuthSplitCard` because this is where these two rows are
              written: the card receives them as one opaque `header` node and has
              nothing to hang a per-row delay on.
            */}
            <div className="q-auth-enter q-auth-enter-2 mb-5 text-center short:mb-3">
              {/*
                `min-h-[2lh]` — two lines of this heading's own line box, held
                open whether the words fill them or not.

                The three faces do not have three headings of the same length:
                "Sign in" and "Client portal" take one line, "Create a clinic
                team account" takes two. Left to itself that is a 41px step in
                the heading, and everything below it — tagline, role switch,
                fields — steps with it, which is the same jump the fields used to
                cause, arriving from the other direction.

                `lh` rather than a pixel figure so it follows the `short:` size
                below without a second number to keep in step.

                ⚠ `short:min-h-0` gives it straight back on a cramped viewport.
                Below 860px the sign-in form already comes within about 40px of
                the fold, and reserving a line nothing is written on is exactly
                the kind of decorative space that must go before a control does —
                so on those screens the heading collapses to its content and the
                sign-up face is allowed to sit lower.
              */}
              <h1 className="min-h-[2lh] font-heading text-display-sm font-bold text-foreground short:min-h-0 short:text-heading-lg">
                {title}
              </h1>

              {/*
                `brandTagline` — a string that has been in the catalogue since an
                older brand panel carried it, and that a later revision orphaned
                along with the panel. One line under the heading is what it was
                written for, and it says the same true thing on all three faces
                of the screen, so it does not have to change when the card turns
                over.
              */}
              {/*
                `shorter:hidden` — the one piece of copy on this screen that is
                allowed to go. It is brand atmosphere, not instruction: nothing
                about signing in depends on reading it, and on a 1366×768 laptop
                its 30px is the difference between the sign-up form fitting and
                the footer sitting under the fold. Every other line here names a
                field, a control or an error, and none of those may be hidden to
                win space.
              */}
              {/*
                `font-light` — 300, and it is a real 300 in both scripts.

                Readex Pro already loaded one; Almarai did not, and `[locale]/
                layout.tsx` now asks for it explicitly. That matters because CSS
                does not *synthesise* a light weight the way it will fake a bold:
                with only 400 and 700 loaded this class would have matched the
                400 face and changed nothing at all on the default locale.

                ⚠ This is the one line on the screen allowed to take it. See the
                warning beside the font declaration: 300 gives up real legibility
                in Arabic at body sizes, and everything else here names a field,
                a control or an error.
              */}
              <p className="mt-2 text-body-sm font-light text-muted-foreground shorter:hidden">
                {t('brandTagline')}
              </p>
            </div>

            {/*
              A radiogroup, not a tablist: this picks which form to fill in, not
              which view of the same content to show.

              `shape="pill"` is already v5.html's `.role-toggle` almost to the
              pixel — a neutral well, two equal halves, and the selected one
              lifted out of it as a white card. The two differences are both the
              design system winning on purpose: the well is 14px/10px where
              v5.html draws 12px/8px, and the halves are 44px tall where v5.html
              is ~39px, which is under this project's touch floor.

              **No `activeClassName`.** It used to pass `bg-accent-lime
              text-on-accent`, which spent the system's scarcest colour on a
              question nobody came to this page to answer — and v5.html tints
              nothing here either. Dropping the override hands the control back to
              `Segmented`'s own pill treatment, where elevation carries the
              selection instead of hue.
            */}
            <Segmented
              role="radiogroup"
              shape="pill"
              label={t('roleQuestion')}
              value={view.role}
              onChange={(role) => goTo({ role })}
              /* Third of the five. */
              className="q-auth-enter q-auth-enter-3 mb-5 short:mb-3"
              options={ROLES.map((option) => ({
                value: option.value,
                label: t(option.labelKey),
              }))}
            />
          </>
        }
        /*
         * Keyed off `shown` rather than `view`, so it fades out with the fields
         * it belongs beside instead of vanishing the instant something is
         * clicked. The client view has none: those credentials come from a
         * dietitian, so there is nothing to sign up for.
         */
        switcher={
          shown.role === 'client'
            ? undefined
            : shown.mode === 'signUp'
              ? { prompt: t('haveAccount'), label: t('signInLink'), onClick: () => goTo({ mode: 'signIn' }) }
              : { prompt: t('noAccount'), label: t('signUpLink'), onClick: () => goTo({ mode: 'signUp' }) }
        }
      >
        {shown.role === 'client' ? (
          <ClientLoginForm locale={locale} />
        ) : shown.mode === 'signUp' ? (
          <StaffSignUpForm locale={locale} showGoogle={showGoogle} />
        ) : (
          <StaffLoginForm
            locale={locale}
            showGoogle={showGoogle}
            redirectTo={redirectTo}
            oauthError={oauthError}
          />
        )}
      </AuthSplitCard>
    </main>
  );
}
