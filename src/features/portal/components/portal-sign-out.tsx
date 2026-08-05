'use client';

import { LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useFormStatus } from 'react-dom';

import { signOutAction } from '@/features/auth/actions';
import { type Locale } from '@/i18n/routing';

/**
 * Sign-out as a row in the client portal's drawer.
 *
 * A portal-local component rather than a reuse of
 * `@/components/layout/sign-out-button`: that one is styled for the
 * practitioner sidebar (`text-sidebar-foreground`, `hover:bg-sidebar-accent`)
 * and is rendered inside it, so restyling it to fit here would change the
 * dashboard's chrome. The behaviour — a real form posting to the same server
 * action — is deliberately identical; only the surface differs.
 *
 * **Not clay.** The design supplied this row in red alongside "delete my
 * account", but clay is the system's only true alarm colour and signing out is
 * an everyday, reversible act. It reads as ordinary ink; the row underneath it
 * is the one that earns the warning.
 */
export function PortalSignOut({ locale }: { locale: Locale }) {
  return (
    <form action={signOutAction}>
      <input type="hidden" name="locale" value={locale} />
      <PortalSignOutSubmit />
    </form>
  );
}

function PortalSignOutSubmit() {
  const t = useTranslations('common');
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-start text-sm transition-colors hover:bg-muted disabled:opacity-50"
    >
      <LogOut className="size-5 shrink-0 text-muted-foreground rtl:-scale-x-100" strokeWidth={1.7} aria-hidden="true" />
      {pending ? t('loading') : t('signOut')}
    </button>
  );
}
