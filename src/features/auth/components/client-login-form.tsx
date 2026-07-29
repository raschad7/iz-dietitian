'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { signInToPortal } from '@/features/auth/actions';
import { AuthFormMessage, AuthSubmitButton } from '@/features/auth/components/form-parts';
import { PasswordInput } from '@/features/auth/components/password-input';
import { initialAuthState } from '@/features/auth/form-state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type Locale } from '@/i18n/routing';

/**
 * Clients never sign themselves up. A dietitian issues a username and a
 * temporary password, so this form is a plain credentials sign-in — the same
 * shape as staff sign-in, but on its own page: the audiences share nothing
 * beyond that shape, and a client typing a staff email here would be
 * confusing rather than helpful.
 */
export function ClientLoginForm({ locale }: { locale: Locale }) {
  const t = useTranslations('login');
  const tCommon = useTranslations('common');
  const [state, formAction] = useActionState(signInToPortal, initialAuthState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('portalHeading')}</CardTitle>
        <CardDescription>{t('portalDescription')}</CardDescription>
      </CardHeader>

      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="locale" value={locale} />

          <div className="space-y-2">
            <Label htmlFor="client-username">{t('portalUsername')}</Label>
            <Input id="client-username" name="username" type="text" autoComplete="username" dir="ltr" required />
          </div>

          <PasswordInput name="password" label={tCommon('password')} autoComplete="current-password" />

          <AuthFormMessage state={state} />

          <AuthSubmitButton label={t('portalSubmit')} />
        </form>
      </CardContent>
    </Card>
  );
}
