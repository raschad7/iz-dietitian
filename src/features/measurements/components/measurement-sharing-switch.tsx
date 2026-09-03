'use client';

import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { useFormStatus } from 'react-dom';

import { Switch } from '@/components/ui/switch';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

import { setMeasurementSharingAction } from '../actions';

/**
 * "Show these measurements to this client."
 *
 * ## Off by default, and per client
 *
 * The same rule `share_weight_with_client` already sets, for the same reason its
 * column states at length: whether a number on a screen helps a client or harms
 * them is a clinical judgement, so the dietitian makes it — not the app, and not
 * the client. Revealing a figure nobody chose to reveal is the failure the
 * default exists to prevent; a client who wants to see it and asks once is not.
 *
 * ## It is the submit control of its own form
 *
 * The shape `SettingsSwitchRow` already uses, and `Switch`'s own contract: a
 * `<button type="submit">` carrying the value it would move *to*, so a click
 * reads as "turn this off" rather than "post whatever it currently says", and so
 * it works with JavaScript off.
 *
 * While the write is in flight the switch shows where it is going. That is
 * optimism about the *animation* only — the action revalidates the record, so
 * what settles is what the column says. A disclosure control that looks on while
 * the column says off is the one failure here worth a round trip to avoid.
 *
 * Disabled while the profile does not exist, because there is nothing to write
 * to — see `setMeasurementSharing`.
 */
export function MeasurementSharingSwitch({
  clientId,
  locale,
  shared,
  hasProfile,
}: {
  clientId: string;
  locale: Locale;
  shared: boolean;
  /** False when the client's intake has never been saved. */
  hasProfile: boolean;
}) {
  const t = useTranslations('measurements');
  const labelId = useId();
  const hintId = useId();

  return (
    <form action={setMeasurementSharingAction} className="flex items-start gap-3">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="clientId" value={clientId} />

      <SharingSwitch
        shared={shared}
        disabled={!hasProfile}
        labelId={labelId}
        hintId={hintId}
      />

      <span className="space-y-1">
        <span id={labelId} className="block text-body font-medium">
          {t('sharing.label')}
        </span>
        <span id={hintId} className="block text-caption text-muted-foreground">
          {hasProfile ? t('sharing.hint') : t('sharing.noProfile')}
        </span>
      </span>
    </form>
  );
}

function SharingSwitch({
  shared,
  disabled,
  labelId,
  hintId,
}: {
  shared: boolean;
  disabled: boolean;
  labelId: string;
  hintId: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Switch
      type="submit"
      name="shared"
      // The value it would move to, so a click reads as "turn this off" rather
      // than "submit whatever it currently says".
      value={shared ? 'off' : 'on'}
      checked={pending ? !shared : shared}
      disabled={disabled || pending}
      aria-labelledby={labelId}
      aria-describedby={hintId}
      className={cn('shrink-0', disabled && 'opacity-50')}
    />
  );
}
