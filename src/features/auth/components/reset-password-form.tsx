'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { AuthFormMessage, AuthSubmitButton } from '@/features/auth/components/form-parts';
import { PasswordInput } from '@/features/auth/components/password-input';
import { resetPassword } from '@/features/auth/actions';
import { initialAuthState } from '@/features/auth/form-state';
import { CLIENT_MIN_PASSWORD_LENGTH } from '@/features/auth/password-policy';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { type Locale } from '@/i18n/routing';

/**
 * ⚠ **The rule here is the sign-up screen's rule, because it is the same
 * schema.** `resetPasswordSchema` and `signUpSchema` both parse
 * `staffPasswordSchema`, which is the client rule now — eight characters with a
 * letter and a digit. See the note on that declaration.
 *
 * This screen only had its numbers corrected: it used to advertise ten
 * characters and "letters with numbers or symbols", which would have rejected
 * the very password someone had just signed up with. It does **not** carry the
 * live rule track the sign-up screen does — that was not asked for here, and it
 * is the obvious next step if this screen is ever revisited.
 */

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

          <AuthSubmitButton label={t('resetSubmit')} />
        </form>
      </CardContent>
    </Card>
  );
}
