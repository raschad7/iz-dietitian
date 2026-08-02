'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Segmented } from '@/components/ui/segmented';
import { ClientLoginForm } from '@/features/auth/components/client-login-form';
import { StaffLoginForm } from '@/features/auth/components/staff-login-form';
import { type Locale } from '@/i18n/routing';

/**
 * TEMPORARY — remove once sign-in is unified.
 *
 * The intended flow is one form: whoever signs in is looked up, their role is
 * read off the account, and they land in the dietitian area or the portal
 * accordingly. Until that exists, staff and clients authenticate through two
 * different Better Auth paths — email + password versus username + password —
 * so the page has to know which one to post to before anything is typed.
 *
 * This asks. Two options, no persistence, nothing server-side: it only decides
 * which of the two existing forms is mounted. Deleting this component and
 * rendering `StaffLoginForm` alone restores the previous page exactly.
 */

type LoginRoleSwitchProps = {
  locale: Locale;
  showGoogle: boolean;
  redirectTo?: string;
  oauthError?: string;
};

type Role = 'staff' | 'client';

const ROLES = [
  { value: 'staff', labelKey: 'roleStaff' },
  { value: 'client', labelKey: 'roleClient' },
] as const satisfies readonly { value: Role; labelKey: string }[];

export function LoginRoleSwitch({ locale, showGoogle, redirectTo, oauthError }: LoginRoleSwitchProps) {
  const t = useTranslations('login');
  const [role, setRole] = useState<Role>('staff');

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-medium">{t('roleQuestion')}</p>

        {/*
          A radiogroup, not a tablist: this picks which form to fill in, not
          which view of the same content to show.
        */}
        <Segmented
          role="radiogroup"
          label={t('roleQuestion')}
          value={role}
          onChange={setRole}
          className="grid w-full grid-cols-2"
          options={ROLES.map((option) => ({
            value: option.value,
            label: t(option.labelKey),
          }))}
        />

        <p className="text-caption text-muted-foreground">{t('roleTemporaryNote')}</p>
      </div>

      {role === 'staff' ? (
        <StaffLoginForm
          locale={locale}
          showGoogle={showGoogle}
          redirectTo={redirectTo}
          oauthError={oauthError}
        />
      ) : (
        <ClientLoginForm locale={locale} />
      )}
    </div>
  );
}
