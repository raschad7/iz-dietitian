'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { AuthFormMessage, AuthSubmitButton } from '@/features/auth/components/form-parts';
import { PasswordInput } from '@/features/auth/components/password-input';
import { signInWithPassword } from '@/features/auth/actions';
import { initialAuthState } from '@/features/auth/form-state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';

export function StaffLoginForm({ locale }: { locale: Locale }) {
  const t = useTranslations('login');
  const tCommon = useTranslations('common');
  const [state, formAction] = useActionState(signInWithPassword, initialAuthState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('staffHeading')}</CardTitle>
        <CardDescription>{t('staffDescription')}</CardDescription>
      </CardHeader>

      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="locale" value={locale} />

          <div className="space-y-2">
            <Label htmlFor="staff-email">{tCommon('email')}</Label>
            <Input
              id="staff-email"
              name="email"
              type="email"
              autoComplete="email"
              dir="ltr"
              required
              placeholder={t('emailPlaceholder')}
            />
          </div>

          <PasswordInput name="password" label={tCommon('password')} autoComplete="current-password" />

          <AuthFormMessage state={state} />

          <AuthSubmitButton label={t('submit')} />
        </form>

        <p className="mt-4 text-sm text-muted-foreground">
          {t('noAccount')}{' '}
          <Link href="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
            {t('signUpLink')}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
