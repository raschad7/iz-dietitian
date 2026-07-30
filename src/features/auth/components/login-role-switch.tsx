'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { ClientLoginForm } from '@/features/auth/components/client-login-form';
import { StaffLoginForm } from '@/features/auth/components/staff-login-form';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

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

        <div
          role="radiogroup"
          aria-label={t('roleQuestion')}
          className="grid grid-cols-2 gap-1 rounded-lg border border-border p-1"
        >
          {ROLES.map((option) => {
            const active = option.value === role;

            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setRole(option.value)}
                className={cn(
                  'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {t(option.labelKey)}
              </button>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground">{t('roleTemporaryNote')}</p>
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
