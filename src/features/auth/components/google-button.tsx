'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { type Locale } from '@/i18n/routing';

import { attemptGoogleSignIn } from '../google-sign-in';
import { GoogleIcon } from './google-icon';

type GoogleButtonProps = {
  locale: Locale;
  /**
   * True only on the sign-up page. `disableImplicitSignUp` is set on the
   * provider, so an unknown Google account is refused unless enrolment is asked
   * for explicitly — which is what stops the sign-in page from quietly turning a
   * stranger into staff with a clinic of their own.
   */
  requestSignUp?: boolean;
  /** Where to land after success. Already validated by the caller. */
  redirectTo?: string;
};

/**
 * Google sign-in. Staff pages only — patients use a single-use emailed link, and
 * offering them Google here would invite them to try a door that is not theirs.
 *
 * This calls Better Auth over HTTP through `authClient` rather than through a
 * server action, for a specific reason: the flow depends on a `state` cookie
 * being set in the browser BEFORE the redirect to Google and validated when
 * Google sends the user back. Driving it from the client uses Better Auth's own
 * endpoint, which sets that cookie on an ordinary HTTP response — the path the
 * library is built and tested around. Routing it through a server action that
 * then redirects put a Next.js action response in the middle of that handshake.
 *
 * The passkey button is client-side for the same family of reasons. It also
 * means these two are the only auth paths Better Auth's own rate limiter
 * actually covers, since that limiter runs in its router and never sees a
 * server action.
 */
export function GoogleButton({ locale, requestSignUp = false, redirectTo }: GoogleButtonProps) {
  const t = useTranslations('login');
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function start() {
    setPending(true);
    setFailed(false);

    const started = await attemptGoogleSignIn(() =>
      authClient.signIn.social({
        provider: 'google',
        callbackURL: redirectTo ?? `/${locale}/app`,
        // Failures come back as a query parameter on our own sign-in page rather
        // than Better Auth's bare error screen, so the message can be translated.
        errorCallbackURL: `/${locale}/login`,
        ...(requestSignUp ? { requestSignUp: true } : {}),
      }),
    );

    // Reached only when the redirect never happened; otherwise this page is gone.
    if (!started) {
      setPending(false);
      setFailed(true);
    }
  }

  return (
    <div className="space-y-2">
      {/*
        `neutral`, not `outline` — and it is also what v5.html draws: a white box
        with a hairline border that takes a quiet grey fill and a slightly firmer
        edge on hover, with no brand colour anywhere in the state.

        `outline` flips to a solid lime fill on hover — `hover:border-accent-lime
        hover:bg-accent-lime hover:text-on-accent`. That is the loudest hover the
        system has, and it was firing on the two *alternate* sign-in paths while
        the actual primary, the olive submit above them, only darkened a step.
        Pointing at the second-choice button lit the screen up more than pressing
        the first-choice one.

        `neutral` is the variant that exists for this: a real box so it still
        reads as pressable, a foreground label, and `hover:bg-accent` — the cool
        neutral tint, `c-200`. Same 200ms and same easing as before, because the
        transition lives on the button's base classes and no variant touches it;
        only the colour changed. It leaves lime to the focus ring, which is the
        one place the system spends it on every control alike.
      */}
      <Button
        type="button"
        variant="neutral"
        className="w-full max-w-none"
        disabled={pending}
        onClick={start}
      >
        <GoogleIcon />
        {t('continueWithGoogle')}
      </Button>
      {failed ? <p role="alert" className="text-sm text-destructive">{t('googleUnavailable')}</p> : null}
    </div>
  );
}
