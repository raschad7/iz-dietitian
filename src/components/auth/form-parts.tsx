'use client';

import { useTranslations } from 'next-intl';
import { useFormStatus } from 'react-dom';

import { type AuthFormState } from '@/components/auth/actions';
import { Button } from '@/components/ui/button';

/** Shared between the three auth forms so they report failures identically. */
export function AuthFormMessage({ state }: { state: AuthFormState }) {
  const t = useTranslations('login');

  if (state.status === 'idle') return null;

  return (
    <p
      role="status"
      className={state.status === 'error' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
    >
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
