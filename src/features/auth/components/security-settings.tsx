'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { removePasskeyAction } from '@/features/auth/actions';
import { initialAuthState } from '@/features/auth/form-state';
import { authClient } from '@/lib/auth-client';
import { type Locale } from '@/i18n/routing';

export type PasskeySummary = { id: string; name: string | null; createdAt: string };

type SecuritySettingsProps = {
  locale: Locale;
  passkeys: readonly PasskeySummary[];
  /** Provider ids from `listUserAccounts` — 'credential' means a password. */
  providers: readonly string[];
};

export function SecuritySettings({ locale, passkeys, providers }: SecuritySettingsProps) {
  const t = useTranslations('login');
  const [state, formAction] = useActionState(removePasskeyAction, initialAuthState);
  const [adding, setAdding] = useState(false);

  const hasPassword = providers.includes('credential');
  const hasGoogle = providers.includes('google');

  /**
   * Total ways into this account. The remove button is disabled at 1, because
   * otherwise the page offers a two-click path to permanent lockout: a
   * passkey-only account whose passkey is deleted has no password, no linked
   * provider, and no way to prove ownership of an account it cannot sign into.
   *
   * The server re-checks this. A disabled button is a courtesy, never a control.
   */
  const methodCount = providers.length + passkeys.length;

  async function addPasskey() {
    setAdding(true);
    await authClient.passkey.addPasskey();
    setAdding(false);
    // The list is server-rendered, so reload rather than hand-patch local state.
    window.location.reload();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('passkeysTitle')}</CardTitle>
          <CardDescription>{t('passkeysDescription')}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {passkeys.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('passkeysNone')}</p>
          ) : (
            <ul className="space-y-2">
              {passkeys.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <span className="font-medium">{entry.name ?? t('passkeyUnnamed')}</span>

                  <form action={formAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="passkeyId" value={entry.id} />
                    <Button
                      type="submit"
                      variant="outline"
                      size="sm"
                      disabled={methodCount <= 1}
                      title={methodCount <= 1 ? t('lastSignInMethod') : undefined}
                    >
                      {t('passkeyRemove')}
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          {state.status === 'error' ? (
            <p role="alert" className="text-sm text-destructive">
              {t(state.messageKey)}
            </p>
          ) : null}

          {state.status === 'success' ? (
            <p role="status" className="text-sm text-muted-foreground">
              {t(state.messageKey)}
            </p>
          ) : null}

          <Button type="button" variant="outline" disabled={adding} onClick={addPasskey}>
            {t('passkeyAdd')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('methodsTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>{hasPassword ? t('methodPasswordOn') : t('methodPasswordOff')}</p>
          <p>{hasGoogle ? t('methodGoogleOn') : t('methodGoogleOff')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
