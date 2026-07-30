'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmSubmitButton } from '@/components/ui/confirm-submit-button';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { formatDateTime } from '@/lib/format';
import { type Locale } from '@/i18n/routing';

import {
  connectWhatsappAction,
  disconnectWhatsappAction,
  refreshWhatsappStatusAction,
  saveAutomationSettingsAction,
} from '../actions';
import {
  initialAutomationState,
  initialConnectionState,
  type AutomationActionState,
  type ConnectionActionState,
} from '../form-state';
import { REMINDER_LEAD_OPTIONS } from '../schema';
import { type ConnectionView, type MessageLogEntry } from '../types';

/**
 * The WhatsApp settings page.
 *
 * A client component for one reason: **the QR code expires.** The gateway rotates
 * it every few seconds and the pairing status changes without any user action, so
 * the page has to keep asking. It polls `refreshWhatsappStatusAction` while the
 * connection is mid-flight and stops the moment it settles — a connected clinic
 * makes no requests at all.
 *
 * The initial view is rendered from the database by the server (`readConnection`),
 * so the page paints instantly even when the gateway is down; the first poll
 * arrives a second later with the truth.
 */

/** Statuses where something is still happening and the page should keep asking. */
const PENDING_STATUSES = new Set(['created', 'initializing', 'qr_ready', 'authenticating']);

/**
 * Fast enough that an expired QR is replaced before the user finishes squinting
 * at it, slow enough not to hammer a gateway that is booting Chromium.
 */
const POLL_INTERVAL_MS = 4_000;

type WhatsappSettingsProps = {
  locale: Locale;
  connection: ConnectionView;
  messages: readonly MessageLogEntry[];
};

export function WhatsappSettings({ locale, connection: initialConnection, messages }: WhatsappSettingsProps) {
  const t = useTranslations('whatsapp');
  const router = useRouter();

  /**
   * Two sources for one view: what the server rendered, and what the last poll
   * returned. The poll wins until the server sends a newer one — which happens
   * when the route revalidates after connect, disconnect or a settings save.
   *
   * The reset is done during render, not in an effect: adjusting state when a prop
   * changes is what React documents for exactly this case, and an effect would
   * paint the stale value first.
   */
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

        // Pairing just finished. Re-fetch the server components so the message
        // log and the automation form see the new state too.
        if (next.status === 'ready') router.refresh();
      });
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [connection.enabled, locale, pending, router]);

  if (!connection.enabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('disabled')}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <ConnectionCard locale={locale} connection={connection} onRefresh={setPolled} />
      <AutomationCard locale={locale} connection={connection} />
      <MessageLog messages={messages} locale={locale} />
    </div>
  );
}

function ConnectionCard({
  locale,
  connection,
  onRefresh,
}: {
  locale: Locale;
  connection: ConnectionView;
  onRefresh: (view: ConnectionView) => void;
}) {
  const t = useTranslations('whatsapp');

  const [connectState, connectAction] = useActionState(connectWhatsappAction, initialConnectionState);
  const [disconnectState, disconnectAction] = useActionState(disconnectWhatsappAction, initialConnectionState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('connection.title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <span className="text-muted-foreground">{t('connection.statusLabel')}</span>
          <StatusBadge status={connection.status} />

          {connection.phone ? (
            <span className="text-muted-foreground">
              {t('connection.phoneLabel')}: <span dir="ltr">+{connection.phone}</span>
            </span>
          ) : null}
        </div>

        {!connection.gatewayReachable ? <Notice tone="error">{t('gatewayUnreachable')}</Notice> : null}

        {connection.lastError ? <Notice tone="error">{connection.lastError}</Notice> : null}

        <ActionNotice state={connectState} />
        <ActionNotice state={disconnectState} />

        {connection.status === 'qr_ready' ? (
          <QrPanel qrCode={connection.qrCode} />
        ) : PENDING_STATUSES.has(connection.status) ? (
          <p className="text-sm text-muted-foreground">{t('connection.waiting')}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <form action={connectAction}>
            <input type="hidden" name="locale" value={locale} />
            <ConfirmSubmitButton
              label={connection.linked ? t('connection.reconnect') : t('connection.connect')}
              variant={connection.linked ? 'outline' : 'default'}
            />
          </form>

          {connection.linked ? (
            <form action={disconnectAction}>
              <input type="hidden" name="locale" value={locale} />
              <ConfirmSubmitButton
                label={t('connection.disconnect')}
                confirmMessage={t('connection.disconnectConfirm')}
                variant="destructive"
              />
            </form>
          ) : null}

          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              void refreshWhatsappStatusAction(locale).then(onRefresh);
            }}
          >
            {t('connection.refresh')}
          </Button>
        </div>

        <FreshnessLine connection={connection} locale={locale} />
      </CardContent>
    </Card>
  );
}

/**
 * The QR itself. `qrCode` is a data URL the gateway rendered, so there is no
 * remote image and no QR library in this bundle.
 */
function QrPanel({ qrCode }: { qrCode: string | null }) {
  const t = useTranslations('whatsapp');

  return (
    <div className="space-y-2 rounded-lg border border-border p-4">
      <p className="text-sm font-medium">{t('connection.qrTitle')}</p>
      <p className="text-sm text-muted-foreground">{t('connection.qrHelp')}</p>

      {qrCode ? (
        /*
          `unoptimized`, because the source is a data URL the gateway already
          rendered: there is nothing for the image optimiser to fetch or resize,
          and routing it through /_next/image would only add a hop. Kept on a white
          background regardless of theme — a dark-mode QR does not scan.
        */
        <Image
          src={qrCode}
          alt={t('connection.qrTitle')}
          width={240}
          height={240}
          unoptimized
          className="rounded-md bg-white p-2"
        />
      ) : (
        <p className="text-sm text-muted-foreground">{t('connection.waiting')}</p>
      )}
    </div>
  );
}

function AutomationCard({ locale, connection }: { locale: Locale; connection: ConnectionView }) {
  const t = useTranslations('whatsapp');

  const [state, formAction] = useActionState(saveAutomationSettingsAction, initialAutomationState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('automation.title')}</CardTitle>
        <CardDescription>{connection.linked ? t('automation.remindersHelp') : t('connection.notLinked')}</CardDescription>
      </CardHeader>

      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="locale" value={locale} />

          <Toggle
            name="remindersEnabled"
            label={t('automation.reminders')}
            help={t('automation.remindersHelp')}
            defaultChecked={connection.remindersEnabled}
          />

          <Toggle
            name="confirmationsEnabled"
            label={t('automation.confirmations')}
            help={t('automation.confirmationsHelp')}
            defaultChecked={connection.confirmationsEnabled}
          />

          <div className="max-w-xs space-y-2">
            <Label htmlFor="reminderLeadMinutes">{t('automation.lead')}</Label>
            <SelectField
              id="reminderLeadMinutes"
              name="reminderLeadMinutes"
              defaultValue={String(connection.reminderLeadMinutes)}
            >
              {REMINDER_LEAD_OPTIONS.map((option) => (
                <option key={option.minutes} value={option.minutes}>
                  {t(`automation.leadOptions.${option.key}`)}
                </option>
              ))}
            </SelectField>
          </div>

          <AutomationNotice state={state} />

          <ConfirmSubmitButton label={t('automation.save')} variant="default" />
        </form>
      </CardContent>
    </Card>
  );
}

