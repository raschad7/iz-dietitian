'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { requestMagicLink } from '@/features/auth/actions';
import { AuthFormMessage, AuthSubmitButton } from '@/features/auth/components/form-parts';
import { initialAuthState } from '@/features/auth/form-state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MAGIC_LINK_TTL_MINUTES } from '@/lib/auth-constants';
import { type Locale } from '@/i18n/routing';

/**
 * Clients never hold a password — they receive a single-use link instead. That
 * is why this form is on its own page and not beside the staff sign-in: the two
 * audiences have nothing in common beyond an email field, and putting them side
 * by side invited clients to try a password they never had.
 */
export function ClientLoginForm({ locale }: { locale: Locale }) {
  const t = useTranslations('login');
  const tCommon = useTranslations('common');
  const [state, formAction] = useActionState(requestMagicLink, initialAuthState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('clientHeading')}</CardTitle>
        <CardDescription>{t('clientDescription', { minutes: MAGIC_LINK_TTL_MINUTES })}</CardDescription>
      </CardHeader>

      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="locale" value={locale} />

          <div className="space-y-2">
            <Label htmlFor="client-email">{tCommon('email')}</Label>
            <Input
              id="client-email"
              name="email"
              type="email"
              autoComplete="email"
              dir="ltr"
              required
              placeholder={t('emailPlaceholder')}
            />
          </div>

          <AuthFormMessage state={state} />

          <AuthSubmitButton label={t('magicLinkSubmit')} />
        </form>
      </CardContent>
    </Card>
  );
}
