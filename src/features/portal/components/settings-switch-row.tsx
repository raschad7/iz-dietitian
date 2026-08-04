'use client';

import { useFormStatus } from 'react-dom';

import { Switch } from '@/components/ui/switch';
import { SettingsLabel } from '@/features/portal/components/settings-section';
import { type Locale } from '@/i18n/routing';

/**
 * One thing the clinic may send, on or off.
 *
 * The only settings row that needs the browser, and it needs it for one thing:
 * `useFormStatus` tells the knob to draw where it is going while the save is in
 * flight, so the switch moves under the thumb instead of a beat later. If the
 * save fails the next render puts it back, which is also the truth.
 *
 * Everything else about it is a plain form. The switch itself is the submit
 * button, carrying the value it would move to, so a client with JavaScript off
 * still gets a working toggle — see `src/components/ui/switch.tsx`.
 */
export function SettingsSwitchRow({
  action,
  name,
  value,
  checked,
  label,
  description,
  locale,
}: {
  action: (formData: FormData) => void | Promise<void>;
  /** The field naming *which* setting this is — `kind`, for the notifications. */
  name: string;
  value: string;
  checked: boolean;
  label: string;
  description?: string;
  locale: Locale;
}) {
  const labelId = `setting-${value}`;

  return (
    <form action={action} className="flex items-center gap-3 py-1">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name={name} value={value} />

      <SettingsLabel id={labelId} label={label} description={description} />

      <SwitchSubmit checked={checked} labelId={labelId} />
    </form>
  );
}

function SwitchSubmit({ checked, labelId }: { checked: boolean; labelId: string }) {
  const { pending } = useFormStatus();

  return (
    <Switch
      type="submit"
      name="enabled"
      // The value it would move to, so a click reads as "turn this off" rather
      // than "submit whatever it currently says".
      value={checked ? 'off' : 'on'}
      checked={pending ? !checked : checked}
      aria-labelledby={labelId}
    />
  );
}
