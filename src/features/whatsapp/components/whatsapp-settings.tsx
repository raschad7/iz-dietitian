'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { ConfirmSubmitButton } from '@/components/ui/confirm-submit-button';
import { Icon } from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import {
  SettingsEmptyValue,
  SettingsRow,
  SettingsSection,
} from '@/features/settings/components/settings-section';
import { formatDateTime } from '@/lib/format';
import type { Locale } from '@/i18n/routing';

import { connectWhatsappAction, disconnectWhatsappAction, refreshWhatsappStatusAction, saveAutomationSettingsAction } from '../actions';
import { initialAutomationState, initialConnectionState, type AutomationActionState, type ConnectionActionState } from '../form-state';
import type { AutomationSettingsInput } from '../schema';
import type { ConnectionView } from '../types';

const PENDING_STATUSES = new Set(['created', 'initializing', 'qr_ready', 'authenticating']);
const POLL_INTERVAL_MS = 4_000;

export function WhatsappSettings({ locale, connection: initialConnection }: {
  locale: Locale;
  connection: ConnectionView;
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
    return <Callout icon="whatsapp">{t('disabled')}</Callout>;
  }

  return (
    <div className="flex flex-col">
      <ConnectionSection locale={locale} connection={connection} onRefresh={setPolled} />
      <AutomationSection locale={locale} connection={connection} />
    </div>
  );
}

function ConnectionSection({ locale, connection, onRefresh }: {
  locale: Locale;
  connection: ConnectionView;
  onRefresh: (view: ConnectionView) => void;
}) {
  const t = useTranslations('whatsapp');
  const [connectState, connectAction] = useActionState(connectWhatsappAction, initialConnectionState);
  const [disconnectState, disconnectAction] = useActionState(disconnectWhatsappAction, initialConnectionState);

  return (
    <SettingsSection
      title={t('connection.title')}
      icon="whatsapp"
      action={
        <Button type="button" variant="neutral" size="sm" onClick={() => { void refreshWhatsappStatusAction(locale).then(onRefresh); }}>
          <Icon name="refresh" />
          {t('connection.refresh')}
        </Button>
      }
    >
      <SettingsRow
        label={t('connection.statusLabel')}
        value={<StatusBadge status={connection.status} />}
        description={<FreshnessText connection={connection} locale={locale} />}
        action={
          <div className="flex flex-wrap gap-3">
            <form action={connectAction}>
              <input type="hidden" name="locale" value={locale} />
              <ConfirmSubmitButton
                label={connection.linked ? t('connection.reconnect') : t('connection.connect')}
                variant={connection.linked ? 'neutral' : 'default'}
              />
            </form>
            {connection.linked ? (
              <form action={disconnectAction}>
                <input type="hidden" name="locale" value={locale} />
                <ConfirmSubmitButton
                  label={t('connection.disconnect')}
                  confirmMessage={t('connection.disconnectConfirm')}
                  variant="destructiveGhost"
                />
              </form>
            ) : null}
          </div>
        }
      />

      <SettingsRow
        label={t('connection.phoneLabel')}
        isolate
        value={connection.phone ? `+${connection.phone}` : <SettingsEmptyValue label={t('connection.notLinked')} />}
      />

      {/*
        Everything that is only true sometimes — a QR to scan, a gateway that is
        down, the result of the last action. Each is its own row so none of them
        shifts the two above when it appears.
      */}
      {!connection.gatewayReachable || connection.lastError || connectState.status !== 'idle'
        || disconnectState.status !== 'idle' || PENDING_STATUSES.has(connection.status) ? (
        <div className="flex flex-col gap-3 py-4">
          {!connection.gatewayReachable ? <Callout tone="attention">{t('gatewayUnreachable')}</Callout> : null}
          {connection.lastError ? <Callout tone="attention">{connection.lastError}</Callout> : null}
          <ActionNotice state={connectState} />
          <ActionNotice state={disconnectState} />

          {connection.status === 'qr_ready' ? (
            <QrPanel qrCode={connection.qrCode} />
          ) : PENDING_STATUSES.has(connection.status) ? (
            <Callout icon="clock">{t('connection.waiting')}</Callout>
          ) : null}
        </div>
      ) : null}
    </SettingsSection>
  );
}

