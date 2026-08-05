'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { signUpStaff } from '@/features/auth/actions';
import { AuthFormMessage, AuthSubmitButton } from '@/features/auth/components/form-parts';
import { GoogleButton } from '@/features/auth/components/google-button';
import { PasswordInput } from '@/features/auth/components/password-input';
import { VerifyEmailNotice } from '@/features/auth/components/verify-email-notice';
import { initialAuthState } from '@/features/auth/form-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link } from '@/i18n/navigation';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth-constants';
import { type Locale } from '@/i18n/routing';

type StaffSignUpFormProps = {
  locale: Locale;
  /** False when this deployment has no Google credentials — see `isGoogleEnabled`. */
  showGoogle: boolean;
};

export function StaffSignUpForm({ locale, showGoogle }: StaffSignUpFormProps) {
  const t = useTranslations('login');
  const tCommon = useTranslations('common');
  const [state, formAction] = useActionState(signUpStaff, initialAuthState);

  /*
    Sign-up succeeded and issued no session — the account is waiting on the link
    that just went out. The notice is shared with `/verify-email` so both places
    offer the same resend.
  */
  if (state.status === 'sent') {
    return <VerifyEmailNotice locale={locale} email={state.email} sendFailed={state.deliveryFailed} bare />;
  }

  return (
    <div className="w-full">
      {/* No heading and no intro line — the screen's `h1` already reads
          "Create a clinic team account". See `StaffLoginForm`. */}
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="locale" value={locale} />

        <div className="space-y-2">
          <Label htmlFor="signup-name">{t('fullName')}</Label>
          <Input
            id="signup-name"
            name="name"
            autoComplete="name"
            required
            minLength={2}
            placeholder={t('namePlaceholder')}
            icon="person"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="signup-email">{tCommon('email')}</Label>
          {/* No `dir="ltr"` — see the note on the same field in `StaffLoginForm`. */}
          <Input
            id="signup-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder={t('emailPlaceholder')}
            icon="email"
          />
        </div>

        <PasswordInput
          name="password"
          label={tCommon('password')}
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          placeholder={t('passwordPlaceholder')}
          hint={t('passwordHint', { count: MIN_PASSWORD_LENGTH })}
        />

        <PasswordInput
          name="confirmPassword"
          label={t('confirmPassword')}
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          placeholder={t('confirmPasswordPlaceholder')}
        />

        <AuthFormMessage state={state} />

        <AuthSubmitButton label={t('signUpSubmit')} />
      </form>

      {/*
        Below the password, in the same place sign-in puts its alternates: the
        two screens are one card that flips, and a control that jumps from above
        the form to below it as it flips reads as a different screen rather than
        as the other face of the same one.

        It is the same button as on the sign-in page, and deliberately so: with
        OAuth there is no separate "register" step — the first time through
        creates the account. It also skips the verification gate entirely,
        because Google has already proven the address belongs to them.
      */}
      {showGoogle ? (
        <>
          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {t('orUsePassword')}
            <span className="h-px flex-1 bg-border" />
          </div>

          {/* The only place that passes `requestSignUp` — this is the enrolment door. */}
          <GoogleButton locale={locale} requestSignUp />
        </>
      ) : null}
    </div>
  );
}
