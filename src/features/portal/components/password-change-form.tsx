'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { changePortalPassword } from '@/features/auth/actions';
import { AuthFormMessage, AuthSubmitButton } from '@/features/auth/components/form-parts';
import { PasswordInput } from '@/features/auth/components/password-input';
import { initialAuthState } from '@/features/auth/form-state';
import { CLIENT_MIN_PASSWORD_LENGTH } from '@/features/auth/password-policy';
import { type Locale } from '@/i18n/routing';

/**
 * Changing the password in place, proven by the current one.
 *
 * Replaces the reset-link flow that used to live on this screen: that flow
 * mailed a link to the account's sign-in address, which for a portal client is
 * a synthetic `@portal.invalid` address that can never receive mail — see
 * `syntheticEmail` in `src/features/clients/portal-credentials.ts`. A signed-in
 * client can prove who they are right here instead, by typing the password
 * they already hold.
 *
 * The `key` below remounts the form — and with it every `PasswordInput`'s own
 * reveal state — the moment a change succeeds, so three password values do not
 * sit typed-out in the DOM after the job they were needed for is done.
 */
export function PasswordChangeForm({ locale }: { locale: Locale }) {
  const t = useTranslations('login');
  const tSecurity = useTranslations('portal.settings.security');

  const [state, formAction] = useActionState(changePortalPassword, initialAuthState);

  return (
    <form
      key={state.status === 'success' ? 'changed' : 'change'}
      action={formAction}
      className="space-y-4"
    >
      <input type="hidden" name="locale" value={locale} />

      <PasswordInput
        name="currentPassword"
        label={tSecurity('currentPasswordLabel')}
        autoComplete="current-password"
      />

      <PasswordInput
        name="newPassword"
        label={tSecurity('newPasswordLabel')}
        autoComplete="new-password"
        minLength={CLIENT_MIN_PASSWORD_LENGTH}
        hint={t('passwordStrengthHint', { count: CLIENT_MIN_PASSWORD_LENGTH })}
      />

      <PasswordInput
        name="confirmNewPassword"
        label={tSecurity('confirmNewPasswordLabel')}
        autoComplete="new-password"
        minLength={CLIENT_MIN_PASSWORD_LENGTH}
      />

      <AuthFormMessage state={state} />

      <AuthSubmitButton label={tSecurity('changePasswordSubmit')} />
    </form>
  );
}
