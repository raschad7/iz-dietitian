'use client';

import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

import { FieldError } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type PasswordInputProps = {
  name: string;
  label: string;
  autoComplete: 'current-password' | 'new-password';
  /** Rendered under the field — used for the minimum-length rule on sign-up. */
  hint?: string;
  minLength?: number;
  placeholder?: string;
  /**
   * An already-translated message to show under the field.
   *
   * Passed by forms that validate themselves rather than leaving it to the
   * browser — see `signup-validation.ts`. When it is set the field also drops
   * the `required` attribute, because a form doing its own checking has no use
   * for the browser's and every reason to avoid the engine painting its own
   * invalid state over ours.
   */
  error?: string;
  /**
   * Whether the browser should enforce the field. On by default, because the
   * sign-in, reset and set-password forms still rely on it; the sign-up form
   * passes `false` and validates in Arabic instead.
   */
  nativeRequired?: boolean;
  /**
   * Rendered under the field, and — unlike {@link hint} — never displaced by an
   * error.
   *
   * The set-password screen puts its live rule checklist here. That list is not
   * helper copy competing with the error message; it is the rule itself, and it
   * is at its most useful in exactly the moment an error is showing. Whatever is
   * passed is announced with the field: the id below is appended to
   * `aria-describedby` rather than replacing the error's.
   */
  footer?: React.ReactNode;
  /** Extra description ids, for a footer that renders its own labelled region. */
  describedBy?: string;
  /**
   * Locks the box and its reveal toggle together.
   *
   * The set-password screen holds the confirm field shut until the first
   * password satisfies its rules — there is nothing to confirm before then, and
   * a box that accepts a second copy of a password that is about to be rejected
   * is asking for work it will have to throw away.
   *
   * ⚠ Whatever disables a field must leave the reason on screen. That screen
   * relies on its rule track being directly above the locked box; a caller
   * without something equivalent needs to supply one.
   */
  disabled?: boolean;
};

/**
 * A password field with a reveal toggle.
 *
 * Typing a long password blind is the main reason people give up on a sign-up
 * form, and it is worse here because the minimum is 10 characters. The toggle is
 * a real <button> so it is reachable by keyboard, and it is positioned with
 * `end-*` rather than `right-*` so it lands on the correct side in Arabic —
 * opposite the lock, which `Input` draws at the inline-start.
 */
export function PasswordInput({
  name,
  label,
  autoComplete,
  hint,
  minLength,
  placeholder,
  error,
  nativeRequired = true,
  footer,
  describedBy,
  disabled = false,
}: PasswordInputProps) {
  const t = useTranslations('login');
  const [revealed, setRevealed] = useState(false);
  const id = useId();
  const errorId = `${id}-error`;

  // Both, when both are there. `aria-describedby` takes a list, and dropping
  // the rules the moment an error appears would silence the one description
  // that says what a valid value looks like.
  const description = [error ? errorId : null, describedBy ?? null].filter(Boolean).join(' ');

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>

      <div className="relative">
        <Input
          id={id}
          name={name}
          type={revealed ? 'text' : 'password'}
          autoComplete={autoComplete}
          minLength={nativeRequired ? minLength : undefined}
          required={nativeRequired}
          aria-required
          aria-invalid={Boolean(error)}
          aria-describedby={description === '' ? undefined : description}
          disabled={disabled}
          placeholder={placeholder}
          icon="lock"
          className="pe-12"
        />

        {/*
          The toggle goes with the box. Revealing a field nobody can type in
          shows nothing worth seeing, and leaving it live would put a working
          control inside a dead one.
        */}
        <button
          type="button"
          onClick={() => setRevealed((current) => !current)}
          disabled={disabled}
          aria-pressed={revealed}
          aria-label={revealed ? t('hidePassword') : t('showPassword')}
          className="absolute inset-y-0 end-0 flex w-12 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          {revealed ? <Icon name="eyeOff" className="size-5" /> : <Icon name="eye" className="size-5" />}
        </button>
      </div>

      {/*
        The error replaces the hint rather than stacking under it: on the
        sign-up form the hint is "at least 10 characters" and the error is "that
        password is too short", which is the same rule stated twice — once
        neutrally and once in red, directly on top of each other.
      */}
      {error ? (
        <FieldError id={errorId}>{error}</FieldError>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}

      {footer}
    </div>
  );
}
