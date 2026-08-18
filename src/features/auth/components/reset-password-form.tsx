'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { AuthFormMessage, AuthSubmitButton } from '@/features/auth/components/form-parts';
import { PasswordInput } from '@/features/auth/components/password-input';
import { resetPassword } from '@/features/auth/actions';
import { initialAuthState } from '@/features/auth/form-state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth-constants';
import { type Locale } from '@/i18n/routing';

export function ResetPasswordForm({ locale, token }: { locale: Locale; token: string }) {
  const t = useTranslations('login');
  const tCommon = useTranslations('common');
  const [state, formAction] = useActionState(resetPassword, initialAuthState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('resetHeading')}</CardTitle>
        <CardDescription>{t('resetDescription')}</CardDescription>
      </CardHeader>

      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="token" value={token} />

          <PasswordInput
            name="password"
            label={tCommon('password')}
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            hint={t('passwordStrengthHint', { count: MIN_PASSWORD_LENGTH })}
          />

          <PasswordInput
            name="confirmPassword"
            label={t('confirmPassword')}
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
          />

          <AuthFormMessage state={state} />

          <AuthSubmitButton label={t('resetSubmit')} />
        </form>
      </CardContent>
    </Card>
  );
}
