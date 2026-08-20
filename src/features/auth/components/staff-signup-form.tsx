'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState, type ChangeEvent, type FormEvent } from 'react';

import { signUpStaff } from '@/features/auth/actions';
import { AuthFormMessage, AuthSubmitButton } from '@/features/auth/components/form-parts';
import { GoogleButton } from '@/features/auth/components/google-button';
import { PasswordInput } from '@/features/auth/components/password-input';
import { VerifyEmailNotice } from '@/features/auth/components/verify-email-notice';
import { initialAuthState } from '@/features/auth/form-state';
import {
  readSignUpForm,
  signUpFieldErrors,
  type SignUpFieldErrors,
} from '@/features/auth/signup-validation';
import { MAX_NAME_PART_LENGTH } from '@/features/auth/schema';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  const [fieldErrors, setFieldErrors] = useState<SignUpFieldErrors>({});

  /**
   * Checks the form in Arabic before the browser can check it in English.
   *
   * `noValidate` below is what silences the native bubble; without something
   * taking its place the form would simply post four empty strings and wait for
   * the round trip to say so. See `signup-validation.ts` for why the bubble had
   * to go rather than be translated.
   */
  function validateBeforeSubmit(event: FormEvent<HTMLFormElement>): void {
    const errors = signUpFieldErrors(readSignUpForm(new FormData(event.currentTarget)));
    setFieldErrors(errors);

    if (Object.keys(errors).length === 0) return;

    event.preventDefault();
    // The first field that is wrong, not the first field on the form: being
    // dropped on the box that needs attention is the whole point of catching
    // this here rather than on the server.
    window.setTimeout(() => {
      event.currentTarget?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }, 0);
  }

  /** A field stops being wrong the moment it is edited. */
  function clearCorrectedField(event: ChangeEvent<HTMLFormElement>): void {
    if (!(event.target instanceof HTMLInputElement)) return;
    const name = event.target.name as keyof SignUpFieldErrors;

    setFieldErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      // Retyping either password answers a mismatch, whichever box it was
      // reported on.
      if (name === 'password') delete next.confirmPassword;
      return next;
    });
  }

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
      {/*
        `noValidate`, and every `required` / `minLength` / `type="email"` rule
        below now lives in `signUpSchema` instead.

        The browser's own checks were the only thing on this screen that spoke
        English: the bubble is drawn by the browser in the browser's locale, and
        it cannot be translated, restyled or repositioned. An Arabic clinic on an
        English Chrome got "Please include an '@' in the email address" in a grey
        OS tooltip pointing at a right-to-left form. `type="email"` stays on the
        input because it selects the right on-screen keyboard on a phone; it is
        `noValidate` that stops it from being enforced by the browser.
      */}
      <form
        action={formAction}
        noValidate
        onSubmit={validateBeforeSubmit}
        onChange={clearCorrectedField}
        className="space-y-4 short:space-y-3"
      >
        <input type="hidden" name="locale" value={locale} />

        {/*
          The two halves sit side by side on one row rather than stacked. They
          are one answer — a name — and a form that spends two full-width rows
          on it reads as twice the work; the pair also stays under the fold on a
          phone, where this form is already five fields long. `sm:` because at
          320px two ten-character boxes are narrower than the text in them.
        */}
        <div className="grid gap-4 sm:grid-cols-2 short:gap-3">
          <div className="space-y-2">
            <Label htmlFor="signup-first-name">{t('firstName')}</Label>
            <Input
              id="signup-first-name"
              name="firstName"
              autoComplete="given-name"
              maxLength={MAX_NAME_PART_LENGTH}
              aria-required
              aria-invalid={Boolean(fieldErrors.firstName)}
              aria-describedby={fieldErrors.firstName ? 'signup-first-name-error' : undefined}
              placeholder={t('firstNamePlaceholder')}
              icon="person"
            />
            {fieldErrors.firstName ? (
              <FieldError id="signup-first-name-error">{t(fieldErrors.firstName, { count: MAX_NAME_PART_LENGTH })}</FieldError>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="signup-last-name">{t('lastName')}</Label>
            <Input
              id="signup-last-name"
              name="lastName"
              autoComplete="family-name"
              maxLength={MAX_NAME_PART_LENGTH}
              aria-required
              aria-invalid={Boolean(fieldErrors.lastName)}
              aria-describedby={fieldErrors.lastName ? 'signup-last-name-error' : undefined}
              placeholder={t('lastNamePlaceholder')}
              icon="person"
            />
            {fieldErrors.lastName ? (
              <FieldError id="signup-last-name-error">{t(fieldErrors.lastName, { count: MAX_NAME_PART_LENGTH })}</FieldError>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="signup-email">{tCommon('email')}</Label>
          {/* No `dir="ltr"` — see the note on the same field in `StaffLoginForm`. */}
          <Input
            id="signup-email"
            name="email"
            type="email"
            autoComplete="email"
            aria-required
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? 'signup-email-error' : undefined}
            placeholder={t('emailPlaceholder')}
            icon="email"
          />
          {fieldErrors.email ? (
            <FieldError id="signup-email-error">{t(fieldErrors.email)}</FieldError>
          ) : null}
        </div>

        <PasswordInput
          name="password"
          label={tCommon('password')}
          autoComplete="new-password"
          nativeRequired={false}
          placeholder={t('passwordPlaceholder')}
          hint={t('passwordStrengthHint', { count: MIN_PASSWORD_LENGTH })}
          error={fieldErrors.password ? t(fieldErrors.password) : undefined}
        />

        <PasswordInput
          name="confirmPassword"
          label={t('confirmPassword')}
          autoComplete="new-password"
          nativeRequired={false}
          placeholder={t('confirmPasswordPlaceholder')}
          error={fieldErrors.confirmPassword ? t(fieldErrors.confirmPassword) : undefined}
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
          {/* The same rule sign-in draws — see `StaffLoginForm` for the tokens
              and for why there is no `uppercase` on it. The two faces of this
              screen must not disagree about a divider. */}
          <div className="my-4 short:my-2.5 flex items-center gap-3.5 text-caption font-semibold text-muted-foreground">
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
