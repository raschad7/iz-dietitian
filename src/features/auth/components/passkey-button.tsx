'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { type Locale } from '@/i18n/routing';

/**
 * The one auth path that is NOT a server action.
 *
 * WebAuthn needs `navigator.credentials`, which only exists in the browser, so
 * this calls Better Auth over HTTP at /api/auth/*. A side effect worth knowing:
 * this is therefore the only path Better Auth's own rate limiter covers, since
 * that limiter runs in the router and never sees a server action.
 */
export function PasskeyButton({ locale }: { locale: Locale }) {
  const t = useTranslations('login');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function signIn() {
    setPending(true);
    setError(null);

    const result = await authClient.signIn.passkey();

    setPending(false);

    if (result?.error) {
      // Includes the ordinary "user dismissed the browser prompt" case, so this
      // stays a quiet inline message rather than anything alarming.
      setError(t('passkeyFailed'));
      return;
    }

    router.push(`/${locale}/app`);
  }

  return (
    <div className="space-y-2">
      {/*
        `neutral`, not `outline` — the lime hover flip is gone from both
        alternate sign-in buttons for the reason written out on `GoogleButton`:
        it out-shouted the olive submit above it, and v5.html tints neither.
        Same transition, neutral fill.
      */}
      <Button
        type="button"
        variant="neutral"
        className="w-full max-w-none"
        disabled={pending}
        onClick={signIn}
      >
        {/*
          The FIDO fingerprint, hand-inlined rather than taken from `Icon`:
          this is the mark the platform prompts themselves use, so it is a
          standard mark like `GoogleIcon` rather than a picture we get to
          choose — which is why it stays hand-drawn even though the set it once
          had no biometric glyph for (Solar) is long gone.

          Everything else follows the rules: `currentColor` so it inverts with
          the button's label on hover
          (a hardcoded green-950 stayed dark at rest, where the label is not),
          and sized by the button rather than by a 2em intrinsic size that made
          it twice the width of the Google mark beside it.
        */}
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="size-4 shrink-0"
        >
          <path d="M18 12a6 6 0 0 0-12 0a11.97 11.97 0 0 0 4.063 9M12 12a6 6 0 0 0 7 5.917M15.034 20.5A9 9 0 0 1 9 12a3 3 0 0 1 3-3a2.95 2.95 0 0 1 2.911 2.466l.178 1.068A2.95 2.95 0 0 0 18 15a3 3 0 0 0 3-3a9 9 0 1 0-18 0c0 1.753.3 3.436.854 5" />
        </svg>
        {t('continueWithPasskey')}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
