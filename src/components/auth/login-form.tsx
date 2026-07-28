'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { requestMagicLink, signInWithPassword, type AuthFormState } from '@/components/auth/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Locale } from '@/i18n/routing';
import { MAGIC_LINK_TTL_MINUTES } from '@/lib/auth-constants';

const initialState: AuthFormState = { status: 'idle' };

export function LoginForms({ locale }: { locale: Locale }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <StaffLoginForm locale={locale} />
      <ClientMagicLinkForm locale={locale} />
    </div>
  );
}

function StaffLoginForm({ locale }: { locale: Locale }) {
  const t = useTranslations('login');
  const tCommon = useTranslations('common');
  const [state, formAction] = useActionState(signInWithPassword, initialState);

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

          <div className="space-y-2">
            <Label htmlFor="staff-password">{tCommon('password')}</Label>
            <Input id="staff-password" name="password" type="password" autoComplete="current-password" required />
          </div>

          <FormMessage state={state} />

          <SubmitButton label={t('submit')} />
        </form>
      </CardContent>
    </Card>
  );
}

function ClientMagicLinkForm({ locale }: { locale: Locale }) {
  const t = useTranslations('login');
  const tCommon = useTranslations('common');
  const [state, formAction] = useActionState(requestMagicLink, initialState);

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

          <FormMessage state={state} />

          <SubmitButton label={t('magicLinkSubmit')} />
        </form>
      </CardContent>
    </Card>
  );
}

function FormMessage({ state }: { state: AuthFormState }) {
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

function SubmitButton({ label }: { label: string }) {
  const tCommon = useTranslations('common');
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? tCommon('loading') : label}
    </Button>
  );
}
