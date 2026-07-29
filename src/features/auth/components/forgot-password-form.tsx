'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { AuthFormMessage, AuthSubmitButton } from '@/features/auth/components/form-parts';
import { requestPasswordReset } from '@/features/auth/actions';
import { initialAuthState } from '@/features/auth/form-state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type Locale } from '@/i18n/routing';

export function ForgotPasswordForm({ locale }: { locale: Locale }) {
  const t = useTranslations('login');
  const tCommon = useTranslations('common');
  const [state, formAction] = useActionState(requestPasswordReset, initialAuthState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('forgotHeading')}</CardTitle>
        <CardDescription>{t('forgotDescription')}</CardDescription>
      </CardHeader>

      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="locale" value={locale} />

          <div className="space-y-2">
            <Label htmlFor="forgot-email">{tCommon('email')}</Label>
            <Input id="forgot-email" name="email" type="email" autoComplete="email" dir="ltr" required />
          </div>

          <AuthFormMessage state={state} />

          <AuthSubmitButton label={t('forgotSubmit')} />
        </form>
      </CardContent>
    </Card>
  );
}
