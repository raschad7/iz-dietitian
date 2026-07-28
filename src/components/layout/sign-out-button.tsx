'use client';

import { LogOutIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useFormStatus } from 'react-dom';

import { signOutAction } from '@/components/auth/actions';
import { type Locale } from '@/i18n/routing';

/**
 * A real form posting to a server action, not a client-side `authClient.signOut`
 * call: the session cookie is httpOnly and cleared server side, and this keeps
 * working if JavaScript hasn't loaded.
 */
export function SignOutButton({ locale }: { locale: Locale }) {
  return (
    <form action={signOutAction}>
      <input type="hidden" name="locale" value={locale} />
      <SignOutSubmit />
    </form>
  );
}

function SignOutSubmit() {
  const t = useTranslations('common');
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-start text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground disabled:opacity-50"
    >
      <LogOutIcon className="size-4 shrink-0" />
      {pending ? t('loading') : t('signOut')}
    </button>
  );
}
