'use client';

import { useTranslations } from 'next-intl';
import { useFormStatus } from 'react-dom';

import { type AuthFormState } from '@/features/auth/form-state';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

/** Shared between the three auth forms so they report failures identically. */
export function AuthFormMessage({ state }: { state: AuthFormState }) {
  const t = useTranslations('login');

  if (state.status === 'idle') return null;

  if (state.status === 'rateLimited') {
    return (
      <p role="alert" className="text-sm text-destructive">
        {t('rateLimited', { minutes: state.minutes })}
      </p>
    );
  }

  const tone = state.status === 'error' ? 'text-destructive' : 'text-muted-foreground';

  return (
    <p role={state.status === 'error' ? 'alert' : 'status'} className={`text-sm ${tone}`}>
      {t(state.messageKey)}
    </p>
  );
}

export function AuthSubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    /*
      `text-white`, not the `default` variant's dark `--primary-foreground`.

      The token is n-900 on purpose — white on the brand green measures about
      2.68:1, under WCAG AA. The white label was asked for on the auth screens
      specifically, so it is an override here rather than a change to the token,
      and every primary button behind the login keeps the checked pairing.
    */
    <Button type="submit" className="w-full max-w-none text-white" disabled={pending}>
      {/*
        The label stays put and a spinner joins it, rather than the label being
        replaced by the word "loading". Swapping the text changes the width of
        the control at the moment it is pressed, and it throws away the one
        thing that says *what* is being waited for; `disabled` plus a spinner
        says the same thing without either cost.
      */}
      {pending ? <Spinner /> : null}
      {label}
    </Button>
  );
}
