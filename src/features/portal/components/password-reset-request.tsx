'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { requestPasswordReset } from '@/features/auth/actions';
import { initialAuthState } from '@/features/auth/form-state';
import { type Locale } from '@/i18n/routing';

/**
 * Changing the password, the only way it can honestly be done from here.
 *
 * **A link to the inbox, not a field on the screen.** A password change has to
 * prove the person asking owns the account, and a signed-in session is not that
 * proof — a borrowed, unlocked phone has one. So this sends a one-time link to
 * the address on the account, which is the same flow `/forgot-password` runs
 * and the same rate limit governs it.
 *
 * The address is not shown as an input the client can retype. Sending the reset
 * somewhere other than the registered address would be the whole attack this
 * exists to prevent, so it is a hidden field with the account's own email in it
 * and the row above states which address that is.
 *
 * The answer never says whether the address is registered — `requestPasswordReset`
 * returns the same `resetLinkSent` either way, and this renders it verbatim.
 */
export function PasswordResetRequest({ email, locale }: { email: string; locale: Locale }) {
  const t = useTranslations('login');
  const tSecurity = useTranslations('portal.settings.security');

  const [state, formAction] = useActionState(requestPasswordReset, initialAuthState);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="email" value={email} />

      {state.status === 'sent' ? (
        <p role="status" className="rounded-md rounded-ee-xl bg-secondary p-3 text-sm text-secondary-foreground">
          {t(state.messageKey)}
        </p>
      ) : null}

      {state.status === 'error' ? (
        <p role="alert" className="text-sm text-destructive">
          {t(state.messageKey)}
        </p>
      ) : null}

      {state.status === 'rateLimited' ? (
        <p role="alert" className="text-sm text-destructive">
          {t(state.messageKey, { minutes: state.minutes })}
        </p>
      ) : null}

      <SubmitButton label={tSecurity('sendResetLink')} />
    </form>
  );
}

function SubmitButton({ label }: { label: string }) {
  const t = useTranslations('common');
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="default" disabled={pending}>
      {pending ? t('loading') : label}
    </Button>
  );
}
