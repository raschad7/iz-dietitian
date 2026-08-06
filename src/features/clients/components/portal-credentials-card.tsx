'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Card, CardContent, CardDivider, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmSubmitButton } from '@/components/ui/confirm-submit-button';
import { CopyButton } from '@/components/ui/copy-button';
import { Field, FieldHint } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  issuePortalCredentialsAction,
  reissuePortalPasswordAction,
  revokePortalAccessAction,
} from '@/features/clients/actions';
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
  /**
   * Whether issuing will actually reach this client over WhatsApp: the clinic
   * has a live connection *and* the client has a phone number.
   *
   * It no longer gates the send — that is automatic now — only the notice
   * promising it. False renders nothing rather than telling the dietitian a
   * message is on its way that the gateway will skip.
   */
  canSendWhatsapp: boolean;
};

/**
 * Issuing, reissuing and revoking a client's sign-in.
 *
 * **State first, then the controls.** The card used to open with a title and a
 * sentence and leave you to infer the rest; whether this person can sign in at
 * all is the question the tab exists to answer, so it is a badge in the header
 * now, and the username sits under it as a value you can copy rather than one
 * you select by hand.
 *
 * Everything here that was hand-rolled is shared furniture now: `Field` wraps
 * the label and its input (which is what drives the label's focus shift and
 * gives `FieldError` somewhere to live), the notice and the one-time credentials
 * are `Callout`, and the confirmations are the design system's dialog rather
 * than `window.confirm()` — see `ConfirmSubmitButton`.
 */
export function PortalCredentialsCard({
  locale,
  clientId,
  hasPortalAccess,
  username,
  suggestedUsername,
  canSendWhatsapp,
}: PortalCredentialsCardProps) {
  const t = useTranslations('clients');

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle icon="security" size="sm">
          {t('portal.title')}
        </CardTitle>
        <Badge variant={hasPortalAccess ? 'onTrack' : 'muted'}>
          {hasPortalAccess ? <Icon name="check" /> : null}
          {hasPortalAccess ? t('portal.stateActive') : t('portal.stateNone')}
        </Badge>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <p className="text-body-sm text-muted-foreground">
          {hasPortalAccess ? t('portal.granted') : t('portal.none')}
        </p>

        {hasPortalAccess ? (
          <ExistingAccess
            locale={locale}
            clientId={clientId}
            username={username}
            canSendWhatsapp={canSendWhatsapp}
          />
        ) : (
          <IssueForm
            locale={locale}
            clientId={clientId}
            suggestedUsername={suggestedUsername}
            canSendWhatsapp={canSendWhatsapp}
          />
        )}
      </CardContent>
    </Card>
  );
}

function IssueForm({
  locale,
  clientId,
  suggestedUsername,
  canSendWhatsapp,
}: {
  locale: Locale;
  clientId: string;
  suggestedUsername: string;
  canSendWhatsapp: boolean;
}) {
  const t = useTranslations('clients');

  const [state, formAction] = useActionState(issuePortalCredentialsAction, initialPortalCredentialsState);

  if (state.status === 'issued') {
    return (
      <IssuedCredentials
        username={state.username}
        temporaryPassword={state.temporaryPassword}
        whatsapp={state.whatsapp}
      />
    );
  }

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="clientId" value={clientId} />

      <Field>
        <Label htmlFor="username">{t('portal.username')}</Label>
        <Input id="username" name="username" dir="ltr" required defaultValue={suggestedUsername} />
        <FieldHint>{t('portal.usernameHint')}</FieldHint>
      </Field>

      {canSendWhatsapp ? <WhatsappNotice /> : null}

      <CredentialsMessage state={state} />

      <Button type="submit" className="self-start">
        <Icon name="lock" />
        {t('portal.issue')}
      </Button>
    </form>
  );
}

