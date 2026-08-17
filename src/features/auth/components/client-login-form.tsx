'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState, type ChangeEvent, type FormEvent } from 'react';

import { signInToPortal } from '@/features/auth/actions';
import { AuthFormMessage, AuthSubmitButton } from '@/features/auth/components/form-parts';
import { PasswordInput } from '@/features/auth/components/password-input';
import { initialAuthState } from '@/features/auth/form-state';
import {
  portalFieldErrors,
  readPortalForm,
  type PortalFieldErrors,
} from '@/features/auth/login-validation';
import { FieldError } from '@/components/ui/field';
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
  const [fieldErrors, setFieldErrors] = useState<PortalFieldErrors>({});

  /** Checks the form in the page's language — see `StaffLoginForm`. */
  function validateBeforeSubmit(event: FormEvent<HTMLFormElement>): void {
    const form = event.currentTarget;
    const errors = portalFieldErrors(readPortalForm(new FormData(form)));
    setFieldErrors(errors);

    if (Object.keys(errors).length === 0) return;

    event.preventDefault();
    window.setTimeout(() => {
      form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }, 0);
  }

  /** A field stops being wrong the moment it is edited. */
  function clearCorrectedField(event: ChangeEvent<HTMLFormElement>): void {
    if (!(event.target instanceof HTMLInputElement)) return;
    const name = event.target.name as keyof PortalFieldErrors;

    setFieldErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  /* Bare content: `AuthSplitCard` is the surface — see `StaffLoginForm`. */
  return (
    <div className="w-full">
      {/* No heading and no intro line — the screen's `h1` and the role switch
          above the card already name this form. See `StaffLoginForm`. */}

      <form
        action={formAction}
        noValidate
        onSubmit={validateBeforeSubmit}
        onChange={clearCorrectedField}
        className="space-y-4"
      >
        <input type="hidden" name="locale" value={locale} />

        <div className="space-y-2">
          <Label htmlFor="client-username">{t('portalUsername')}</Label>
          {/* No `dir="ltr"` — see the note on the same field in `StaffLoginForm`. */}
          <Input
            id="client-username"
            name="username"
            type="text"
            autoComplete="username"
            aria-required
            aria-invalid={Boolean(fieldErrors.username)}
            aria-describedby={fieldErrors.username ? 'client-username-error' : undefined}
            placeholder={t('usernamePlaceholder')}
            icon="person"
          />
          {fieldErrors.username ? (
            <FieldError id="client-username-error">{t(fieldErrors.username)}</FieldError>
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

        <AuthFormMessage state={state} />

        <AuthSubmitButton label={t('portalSubmit')} />
      </form>
    </div>
  );
}