function QrPanel({ qrCode }: { qrCode: string | null }) {
  const t = useTranslations('whatsapp');
  return (
    <div className="grid gap-4 rounded-lg bg-muted p-4 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="flex flex-col gap-1">
        <p className="font-semibold">{t('connection.qrTitle')}</p>
        <p className="text-body-sm text-muted-foreground">{t('connection.qrHelp')}</p>
      </div>
      {qrCode ? (
        <Image src={qrCode} alt={t('connection.qrTitle')} width={200} height={200} unoptimized className="rounded-md bg-[var(--n-0)] p-2" />
      ) : (
        <p className="text-body-sm text-muted-foreground">{t('connection.waiting')}</p>
      )}
    </div>
  );
}

/**
 * Every automatic message the clinic can turn on or off, in the order the
 * appointment they follow happens: the one that goes out before it, the one
 * that goes out when it is made or moved, and the one that goes out when it is
 * deleted.
 *
 * One table rather than three hand-written rows. It is what the section maps
 * over and what each switch reads to know which *other* values it has to carry
 * — see `AutomationToggle` — so adding a fourth message is an entry here and a
 * pair of strings in the catalogues.
 *
 * ⚠ The names are the form field names *and* the columns behind them: they are
 * what `automationSettingsSchema` parses and what `updateAutomationSettings`
 * writes. A typo here is a switch that posts a value nothing reads, which shows
 * up as a toggle that silently springs back.
 */
const AUTOMATIONS = [
  { name: 'remindersEnabled', label: 'automation.reminders', help: 'automation.remindersHelp' },
  {
    name: 'confirmationsEnabled',
    label: 'automation.confirmations',
    help: 'automation.confirmationsHelp',
  },
  {
    name: 'reschedulesEnabled',
    label: 'automation.reschedules',
    help: 'automation.reschedulesHelp',
  },
  {
    name: 'cancellationsEnabled',
    label: 'automation.cancellations',
    help: 'automation.cancellationsHelp',
  },
  {
    name: 'paymentRemindersEnabled',
    label: 'automation.paymentReminders',
    help: 'automation.paymentRemindersHelp',
  },
] as const satisfies readonly {
  name: keyof AutomationSettingsInput;
  label: string;
  help: string;
}[];

type AutomationName = (typeof AUTOMATIONS)[number]['name'];

/**
 * The three automations, as switches that save themselves.
 *
 * They were `Checkbox`es behind a Save button, while the clinic's weekly
 * schedule expressed the same on/off meaning with `Switch` two tabs away. One
 * of the two had to be wrong: a checkbox is for *selecting* something inside a
 * form you then submit, and these are settings you turn on.
 *
 * The Save went with the change. A switch that needs confirming is a switch
 * that lies about what it did — the control already shows the new state, so
 * asking for a second press to make it true is the interface disagreeing with
 * itself. Each toggle posts its own form on change.
 */
function AutomationSection({ locale, connection }: { locale: Locale; connection: ConnectionView }) {
  const t = useTranslations('whatsapp');
  const [state, formAction] = useActionState(saveAutomationSettingsAction, initialAutomationState);

  return (
    <SettingsSection title={t('automation.title')} description={connection.linked ? t('automation.remindersHelp') : t('connection.notLinked')} icon="notifications">
      {/*
        The stored state of all three, so each switch can post the two it did
        not move — see `AutomationToggle`. Built once here rather than spelled
        out per row, which is what stopped scaling the day there were three.
      */}
      {AUTOMATIONS.map(({ name, label, help }) => (
        <AutomationToggle
          key={name}
          locale={locale}
          formAction={formAction}
          name={name}
          label={t(label)}
          help={t(help)}
          values={{
            remindersEnabled: connection.remindersEnabled,
            confirmationsEnabled: connection.confirmationsEnabled,
            reschedulesEnabled: connection.reschedulesEnabled,
            cancellationsEnabled: connection.cancellationsEnabled,
            paymentRemindersEnabled: connection.paymentRemindersEnabled,
          }}
        />
      ))}
      <div className="flex flex-col gap-2 py-4">
        <p className="text-caption text-muted-foreground">{t('automation.leadFixed')}</p>
        <AutomationNotice state={state} />
      </div>
    </SettingsSection>
  );
}

