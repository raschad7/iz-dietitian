'use client';

import { Icon } from '@/components/ui/icon';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type PasswordInputProps = {
  name: string;
  label: string;
  autoComplete: 'current-password' | 'new-password';
  /** Rendered under the field — used for the minimum-length rule on sign-up. */
  hint?: string;
  minLength?: number;
};

/**
 * A password field with a reveal toggle.
 *
 * Typing a long password blind is the main reason people give up on a sign-up
 * form, and it is worse here because the minimum is 10 characters. The toggle is
 * a real <button> so it is reachable by keyboard, and it is positioned with
 * `end-*` rather than `right-*` so it lands on the correct side in Arabic.
 */
export function PasswordInput({ name, label, autoComplete, hint, minLength }: PasswordInputProps) {
  const t = useTranslations('login');
  const [revealed, setRevealed] = useState(false);
  const id = useId();

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>

      <div className="relative">
        <Input
          id={id}
          name={name}
          type={revealed ? 'text' : 'password'}
          autoComplete={autoComplete}
          minLength={minLength}
          required
          className="pe-9"
        />

        <button
          type="button"
          onClick={() => setRevealed((current) => !current)}
          aria-pressed={revealed}
          aria-label={revealed ? t('hidePassword') : t('showPassword')}
          className="absolute inset-y-0 end-0 flex w-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
        >
          {revealed ? <Icon name="eyeOff" /> : <Icon name="eye" />}
        </button>
      </div>

      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
