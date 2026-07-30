'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  issuePortalCredentialsAction,
  reissuePortalPasswordAction,
  revokePortalAccessAction,
} from '@/features/clients/actions';
import { ConfirmSubmitButton } from '@/components/ui/confirm-submit-button';
import {
  initialPortalCredentialsState,
  initialRevokePortalAccessState,
  type PortalCredentialsState,
} from '@/features/clients/form-state';
import { type Locale } from '@/i18n/routing';

type PortalCredentialsCardProps = {
  locale: Locale;
  clientId: string;
  hasPortalAccess: boolean;
  /** Only meaningful when `hasPortalAccess` — the username the client already signs in with. */
  username: string | null;
  /** Server-computed suggestion, editable before the account is created. */
  suggestedUsername: string;
};

export function PortalCredentialsCard({
  locale,
  clientId,
  hasPortalAccess,
  username,
  suggestedUsername,
}: PortalCredentialsCardProps) {
  const t = useTranslations('clients');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('portal.title')}</CardTitle>
        <CardDescription>{hasPortalAccess ? t('portal.granted') : t('portal.none')}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {hasPortalAccess ? (
          <ExistingAccess locale={locale} clientId={clientId} username={username} />
        ) : (
          <IssueForm locale={locale} clientId={clientId} suggestedUsername={suggestedUsername} />
        )}
      </CardContent>
    </Card>
  );
}

function IssueForm({
  locale,
  clientId,
  suggestedUsername,
}: {
  locale: Locale;
  clientId: string;
  suggestedUsername: string;
}) {
  const t = useTranslations('clients');

  const [state, formAction] = useActionState(issuePortalCredentialsAction, initialPortalCredentialsState);

  if (state.status === 'issued') {
    return <IssuedCredentials username={state.username} temporaryPassword={state.temporaryPassword} />;
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="clientId" value={clientId} />

      <div className="space-y-2">
        <Label htmlFor="username">{t('portal.username')}</Label>
        <Input id="username" name="username" dir="ltr" required defaultValue={suggestedUsername} />
      </div>

      <CredentialsMessage state={state} />

      <Button type="submit">{t('portal.issue')}</Button>
    </form>
  );
}

function ExistingAccess({
  locale,
  clientId,
  username,
}: {
  locale: Locale;
  clientId: string;
  username: string | null;
}) {
  const t = useTranslations('clients');

  const [reissueState, reissueAction] = useActionState(
    reissuePortalPasswordAction,
    initialPortalCredentialsState,
  );
  const [revokeState, revokeAction] = useActionState(
    revokePortalAccessAction,
    initialRevokePortalAccessState,
  );

  if (reissueState.status === 'issued') {
    return <IssuedCredentials username={reissueState.username} temporaryPassword={reissueState.temporaryPassword} />;
  }

  return (
    <div className="space-y-4">
      {username ? (
        <p className="text-sm">
          <span className="text-muted-foreground">{t('portal.username')}: </span>
          <span dir="ltr">{username}</span>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <form action={reissueAction}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="clientId" value={clientId} />
          <ConfirmSubmitButton
            label={t('portal.reissue')}
            confirmMessage={t('portal.confirmReissue')}
            variant="outline"
          />
        </form>

        <form action={revokeAction}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="clientId" value={clientId} />
          {/* Revoking ends their session immediately, so it asks first. */}
          <ConfirmSubmitButton
            label={t('portal.revoke')}
            confirmMessage={t('portal.confirmRevoke')}
            variant="destructive"
          />
        </form>
      </div>

      <CredentialsMessage state={reissueState} />

      {revokeState.status !== 'idle' ? (
        <p
          role="status"
          className={
            revokeState.status === 'error' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'
          }
        >
          {t(revokeState.messageKey)}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Shown exactly once, right after issuing or re-issuing: the plaintext
 * temporary password never comes back from the server again after this
 * render, because nothing stores it in plaintext.
 */
function IssuedCredentials({ username, temporaryPassword }: { username: string; temporaryPassword: string }) {
  const t = useTranslations('clients');

  return (
    <div className="space-y-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-4 text-start">
      <p className="text-sm font-medium text-amber-700 dark:text-amber-400">{t('portal.showOnce')}</p>

      <dl className="space-y-1 text-sm">
        <div className="flex flex-wrap gap-2">
          <dt className="text-muted-foreground">{t('portal.username')}:</dt>
          <dd dir="ltr" className="font-mono">
            {username}
          </dd>
        </div>
        <div className="flex flex-wrap gap-2">
          <dt className="text-muted-foreground">{t('portal.temporaryPassword')}:</dt>
          <dd dir="ltr" className="font-mono">
            {temporaryPassword}
          </dd>
        </div>
      </dl>

      <p className="text-sm text-muted-foreground">{t('portal.handOver')}</p>
    </div>
  );
}

function CredentialsMessage({ state }: { state: PortalCredentialsState }) {
  const t = useTranslations('clients');
  if (state.status !== 'error') return null;

  return (
    <p role="status" className="text-sm text-destructive">
      {t(state.messageKey)}
    </p>
  );
}
