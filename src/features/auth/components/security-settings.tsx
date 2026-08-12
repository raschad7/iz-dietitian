'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { removePasskeyAction } from '@/features/auth/actions';
import { initialAuthState } from '@/features/auth/form-state';
import { type Locale } from '@/i18n/routing';
import { authClient } from '@/lib/auth-client';
import { formatDate } from '@/lib/format';

export type PasskeySummary = { id: string; name: string | null; createdAt: string };

export function SecuritySettings({ locale, passkeys, providers }: {
  locale: Locale;
  passkeys: readonly PasskeySummary[];
  providers: readonly string[];
}) {
  const t = useTranslations('login');
  const ts = useTranslations('settingsWorkspace.security');
  const [state, formAction] = useActionState(removePasskeyAction, initialAuthState);
  const [adding, setAdding] = useState(false);
  const hasPassword = providers.includes('credential');
  const hasGoogle = providers.includes('google');
  const methodCount = providers.length + passkeys.length;

  async function addPasskey() {
    setAdding(true);
    await authClient.passkey.addPasskey();
    setAdding(false);
    window.location.reload();
  }

  return (
    <div className="space-y-5">
      <Callout icon="security">{ts('safetyNote')}</Callout>

      {passkeys.length === 0 ? (
        <EmptyState icon="passkey" title={t('passkeysNone')} description={t('passkeysDescription')} layout="row">
          <Button type="button" variant="outline" disabled={adding} onClick={addPasskey}>
            <Icon name="passkey" />{t('passkeyAdd')}
          </Button>
        </EmptyState>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle as="h3" icon="passkey">{t('passkeysTitle')}</CardTitle>
            <CardDescription>{t('passkeysDescription')}</CardDescription>
            <CardAction><Button type="button" variant="outline" size="sm" disabled={adding} onClick={addPasskey}>{t('passkeyAdd')}</Button></CardAction>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            {passkeys.map((entry) => (
              <div key={entry.id} className="grid min-h-20 items-center gap-3 py-3 sm:grid-cols-[2.5rem_1fr_auto]">
                <span className="hidden size-10 place-items-center rounded-full bg-muted text-muted-foreground sm:grid"><Icon name="passkey" /></span>
                <div className="min-w-0"><p className="font-medium">{entry.name ?? t('passkeyUnnamed')}</p><p className="text-caption text-muted-foreground">{ts('createdAt', { date: formatDate(locale, entry.createdAt) })}</p></div>
                <form action={formAction}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="passkeyId" value={entry.id} />
                  <Button type="submit" variant="destructiveGhost" size="sm" disabled={methodCount <= 1} title={methodCount <= 1 ? t('lastSignInMethod') : undefined}>{t('passkeyRemove')}</Button>
                </form>
              </div>
            ))}
            {state.status !== 'idle' ? <Callout className="mt-4" role={state.status === 'error' ? 'alert' : 'status'} tone={state.status === 'error' ? 'attention' : 'neutral'} icon={state.status === 'success' ? 'check' : undefined}>{t(state.messageKey)}</Callout> : null}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle as="h3" icon="lock">{t('methodsTitle')}</CardTitle><CardDescription>{ts('methodsDescription')}</CardDescription></CardHeader>
        <CardContent className="divide-y divide-border">
          <MethodRow icon="lock" title={ts('passwordTitle')} description={hasPassword ? t('methodPasswordOn') : t('methodPasswordOff')} enabled={hasPassword} enabledLabel={ts('enabled')} disabledLabel={ts('notConnected')} />
          <MethodRow icon="email" title="Google" description={hasGoogle ? t('methodGoogleOn') : t('methodGoogleOff')} enabled={hasGoogle} enabledLabel={ts('enabled')} disabledLabel={ts('notConnected')} />
        </CardContent>
      </Card>
    </div>
  );
}

function MethodRow({ icon, title, description, enabled, enabledLabel, disabledLabel }: {
  icon: 'lock' | 'email';
  title: string;
  description: string;
  enabled: boolean;
  enabledLabel: string;
  disabledLabel: string;
}) {
  return (
    <div className="grid min-h-20 grid-cols-[2.5rem_1fr_auto] items-center gap-3 py-3">
      <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground"><Icon name={icon} /></span>
      <div className="min-w-0"><p className="font-medium">{title}</p><p className="text-caption text-muted-foreground">{description}</p></div>
      <Badge variant={enabled ? 'onTrack' : 'muted'}>{enabled ? enabledLabel : disabledLabel}</Badge>
    </div>
  );
}
