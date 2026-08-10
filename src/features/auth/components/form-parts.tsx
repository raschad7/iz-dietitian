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
    <Button type="submit" className="w-full max-w-none" disabled={pending}>
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