/**
 * One switch, posting every value.
 *
 * The action writes the whole automation record, so a form carrying only the
 * switch that moved would clear the others. They all ride along as hidden
 * inputs — which is also why this switch's own value is hidden rather than
 * named on the control: `Switch` renders a `<button>`, and a button posts
 * nothing unless it is the control that submitted the form.
 *
 * It takes the whole set rather than a named sibling, which is what the second
 * switch could get away with and the third could not: with three, "the other
 * one" is two, and a row that has to be told which is a row that goes stale the
 * next time one is added.
 */
function AutomationToggle({ locale, formAction, name, label, help, values }: {
  locale: Locale;
  formAction: (data: FormData) => void;
  name: AutomationName;
  label: string;
  help: string;
  /** What is stored for every switch, this one included. */
  values: Record<AutomationName, boolean>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const checked = values[name];

  return (
    <form ref={formRef} action={formAction}>
      <input type="hidden" name="locale" value={locale} />
      {/* Every switch but this one, at its stored value. */}
      {AUTOMATIONS.filter((automation) => automation.name !== name).map((automation) => (
        <input
          key={automation.name}
          type="hidden"
          name={automation.name}
          value={values[automation.name] ? 'on' : 'off'}
        />
      ))}
      {/* The value this press is asking for — the opposite of what is stored. */}
      <input type="hidden" name={name} value={checked ? 'off' : 'on'} />

      <SettingsRow
        label={label}
        value={help}
        action={
          <Switch
            id={name}
            checked={checked}
            aria-label={label}
            /*
              `requestSubmit()` rather than `type="submit"` on the control.
              `Switch` sets `type="button"` itself and only spreads props
              afterwards, so a `type` passed in wins purely by spread order —
              a silent break the day someone reorders that component. Asking
              the form to submit says the same thing and depends on nothing.

              `requestSubmit` and not `submit`: the latter fires no submit
              event, so React never sees it and the action never runs.

              The switch draws the *stored* state, so it only moves once the
              server has agreed — a toggle that flips optimistically and then
              reverts is worse than one that waits.
            */
            onClick={() => formRef.current?.requestSubmit()}
          />
        }
      />
    </form>
  );
}

function StatusBadge({ status }: { status: ConnectionView['status'] }) {
  const t = useTranslations('whatsapp');
  const variant = status === 'ready' ? 'onTrack' : status === 'failed' || status === 'action_required' ? 'attention' : 'muted';
  return <Badge variant={variant}>{t(`status.${status}`)}</Badge>;
}

function FreshnessText({ connection, locale }: { connection: ConnectionView; locale: Locale }) {
  const t = useTranslations('whatsapp');
  const date = connection.status === 'ready' ? connection.connectedAt : connection.syncedAt;
  if (!date) return null;
  return (
    <>
      {connection.status === 'ready'
        ? t('connection.connectedAt', { when: formatDateTime(locale, date) })
        : t('connection.syncedAt', { when: formatDateTime(locale, date) })}
    </>
  );
}

function ActionNotice({ state }: { state: ConnectionActionState }) {
  const t = useTranslations('whatsapp');
  if (state.status === 'idle') return null;
  return (
    <Callout role="status" tone={state.status === 'error' ? 'attention' : 'neutral'} icon={state.status === 'error' ? undefined : 'check'}>
      {t(state.messageKey)}
    </Callout>
  );
}

function AutomationNotice({ state }: { state: AutomationActionState }) {
  const t = useTranslations('whatsapp');
  if (state.status === 'idle') return null;
  return (
    <Callout role="status" tone={state.status === 'error' ? 'attention' : 'neutral'} icon={state.status === 'error' ? undefined : 'check'}>
      {t(state.messageKey)}
    </Callout>
  );
}