function Toggle({
  name,
  label,
  help,
  defaultChecked,
}: {
  name: string;
  label: string;
  help: string;
  defaultChecked: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={name}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="mt-1 size-4 rounded border-input accent-primary"
      />
      <div className="space-y-1">
        <Label htmlFor={name}>{label}</Label>
        <p className="text-sm text-muted-foreground">{help}</p>
      </div>
    </div>
  );
}

function MessageLog({ messages, locale }: { messages: readonly MessageLogEntry[]; locale: Locale }) {
  const t = useTranslations('whatsapp');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('log.title')}</CardTitle>
      </CardHeader>

      <CardContent>
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('log.empty')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {messages.map((message) => (
              <li key={message.id} className="space-y-1 py-3 text-start first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant={message.direction === 'inbound' ? 'outline' : 'default'}>
                    {t(`log.direction.${message.direction}`)}
                  </Badge>
                  <span>{t(`log.kind.${message.kind}`)}</span>
                  <span>·</span>
                  <span>{t(`log.status.${message.status}`)}</span>
                  <span>·</span>
                  <span>{formatDateTime(locale, message.createdAt)}</span>
                </div>

                <p className="text-sm font-medium">
                  {message.clientName ?? t('log.unknownClient')}{' '}
                  <span className="font-normal text-muted-foreground" dir="ltr">
                    +{message.phone}
                  </span>
                </p>

                {/* `whitespace-pre-line`: the templates are written with real line breaks. */}
                <p className="whitespace-pre-line text-sm text-muted-foreground">{message.body}</p>

                {message.error ? <p className="text-sm text-destructive">{message.error}</p> : null}
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

  const variant = status === 'ready' ? 'default' : status === 'failed' || status === 'action_required' ? 'outline' : 'muted';

  return <Badge variant={variant}>{t(`status.${status}`)}</Badge>;
}

function FreshnessLine({ connection, locale }: { connection: ConnectionView; locale: Locale }) {
  const t = useTranslations('whatsapp');

  if (connection.status === 'ready' && connection.connectedAt) {
    return (
      <p className="text-xs text-muted-foreground">
        {t('connection.connectedAt', { when: formatDateTime(locale, connection.connectedAt) })}
      </p>
    );
  }

  if (!connection.syncedAt) return null;

  return (
    <p className="text-xs text-muted-foreground">
      {t('connection.syncedAt', { when: formatDateTime(locale, connection.syncedAt) })}
    </p>
  );
}

function Notice({ tone, children }: { tone: 'error' | 'success'; children: ReactNode }) {
  return (
    <p className={tone === 'error' ? 'text-sm text-destructive' : 'text-sm text-primary'}>{children}</p>
  );
}

function ActionNotice({ state }: { state: ConnectionActionState }) {
  const t = useTranslations('whatsapp');

  if (state.status === 'idle') return null;

  return <Notice tone={state.status === 'error' ? 'error' : 'success'}>{t(state.messageKey)}</Notice>;
}

function AutomationNotice({ state }: { state: AutomationActionState }) {
  const t = useTranslations('whatsapp');

  if (state.status === 'idle') return null;

  return <Notice tone={state.status === 'error' ? 'error' : 'success'}>{t(state.messageKey)}</Notice>;
}
