'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { signUpStaff } from '@/features/auth/actions';
import { AuthFormMessage, AuthSubmitButton } from '@/features/auth/components/form-parts';
import { PasswordInput } from '@/features/auth/components/password-input';
import { initialAuthState } from '@/features/auth/form-state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link } from '@/i18n/navigation';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth-constants';
import { type Locale } from '@/i18n/routing';

export function StaffSignUpForm({ locale }: { locale: Locale }) {
  const t = useTranslations('login');
  const tCommon = useTranslations('common');
  const [state, formAction] = useActionState(signUpStaff, initialAuthState);

  if (state.status === 'sent') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('checkInboxHeading')}</CardTitle>
          <CardDescription>{t('checkInboxDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>{t('checkInboxSpam')}</p>
          {/*
            A mistyped address cannot be corrected from here: there is no session
            and the mail went elsewhere. Signing up again is the only way out, so
            say so plainly rather than leaving a dead end.
          */}
          <p>
            {t('checkInboxWrongAddress')}{' '}
            <Link href="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
              {t('signUpLink')}
            </Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('signUpHeading')}</CardTitle>
        <CardDescription>{t('signUpDescription')}</CardDescription>
      </CardHeader>

      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="locale" value={locale} />

          <div className="space-y-2">
            <Label htmlFor="signup-name">{t('fullName')}</Label>
            <Input id="signup-name" name="name" autoComplete="name" required minLength={2} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="signup-email">{tCommon('email')}</Label>
            <Input
              id="signup-email"
              name="email"
              type="email"
              autoComplete="email"
              dir="ltr"
              required
              placeholder={t('emailPlaceholder')}
            />
          </div>

          <PasswordInput
            name="password"
            label={tCommon('password')}
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            hint={t('passwordHint', { count: MIN_PASSWORD_LENGTH })}
          />

          <PasswordInput
            name="confirmPassword"
            label={t('confirmPassword')}
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
          />

          <AuthFormMessage state={state} />

          <AuthSubmitButton label={t('signUpSubmit')} />
        </form>

        <p className="mt-4 text-sm text-muted-foreground">
          {t('haveAccount')}{' '}
          <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
            {t('signInLink')}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
