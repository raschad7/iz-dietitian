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
 * The app bar has no fill, so this is an ordinary secondary button on the
 * canvas — no inverted variant needed.
 *
 * `outline` rather than `ghost`, and that is a dimensions fix as much as a
 * visual one: the ghost compound variant drops horizontal padding to 12px,
 * so a ghost sign-out was the one control in the bar not built to the button
 * spec's 20px. It now carries the standard box, the standard padding and the
 * 40px toolbar height — the same height the notification bell beside it uses
 * (`icon-sm`), so the whole row sits on one line.
 */
function SignOutSubmit() {
  const t = useTranslations('common');
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      <Icon name="signOut" />
      {pending ? t('loading') : t('signOut')}
    </Button>
  );
}
