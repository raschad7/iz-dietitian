'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { setPortalPassword } from '@/features/auth/actions';
import { AuthFormMessage, AuthSubmitButton } from '@/features/auth/components/form-parts';
import { PasswordInput } from '@/features/auth/components/password-input';
import { initialAuthState } from '@/features/auth/form-state';
import { CLIENT_MIN_PASSWORD_LENGTH } from '@/features/auth/password-policy';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { type Locale } from '@/i18n/routing';

/**
 * Forced first-sign-in change. A client lands here holding a dietitian-issued
 * temporary password and cannot reach the rest of the portal until they
 * replace it — see the guard in `src/app/[locale]/portal/layout.tsx`.
 */
export function SetPasswordForm({ locale }: { locale: Locale }) {
  const t = useTranslations('login');
  const tCommon = useTranslations('common');
  const [state, formAction] = useActionState(setPortalPassword, initialAuthState);

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{t('setPasswordHeading')}</CardTitle>
        <CardDescription>{t('setPasswordDescription')}</CardDescription>
      </CardHeader>

      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="locale" value={locale} />

          <PasswordInput
            name="password"
            label={tCommon('password')}
            autoComplete="new-password"
            minLength={CLIENT_MIN_PASSWORD_LENGTH}
            hint={t('clientPasswordHint', { count: CLIENT_MIN_PASSWORD_LENGTH })}
          />

          <PasswordInput
            name="confirmPassword"
            label={t('confirmPassword')}
            autoComplete="new-password"
            minLength={CLIENT_MIN_PASSWORD_LENGTH}
          />

          <AuthFormMessage state={state} />

          <AuthSubmitButton label={t('setPasswordSubmit')} />
        </form>
      </CardContent>
    </Card>
  );
}
