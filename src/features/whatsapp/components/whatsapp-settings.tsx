'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmSubmitButton } from '@/components/ui/confirm-submit-button';
import { Icon } from '@/components/ui/icon';
import { Label } from '@/components/ui/label';
import { formatDateTime } from '@/lib/format';
import type { Locale } from '@/i18n/routing';

import { connectWhatsappAction, disconnectWhatsappAction, refreshWhatsappStatusAction, saveAutomationSettingsAction } from '../actions';
import { initialAutomationState, initialConnectionState, type AutomationActionState, type ConnectionActionState } from '../form-state';
import type { ConnectionView, MessageLogEntry } from '../types';

const PENDING_STATUSES = new Set(['created', 'initializing', 'qr_ready', 'authenticating']);
const POLL_INTERVAL_MS = 4_000;

export function WhatsappSettings({ locale, connection: initialConnection, messages }: {
  locale: Locale;
  connection: ConnectionView;
  messages: readonly MessageLogEntry[];
}) {
  const t = useTranslations('whatsapp');
  const router = useRouter();
  const [polled, setPolled] = useState<ConnectionView | null>(null);
  const [renderedFromServer, setRenderedFromServer] = useState(initialConnection);

  if (renderedFromServer !== initialConnection) {
    setRenderedFromServer(initialConnection);
    setPolled(null);
  }

  const connection = polled ?? initialConnection;
  const pending = PENDING_STATUSES.has(connection.status);

  useEffect(() => {
    if (!connection.enabled || !pending) return;
    let cancelled = false;
    const timer = setInterval(() => {
      void refreshWhatsappStatusAction(locale).then((next) => {
        if (cancelled) return;
        setPolled(next);
        if (next.status === 'ready') router.refresh();
      });
    }, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [connection.enabled, locale, pending, router]);

  if (!connection.enabled) {
    return (
      <Card variant="empty">
        <CardHeader>
          <CardTitle icon="whatsapp">{t('title')}</CardTitle>
          <CardDescription>{t('disabled')}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <ConnectionCard locale={locale} connection={connection} onRefresh={setPolled} />
      <AutomationCard locale={locale} connection={connection} />
      <MessageLog messages={messages} locale={locale} />
    </div>
  );
}

function ConnectionCard({ locale, connection, onRefresh }: {
  locale: Locale;
  connection: ConnectionView;
  onRefresh: (view: ConnectionView) => void;
}) {
  const t = useTranslations('whatsapp');
  const [connectState, connectAction] = useActionState(connectWhatsappAction, initialConnectionState);
  const [disconnectState, disconnectAction] = useActionState(disconnectWhatsappAction, initialConnectionState);

  return (
    <Card className={connection.status === 'ready' ? 'bg-primary-subtle ring-primary/20' : undefined}>
      <CardHeader>
        <CardTitle as="h3" icon="whatsapp">{t('connection.title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
        <CardAction><StatusBadge status={connection.status} /></CardAction>
      </CardHeader>

      <CardContent className="space-y-4">
        {connection.phone ? (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-caption text-muted-foreground">{t('connection.phoneLabel')}</span>
            <span className="text-body-md font-semibold" dir="ltr">+{connection.phone}</span>
          </div>
        ) : null}

        {!connection.gatewayReachable ? <Callout tone="attention">{t('gatewayUnreachable')}</Callout> : null}
        {connection.lastError ? <Callout tone="attention">{connection.lastError}</Callout> : null}
        <ActionNotice state={connectState} />
        <ActionNotice state={disconnectState} />

        {connection.status === 'qr_ready' ? (
          <QrPanel qrCode={connection.qrCode} />
        ) : PENDING_STATUSES.has(connection.status) ? (
          <Callout icon="clock">{t('connection.waiting')}</Callout>
        ) : null}

        <FreshnessLine connection={connection} locale={locale} />
      </CardContent>

      <CardFooter className="flex-wrap justify-end">
        <Button type="button" variant="ghost" onClick={() => { void refreshWhatsappStatusAction(locale).then(onRefresh); }}>
          <Icon name="refresh" />{t('connection.refresh')}
        </Button>
        <form action={connectAction}>
          <input type="hidden" name="locale" value={locale} />
          <ConfirmSubmitButton label={connection.linked ? t('connection.reconnect') : t('connection.connect')} variant={connection.linked ? 'outline' : 'default'} />
        </form>
        {connection.linked ? (
          <form action={disconnectAction}>
            <input type="hidden" name="locale" value={locale} />
            <ConfirmSubmitButton label={t('connection.disconnect')} confirmMessage={t('connection.disconnectConfirm')} variant="destructiveGhost" />
          </form>
        ) : null}
      </CardFooter>
    </Card>
  );
}

function QrPanel({ qrCode }: { qrCode: string | null }) {
  const t = useTranslations('whatsapp');
  return (
    <div className="grid gap-4 rounded-lg bg-muted p-4 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="space-y-1"><p className="font-semibold">{t('connection.qrTitle')}</p><p className="text-body-sm text-muted-foreground">{t('connection.qrHelp')}</p></div>
      {qrCode ? <Image src={qrCode} alt={t('connection.qrTitle')} width={200} height={200} unoptimized className="rounded-md bg-[var(--n-0)] p-2" /> : <p className="text-body-sm text-muted-foreground">{t('connection.waiting')}</p>}
    </div>
  );
}

function AutomationCard({ locale, connection }: { locale: Locale; connection: ConnectionView }) {
  const t = useTranslations('whatsapp');
  const [state, formAction] = useActionState(saveAutomationSettingsAction, initialAutomationState);
  return (
    <form action={formAction}>
      <input type="hidden" name="locale" value={locale} />
      <Card>
        <CardHeader>
          <CardTitle as="h3" icon="notifications">{t('automation.title')}</CardTitle>
          <CardDescription>{connection.linked ? t('automation.remindersHelp') : t('connection.notLinked')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-0">
          <Toggle name="remindersEnabled" label={t('automation.reminders')} help={t('automation.remindersHelp')} defaultChecked={connection.remindersEnabled} />
          <Toggle name="confirmationsEnabled" label={t('automation.confirmations')} help={t('automation.confirmationsHelp')} defaultChecked={connection.confirmationsEnabled} />
          <p className="pt-3 text-caption text-muted-foreground">{t('automation.leadFixed')}</p>
          <AutomationNotice state={state} />
        </CardContent>
        <CardFooter className="justify-end"><ConfirmSubmitButton label={t('automation.save')} variant="default" /></CardFooter>
      </Card>
    </form>
  );
}

function Toggle({ name, label, help, defaultChecked }: { name: string; label: string; help: string; defaultChecked: boolean }) {
  return (
    <div className="flex min-h-20 items-center gap-3 border-b border-border py-3 last:border-b-0">
      <Checkbox id={name} name={name} defaultChecked={defaultChecked} />
      <div className="min-w-0"><Label htmlFor={name}>{label}</Label><p className="text-caption text-muted-foreground">{help}</p></div>
    </div>
  );
}

function MessageLog({ messages, locale }: { messages: readonly MessageLogEntry[]; locale: Locale }) {
  const t = useTranslations('whatsapp');
  return (
    <Card>
      <CardHeader><CardTitle as="h3" icon="whatsapp">{t('log.title')}</CardTitle></CardHeader>
      <CardContent>
        {messages.length === 0 ? (
          <div className="rounded-lg bg-muted p-4 text-body-sm text-muted-foreground">{t('log.empty')}</div>
        ) : (
          <ul className="divide-y divide-border">
            {messages.map((message) => (
              <li key={message.id} className="grid gap-2 py-4 first:pt-0 last:pb-0 sm:grid-cols-[1fr_auto]">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{message.clientName ?? t('log.unknownClient')}</p><Badge variant={message.direction === 'inbound' ? 'outline' : 'default'}>{t(`log.direction.${message.direction}`)}</Badge></div>
                  <p className="whitespace-pre-line text-body-sm text-muted-foreground">{message.body}</p>
                  {message.error ? <p className="text-caption text-destructive">{message.error}</p> : null}
                </div>
                <div className="text-caption text-muted-foreground sm:text-end"><p>{t(`log.status.${message.status}`)}</p><p>{formatDateTime(locale, message.createdAt)}</p></div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: ConnectionView['status'] }) {
  const t = useTranslations('whatsapp');
  const variant = status === 'ready' ? 'onTrack' : status === 'failed' || status === 'action_required' ? 'attention' : 'muted';
  return <Badge variant={variant}>{t(`status.${status}`)}</Badge>;
}

function FreshnessLine({ connection, locale }: { connection: ConnectionView; locale: Locale }) {
  const t = useTranslations('whatsapp');
  const date = connection.status === 'ready' ? connection.connectedAt : connection.syncedAt;
  if (!date) return null;
  return <p className="text-caption text-muted-foreground">{connection.status === 'ready' ? t('connection.connectedAt', { when: formatDateTime(locale, date) }) : t('connection.syncedAt', { when: formatDateTime(locale, date) })}</p>;
}

function ActionNotice({ state }: { state: ConnectionActionState }) {
  const t = useTranslations('whatsapp');
  if (state.status === 'idle') return null;
  return <Callout role="status" tone={state.status === 'error' ? 'attention' : 'neutral'} icon={state.status === 'error' ? undefined : 'check'}>{t(state.messageKey)}</Callout>;
}

function AutomationNotice({ state }: { state: AutomationActionState }) {
  const t = useTranslations('whatsapp');
  if (state.status === 'idle') return null;
  return <Callout className="mt-4" role="status" tone={state.status === 'error' ? 'attention' : 'neutral'} icon={state.status === 'error' ? undefined : 'check'}>{t(state.messageKey)}</Callout>;
}
