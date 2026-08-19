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
 * ## One card, two gestures
 *
 * The title and the role switch sit *above* the card and stay put. Below them
 * is a single `AuthSplitCard` that changes shape rather than being swapped out,
 * and what it does depends on what changed:
 *
 * - **Signing in ↔ signing up** swaps the card's two halves, at
 *   `--duration-arc`. It is the same person filling in a different form — a
 *   control changing state, and it should feel like one.
 * - **Clinic team ↔ client** shrinks the card, at the slower
 *   `--duration-travel`: the olive half collapses behind the form and the card
 *   narrows around it until the form is centred on the page. A different door
 *   rather than a different form, and the forms behind it post to different
 *   endpoints — so it gets its own gesture, and a longer one, because the whole
 *   surface is resizing rather than sliding inside itself.
 *
 * Either way the fields do the same thing: fade out, hold while the card moves,
 * fade back in where they belong. That is `view` versus `shown` below.
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
 * How long each gesture takes, in milliseconds. **These mirror
 * `--duration-arc` and `--duration-travel` in `globals.css`** — the CSS moves
 * the card and these drive the swap of what is inside it, and the two have to
 * agree or the new form appears while the old one is still in flight. Change
 * each pair together.
 */
const PANEL_SWAP_MS = 220;
const CARD_RESIZE_MS = 420;

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
     * Two ways there is no movement to wait out, and holding an empty card
     * through either of them is just dead time: `prefers-reduced-motion`
     * collapses the transition globally, and below `md` the card has no split
     * to swap and no width to lose — so the change is only ever a crossfade.
     */
    const instant =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !window.matchMedia('(width >= 48rem)').matches;

    /* A role change resizes the whole card; anything else only swaps its halves. */
    const settle = target.role === current.role ? PANEL_SWAP_MS : CARD_RESIZE_MS;

    if (swapTimer.current) clearTimeout(swapTimer.current);
    swapTimer.current = setTimeout(() => setShown(target), instant ? 0 : settle);
  }, [locale]);

  /*
   * The title names what the card in front of you is for, so the client view
   * outranks the mode — clients never sign up, and `mode` is still carrying
   * whichever staff form you were on before you switched.
   */
  const title =
    view.role === 'client' ? t('clientTitle') : view.mode === 'signUp' ? t('signUpHeading') : t('title');

  /* Which gesture is in flight: a role change resizes the card, anything else
     only swaps its halves. */
  const pace = view.role === shown.role ? 'panel' : 'card';

  return (
    <main className="q-route-stage flex min-h-dvh w-full flex-col items-center justify-center gap-6 overflow-x-hidden bg-auth-canvas px-4 py-12 sm:px-6">
      <header className="flex w-full max-w-6xl flex-col items-center gap-5 text-center">
        {/*
          Keyed on the title so React remounts it and the fade replays. The
          heading is one line of a few words either way, so nothing below it
          moves when it changes.
        */}
        <h1 key={title} className="font-heading text-display-sm motion-safe:animate-in motion-safe:fade-in">
          {title}
        </h1>

        {/*
          A radiogroup, not a tablist: this picks which form to fill in, not
          which view of the same content to show.
        */}
        <Segmented
          role="radiogroup"
          label={t('roleQuestion')}
          value={view.role}
          onChange={(role) => goTo({ role })}
          className="grid grid-cols-2"
          activeClassName="bg-accent-green text-on-accent"
          options={ROLES.map((option) => ({
            value: option.value,
            label: t(option.labelKey),
          }))}
        />
      </header>

      <div className="w-full max-w-6xl">
        <AuthSplitCard
          showBrandPanel={view.role === 'staff'}
          formSide={view.mode === 'signUp' ? 'start' : 'end'}
          tagline={t('brandTagline')}
          pace={pace}
          contentVisible={view.role === shown.role && view.mode === shown.mode}
          /*
           * Keyed off `shown` rather than `view`, so it fades out with the
           * fields it belongs beside instead of vanishing the instant something
           * is clicked. The client view has none: those credentials come from a
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
      </div>
    </main>
  );
}