function ExistingAccess({
  locale,
  clientId,
  username,
  canSendWhatsapp,
}: {
  locale: Locale;
  clientId: string;
  username: string | null;
  canSendWhatsapp: boolean;
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
    return (
      <IssuedCredentials
        username={reissueState.username}
        temporaryPassword={reissueState.temporaryPassword}
        whatsapp={reissueState.whatsapp}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {username ? (
        <Secret label={t('portal.username')} value={username} copyLabel={t('copy.username')} />
      ) : null}

      {canSendWhatsapp ? <WhatsappNotice /> : null}

      <CredentialsMessage state={reissueState} />

      {revokeState.status !== 'idle' ? (
        <p
          role="status"
          className={
            revokeState.status === 'error'
              ? 'text-body-sm text-destructive'
              : 'text-body-sm text-muted-foreground'
          }
        >
          {t(revokeState.messageKey)}
        </p>
      ) : null}

      <CardDivider className="ms-0" />

      {/*
        Reissue is `neutral` and revoke is `destructiveGhost`: neither is *the*
        action on this card — the card is a state you read — and the design
        system reserves the outlined destructive box for a decision being closed,
        which is what the confirm dialog's own button carries.
      */}
      <div className="flex flex-wrap items-center gap-3">
        <form action={reissueAction} className="flex">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="clientId" value={clientId} />
          <ConfirmSubmitButton
            label={t('portal.reissue')}
            confirmTitle={t('portal.confirmReissueTitle')}
            confirmMessage={t('portal.confirmReissue')}
            variant="neutral"
            size="sm"
            icon="refresh"
          />
        </form>

        <form action={revokeAction} className="flex">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="clientId" value={clientId} />
          {/* Revoking ends their session immediately, so it asks first. */}
          <ConfirmSubmitButton
            label={t('portal.revoke')}
            confirmTitle={t('portal.confirmRevokeTitle')}
            confirmMessage={t('portal.confirmRevoke')}
            variant="destructiveGhost"
            size="sm"
            icon="close"
          />
        </form>
      </div>
    </div>
  );
}

/**
 * What will happen when the button below is pressed.
 *
 * This replaced an unchecked opt-in checkbox when the send became automatic. A
 * notice rather than nothing, because the message carries a password to a phone
 * the dietitian is not holding: something that always happens still has to be
 * something they knew was going to happen, and the moment to say so is before
 * the button, not in the result afterwards.
 *
 * Rendered only when the send can actually work — a live WhatsApp session and a
 * phone number on this client. Where it cannot, the card promises nothing and
 * the credentials are handed over on screen.
 */
function WhatsappNotice() {
  const t = useTranslations('clients');

  return <Callout icon="whatsapp">{t('portal.willSendWhatsapp')}</Callout>;
}

/**
 * Shown exactly once, right after issuing or re-issuing: the plaintext
 * temporary password never comes back from the server again after this
 * render, because nothing stores it in plaintext.
 *
 * Which is exactly why both values carry a copy button. "Select this carefully
 * before you navigate away" is a poor thing to ask about the one value on the
 * screen that cannot be recovered.
 */
function IssuedCredentials({
  username,
  temporaryPassword,
  whatsapp,
}: {
  username: string;
  temporaryPassword: string;
  whatsapp?: 'sent' | 'skipped' | 'failed';
}) {
  const t = useTranslations('clients');

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <Callout tone="attention" title={t('portal.showOnce')}>
        {t('portal.handOver')}
      </Callout>

      <div className="flex flex-col gap-2">
        <Secret label={t('portal.username')} value={username} copyLabel={t('copy.username')} />
        <Secret
          label={t('portal.temporaryPassword')}
          value={temporaryPassword}
          copyLabel={t('copy.password')}
        />
      </div>

      {/*
        A failed or skipped send is not an error about the account — the password
        above is real either way — so it reads as information, not as a failure.
      */}
      {whatsapp ? (
        <p
          role="status"
          className={
            whatsapp === 'sent'
              ? 'text-body-sm text-muted-foreground'
              : 'text-body-sm text-destructive'
          }
        >
          {t(`portal.whatsapp.${whatsapp}`)}
        </p>
      ) : null}
    </div>
  );
}

/** A credential: what it is, the value in mono, and one click to copy it. */
function Secret({
  label,
  value,
  copyLabel,
}: {
  label: string;
  value: string;
  copyLabel: string;
}) {
  const t = useTranslations('clients');

  return (
    <div className="flex items-center gap-3 rounded-md bg-muted px-4 py-2.5">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-caption text-muted-foreground">{label}</span>
        <span className="truncate font-mono text-body-md" dir="ltr">
          {value}
        </span>
      </span>
      <CopyButton value={value} label={copyLabel} copiedLabel={t('copy.copied')} />
    </div>
  );
}

function CredentialsMessage({ state }: { state: PortalCredentialsState }) {
  const t = useTranslations('clients');
  if (state.status !== 'error') return null;

  return (
    <p role="status" className="text-body-sm text-destructive">
      {t(state.messageKey)}
    </p>
  );
}
