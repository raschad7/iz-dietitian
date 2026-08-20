'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState, type ChangeEvent, type FormEvent } from 'react';

import { AuthFormMessage, AuthSubmitButton } from '@/features/auth/components/form-parts';
import { GoogleButton } from '@/features/auth/components/google-button';
import { PasskeyButton } from '@/features/auth/components/passkey-button';
import { PasswordInput } from '@/features/auth/components/password-input';
import { signInWithPassword } from '@/features/auth/actions';
import { initialAuthState, type AuthFormState } from '@/features/auth/form-state';
import {
  loginFieldErrors,
  readLoginForm,
  type LoginFieldErrors,
} from '@/features/auth/login-validation';
import { FieldError } from '@/components/ui/field';
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
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});

  /**
   * Checks the form in the page's language before the browser can check it in
   * its own. `noValidate` below silences the native bubble — see
   * `login-validation.ts` for why it had to go rather than be translated.
   */
  function validateBeforeSubmit(event: FormEvent<HTMLFormElement>): void {
    const form = event.currentTarget;
    const errors = loginFieldErrors(readLoginForm(new FormData(form)));
    setFieldErrors(errors);

    if (Object.keys(errors).length === 0) return;

    event.preventDefault();
    // The first field that is wrong, not the first field on the form.
    window.setTimeout(() => {
      form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }, 0);
  }

  /** A field stops being wrong the moment it is edited. */
  function clearCorrectedField(event: ChangeEvent<HTMLFormElement>): void {
    if (!(event.target instanceof HTMLInputElement)) return;
    const name = event.target.name as keyof LoginFieldErrors;

    setFieldErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  const urlErrorState: AuthFormState | null = oauthError
    ? { status: 'error', messageKey: oauthMessageKey(oauthError) }
    : null;
  const displayState = state.status !== 'idle' ? state : (urlErrorState ?? state);

  /*
   * Bare content — `AuthSplitCard` owns the surface, so a `Card` in here would
   * be a second one nested inside it.
   *
   * No heading and no intro line either: the screen's `h1` and the role switch
   * sit directly above this card and already say "Sign in" and "Clinic team",
   * and a form of two labelled fields does not need to be described. Those
   * lines were also what decided whether this form scrolled inside a card whose
   * height cannot move.
   */
  return (
    <div className="w-full">

      <form
        action={formAction}
        noValidate
        onSubmit={validateBeforeSubmit}
        onChange={clearCorrectedField}
        className="space-y-4 short:space-y-3"
      >
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="redirectTo" value={redirectTo ?? ''} />

        <div className="space-y-2">
          <Label htmlFor="staff-email">{tCommon('email')}</Label>
          {/*
            No `dir="ltr"`. It was here to keep an address's characters in
            order, but on a field that holds nothing else the bidi algorithm
            already does that — an email is one uninterrupted Latin run with no
            surrounding text to reorder its neutrals against. What `dir="ltr"`
            *did* do was pin the placeholder to the left of an Arabic form while
            every label above it sat on the right. Inheriting the page direction
            aligns the placeholder, the value and the leading glyph together.
          */}
          <Input
            id="staff-email"
            name="email"
            type="email"
            autoComplete="email"
            aria-required
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? 'staff-email-error' : undefined}
            placeholder={t('emailPlaceholder')}
            icon="email"
          />
          {fieldErrors.email ? (
            <FieldError id="staff-email-error">{t(fieldErrors.email)}</FieldError>
          ) : null}
        </div>

        <PasswordInput
          name="password"
          label={tCommon('password')}
          autoComplete="current-password"
          placeholder={t('passwordPlaceholder')}
          nativeRequired={false}
          error={fieldErrors.password ? t(fieldErrors.password) : undefined}
        />

        {/*
          v5.html's `.options-row`, minus one thing.

          That row holds a "remember me on this device" checkbox and this link.
          The checkbox is **not** here, and its absence is deliberate: nothing in
          this application implements a remembered device, so the control would
          be a painted box that changes nothing about the session it appears to
          govern. Wiring it is a real change to `signInWithPassword` and the
          session lifetime, not a restyle. If it is wanted, that is the work —
          not this checkbox.

          With one item left the row is just the link, pushed to the inline-end
          where v5.html puts it. `font-semibold` and the muted-to-olive hover are
          that file's `.forgot-link`; `text-body-sm` is the system's 14px token
          standing in for its 13.5px.
        */}
        <p className="text-end text-body-sm">
          <Link
            href="/forgot-password"
            className="font-semibold text-muted-foreground underline-offset-4 transition-colors duration-(--duration-label) hover:text-secondary-foreground hover:underline"
          >
            {t('forgotLink')}
          </Link>
        </p>

        <AuthFormMessage state={displayState} />

        {/*
          The one error with somewhere to go. "Confirm your email first" is
          useless on its own — the link may have expired, or never arrived —
          and the reset flow above cannot help, so offer the resend screen
          right where the refusal is read.
        */}
        {displayState.status === 'error' && displayState.messageKey === 'verifyEmailFirst' ? (
          <p className="text-sm">
            <Link href="/verify-email" className="font-medium text-foreground underline-offset-4 hover:underline">
              {t('resendVerificationSubmit')}
            </Link>
          </p>
        ) : null}

        <AuthSubmitButton label={t('submit')} />
      </form>

      {/*
        v5.html's `.divider-wrap`: 14px gutters, a hairline each side, and the
        word in 12px semibold.

        `text-caption` is the system token for 12px; `text-xs` was the raw
        Tailwind step at the same size. No `uppercase` even though v5.html asks
        for it — docs/design-system.md forbids case transforms on Arabic, and
        this string is "أو" by default.
      */}
      <div className="my-4 short:my-2.5 flex items-center gap-3.5 text-caption font-semibold text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {t('orUsePassword')}
        <span className="h-px flex-1 bg-border" />
      </div>

      {/*
        Alternate sign-in, once the primary path is filled in above.

        Stacked and full width, which is v5.html's `.btn-google` shape. That file
        has one such button and this application has two — a passkey is a sign-in
        path here and there is no version of "preserve existing functionality"
        that drops it — so the pattern repeats rather than the pair being squeezed
        into one row. It also means both keep their full labels: "المتابعة
        باستخدام مفتاح المرور" does not fit a half-width box on one line, and
        `Button` never wraps.

        `space-y-3` rather than a grid: each button ships its own error paragraph
        underneath, and a stack lets the failing one grow without moving the other.
      */}
      <div className="space-y-2.5 short:space-y-2">
        <PasskeyButton locale={locale} />
        {/* No `requestSignUp`: this door admits existing accounts only. */}
        {showGoogle ? <GoogleButton locale={locale} redirectTo={redirectTo} /> : null}
      </div>
    </div>
  );
}
