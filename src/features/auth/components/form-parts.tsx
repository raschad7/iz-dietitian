'use client';

import { useTranslations } from 'next-intl';
import { useFormStatus } from 'react-dom';

import { type AuthFormState } from '@/features/auth/form-state';
import { Button } from '@/components/ui/button';

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
  const tCommon = useTranslations('common');
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? tCommon('loading') : label}
    </Button>
  );
}
