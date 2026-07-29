'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { AuthFormMessage, AuthSubmitButton } from '@/features/auth/components/form-parts';
import { GoogleButton } from '@/features/auth/components/google-button';
import { PasskeyButton } from '@/features/auth/components/passkey-button';
import { PasswordInput } from '@/features/auth/components/password-input';
import { signInWithPassword } from '@/features/auth/actions';
import { initialAuthState, type AuthFormState } from '@/features/auth/form-state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';

type StaffLoginFormProps = {
  locale: Locale;
  /** Google OAuth is only wired up when credentials exist; read server-side so
   * a client component never needs `@/lib/auth`, which pulls in the database. */
  showGoogle: boolean;
  /** Carries `?redirect=` from `src/proxy.ts` through to the server action,
   * which validates it against an allow-list — this form only relays it. */
  redirectTo?: string;
  /**
   * An error code from the OAuth round trip, which lands back here because the
   * Google button passes this page as its `errorCallbackURL`. The browser is
   * navigating in from Google, so there is no action state to carry it.
   */
  oauthError?: string;
};

/**
 * Maps Better Auth's OAuth error codes to message keys.
 *
 * `signup_disabled` is the expected one, not a fault: the provider has
 * `disableImplicitSignUp`, so a Google account with no clinic here is turned
 * away at sign-in and told to sign up instead. Anything else is genuinely
 * unexpected and stays vague.
 */
function oauthMessageKey(code: string): 'noGoogleAccount' | 'genericError' {
  return code === 'signup_disabled' ? 'noGoogleAccount' : 'genericError';
}

export function StaffLoginForm({ locale, showGoogle, redirectTo, oauthError }: StaffLoginFormProps) {
  const t = useTranslations('login');
  const tCommon = useTranslations('common');
  const [state, formAction] = useActionState(signInWithPassword, initialAuthState);

  const urlErrorState: AuthFormState | null = oauthError
    ? { status: 'error', messageKey: oauthMessageKey(oauthError) }
    : null;
  const displayState = state.status !== 'idle' ? state : (urlErrorState ?? state);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('staffHeading')}</CardTitle>
        <CardDescription>{t('staffDescription')}</CardDescription>
      </CardHeader>

      <CardContent>
        {/* Passkey first: it is the fastest and the safest, and order drives adoption. */}
        <div className="space-y-3">
          <PasskeyButton locale={locale} />
          {/* No `requestSignUp`: this door admits existing accounts only. */}
          {showGoogle ? <GoogleButton locale={locale} redirectTo={redirectTo} /> : null}
        </div>

        <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          {t('orUsePassword')}
          <span className="h-px flex-1 bg-border" />
        </div>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="redirectTo" value={redirectTo ?? ''} />

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

          <p className="text-end text-sm">
            <Link href="/forgot-password" className="font-medium text-foreground underline-offset-4 hover:underline">
              {t('forgotLink')}
            </Link>
          </p>

          <AuthFormMessage state={displayState} />

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
