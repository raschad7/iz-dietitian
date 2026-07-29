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
      <Button type="button" variant="outline" className="w-full" disabled={pending} onClick={signIn}>
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
