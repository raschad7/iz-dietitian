'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Icon, type IconName } from '@/components/ui/icon';
import { removePasskeyAction } from '@/features/auth/actions';
import { initialAuthState } from '@/features/auth/form-state';
import {
  SettingsEmptyValue,
  SettingsRow,
  SettingsSection,
} from '@/features/settings/components/settings-section';
import { type Locale } from '@/i18n/routing';
import { authClient } from '@/lib/auth-client';
import { formatDate } from '@/lib/format';

export type PasskeySummary = { id: string; name: string | null; createdAt: string };

/**
 * ## What changed
 *
 * Three copies of the same row lived here and in the WhatsApp panel: a
 * `min-h-20` grid holding a 40px circle, a title, a description and a control,
 * written out three times with three different column definitions. They are one
 * `SettingsRow` now.
 *
 * `min-h-20` went with them. Eighty pixels of box around a 13px title and a
 * 12px description is most of where this screen's empty space came from; a row
 * is as tall as what it holds.
 *
 * The two cards that framed those rows are gone for the reason recorded in
 * `settings-section.tsx`: on a page that is nothing but groups, a card's edge
 * separates a surface from things that are the same kind of thing as it.
 */
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

  /** Every way into this account. At one, removing it locks the account out. */
  const methodCount = providers.length + passkeys.length;

  async function addPasskey() {
    setAdding(true);
    await authClient.passkey.addPasskey();
    setAdding(false);
    window.location.reload();
  }

  return (
    <div className="flex flex-col">
      <SettingsSection
        title={t('passkeysTitle')}
        description={t('passkeysDescription')}
        icon="passkey"
        action={
          /*
            `neutral` rather than `outline`: `outline` draws its label in olive,
            which this system reserves for the one control that is *the* action.
            On a page of peer sections, four olive labels leave none of them
            reading as the thing to press.
          */
          <Button type="button" variant="neutral" size="sm" disabled={adding} onClick={addPasskey}>
            <Icon name="passkey" />
            {t('passkeyAdd')}
          </Button>
        }
      >
        {passkeys.length === 0 ? (
          <SettingsRow
            label={t('passkeysTitle')}
            value={<SettingsEmptyValue label={t('passkeysNone')} />}
            description={t('passkeysNone')}
          />
        ) : (
          passkeys.map((entry) => (
            <SettingsRow
              key={entry.id}
              label={ts('createdAt', { date: formatDate(locale, entry.createdAt) })}
              value={entry.name ?? t('passkeyUnnamed')}
              action={
                <form action={formAction}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="passkeyId" value={entry.id} />
                  {/*
                    The explanation goes on a wrapping element, never on the
                    button: `disabled:pointer-events-none` means a `title` on
                    the control itself can never be hovered.
                  */}
                  <span title={methodCount <= 1 ? t('lastSignInMethod') : undefined}>
                    <Button type="submit" variant="destructiveGhost" size="sm" disabled={methodCount <= 1}>
                      {t('passkeyRemove')}
                    </Button>
                  </span>
                </form>
              }
            />
          ))
        )}
      </SettingsSection>

      {state.status !== 'idle' ? (
        <Callout
          className="mt-4"
          role={state.status === 'error' ? 'alert' : 'status'}
          tone={state.status === 'error' ? 'attention' : 'neutral'}
          icon={state.status === 'success' ? 'check' : undefined}
        >
          {t(state.messageKey)}
        </Callout>
      ) : null}

      <SettingsSection title={t('methodsTitle')} description={ts('methodsDescription')} icon="lock">
        <MethodRow
          icon="lock"
          label={ts('passwordTitle')}
          description={hasPassword ? t('methodPasswordOn') : t('methodPasswordOff')}
          enabled={hasPassword}
          enabledLabel={ts('enabled')}
          disabledLabel={ts('notConnected')}
        />
        <MethodRow
          icon="email"
          label="Google"
          description={hasGoogle ? t('methodGoogleOn') : t('methodGoogleOff')}
          enabled={hasGoogle}
          enabledLabel={ts('enabled')}
          disabledLabel={ts('notConnected')}
        />
      </SettingsSection>

      {/*
        The safety note sits under the methods it is about rather than at the
        top of the page: it explains why the last method's Remove is disabled,
        and that is only worth reading beside the list.
      */}
      <Callout className="mt-6" icon="security">{ts('safetyNote')}</Callout>
    </div>
  );
}

function MethodRow({ icon, label, description, enabled, enabledLabel, disabledLabel }: {
  icon: IconName;
  label: string;
  description: string;
  enabled: boolean;
  enabledLabel: string;
  disabledLabel: string;
}) {
  return (
    <SettingsRow
      label={label}
      value={
        <span className="flex items-center gap-2">
          <Icon name={icon} className="size-4 shrink-0 text-muted-foreground" />
          {description}
        </span>
      }
      action={<Badge variant={enabled ? 'onTrack' : 'muted'}>{enabled ? enabledLabel : disabledLabel}</Badge>}
    />
  );
}
