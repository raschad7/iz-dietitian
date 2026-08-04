'use client';

import { useTranslations } from 'next-intl';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { signOutAction } from '@/features/auth/actions';
import { type Locale } from '@/i18n/routing';

/**
 * A real form posting to a server action, not a client-side `authClient.signOut`
 * call: the session cookie is httpOnly and cleared server side, and this keeps
 * working if JavaScript hasn't loaded.
 */
export function SignOutButton({ locale, className }: { locale: Locale; className?: string }) {
  return (
    <form action={signOutAction}>
      <input type="hidden" name="locale" value={locale} />
      <SignOutSubmit className={className} />
    </form>
  );
}

/**
 * `destructive` — a clay outline, never a solid red block. Ending a session is
 * not a delete, but it is the one control in the shell that undoes your way in,
 * and on the pale olive rail an olive `outline` button read as one more
 * destination. The clay edge separates it from the navigation above it without
 * shouting; the variant stays outlined for the same reason a delete does.
 *
 * `sm` is the 40px compact size, which matches the language switcher stacked
 * directly above it.
 */
function SignOutSubmit({ className }: { className?: string }) {
  const t = useTranslations('common');
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="destructive" size="sm" disabled={pending} className={className}>
      <Icon name="signOut" />
      {pending ? t('loading') : t('signOut')}
    </Button>
  );
}
