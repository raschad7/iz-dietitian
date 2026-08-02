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
export function SignOutButton({ locale }: { locale: Locale }) {
  return (
    <form action={signOutAction}>
      <input type="hidden" name="locale" value={locale} />
      <SignOutSubmit />
    </form>
  );
}

/**
 * The app bar has no fill, so this is an ordinary tertiary button on the
 * canvas — no inverted variant needed.
 */
function SignOutSubmit() {
  const t = useTranslations('common');
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="ghost" size="sm" disabled={pending}>
      <Icon name="signOut" />
      {pending ? t('loading') : t('signOut')}
    </Button>
  );
}
